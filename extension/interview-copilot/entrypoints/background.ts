/**
 * background.ts — WXT Background Service Worker
 *
 * Responsibilities:
 *  1. Receive AUDIO_CHUNK messages from the content script.
 *  2. Forward audio to /transcribe → receive transcript.
 *  3. Forward transcript + stored resume to /analyze-answer → receive AI results.
 *  4. Broadcast AI results to the popup via chrome.runtime.sendMessage.
 *  5. Receive and store RESUME_DATA from the popup.
 */

import { sendAudio, analyzeAnswer, ApiError } from "./api";
import type {
  ExtensionMessage,
  AIResultMessage,
  TranscriptMessage,
} from "./messages";

export default defineBackground(() => {
  // ─────────────────────────────────────────────
  // In-memory state
  // ─────────────────────────────────────────────

  /** Holds the most recently uploaded resume payload. */
  let storedResume: any = null;

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  function rebuildBlob(audio: { buffer: ArrayBuffer; mimeType: string }): Blob {
    return new Blob([audio.buffer], { type: audio.mimeType || "audio/webm" });
  }

  function broadcastAIResult(payload: AIResultMessage): void {
    const message: AIResultMessage = {
      type: "AI_RESULT",
      questions: payload.questions,
      alerts: payload.alerts,
      score: payload.score,
    };

    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        console.debug(
          "[background] Popup not open, AI result not delivered:",
          chrome.runtime.lastError.message
        );
      } else {
        console.log("[background] AI result delivered to popup.");
      }
    });
  }

  function broadcastTranscript(transcript: string): void {
    const message: TranscriptMessage = { type: "TRANSCRIPT", transcript };
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        console.debug(
          "[background] Popup not open, transcript not delivered:",
          chrome.runtime.lastError.message
        );
      }
    });
  }

  // ─────────────────────────────────────────────
  // Core pipeline
  // ─────────────────────────────────────────────

  async function handleAudioChunk(
    audio: { buffer: ArrayBuffer; mimeType: string },
    sequenceId: number,
    speaker: string
  ): Promise<void> {
    console.log(
      `[background] Processing audio chunk | seq=${sequenceId} | speaker=${speaker}`
    );

    // ── Step 1: Transcribe ──────────────────────────────────────────────
    let transcript: string;

    try {
      const audioBlob = rebuildBlob(audio);
      const transcribeResponse = await sendAudio(audioBlob, sequenceId, speaker);
      transcript = transcribeResponse.transcript;
      console.log(`[background] Transcript received for seq=${sequenceId}: "${transcript}"`);
    } catch (err) {
      if (err instanceof ApiError) {
        console.error(`[background] /transcribe failed (HTTP ${err.status}):`, err.message);
      } else {
        console.error("[background] /transcribe network error:", err);
      }
      return;
    }

    broadcastTranscript(transcript);

    // ── Step 2: Analyze ────────────────────────────────────────────────
    if (!storedResume) {
      console.warn("[background] No resume data stored yet — skipping /analyze-answer.");
      return;
    }

    let aiResult: AIResultMessage;

    try {
      const analysis = await analyzeAnswer(transcript, storedResume);
      aiResult = {
        type: "AI_RESULT",
        questions: analysis.follow_up_questions,
        alerts: analysis.contradictions,
        score: analysis.score,
      };
      console.log(
        `[background] AI result received | seq=${sequenceId} | score=${aiResult.score} | ` +
        `questions=${aiResult.questions.length} | alerts=${aiResult.alerts.length}`
      );
    } catch (err) {
      if (err instanceof ApiError) {
        console.error(`[background] /analyze-answer failed (HTTP ${err.status}):`, err.message);
      } else {
        console.error("[background] /analyze-answer network error:", err);
      }
      return;
    }

    broadcastAIResult(aiResult);
  }

  // ─────────────────────────────────────────────
  // Message listener
  // ─────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage & { audio?: { buffer: ArrayBuffer; mimeType: string } },
      sender,
      sendResponse
    ) => {
      console.log(
        `[background] Message received | type=${message.type} | ` +
        `from=${sender.tab ? `tab#${sender.tab.id}` : "extension"}`
      );

      switch (message.type) {
        case "AUDIO_CHUNK": {
          const { audio, sequence_id, speaker } = message as any;

          if (!audio?.buffer) {
            sendResponse({ ok: false, reason: "missing audio buffer" });
            return false;
          }

          handleAudioChunk(audio, sequence_id, speaker).catch((err) =>
            console.error("[background] Unhandled pipeline error:", err)
          );
          sendResponse({ ok: true, sequence_id });
          return false;
        }

        case "RESUME_DATA": {
          storedResume = message.data;
          console.log("[background] Resume data stored:", JSON.stringify(storedResume).slice(0, 120) + "…");
          sendResponse({ ok: true });
          return false;
        }

        default: {
          console.warn("[background] Unknown message type:", (message as any).type);
          sendResponse({ ok: false, reason: "unknown message type" });
          return false;
        }
      }
    }
  );

  chrome.runtime.onInstalled.addListener((details) => {
    console.log(`[background] Extension installed | reason=${details.reason}`);
  });

  console.log("[background] Service worker initialised and ready.");
});
