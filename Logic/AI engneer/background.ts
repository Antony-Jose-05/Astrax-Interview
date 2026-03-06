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

// ─────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────

/** Holds the most recently uploaded resume payload. */
let storedResume: any = null;

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Rebuilds a Blob from the serialised { buffer, mimeType } object
 * that content.ts sends over the chrome message bus (Blobs are not
 * directly cloneable via sendMessage).
 */
function rebuildBlob(audio: { buffer: ArrayBuffer; mimeType: string }): Blob {
  return new Blob([audio.buffer], { type: audio.mimeType || "audio/webm" });
}

/**
 * Pushes AI results to the popup (if it is open).
 * Swallows the "no receiving end" error that fires when the popup is closed —
 * this is expected and harmless.
 */
function broadcastAIResult(payload: AIResultMessage): void {
  const message: AIResultMessage = {
    type: "AI_RESULT",
    questions: payload.questions,
    alerts: payload.alerts,
    score: payload.score,
  };

  chrome.runtime.sendMessage(message, () => {
    if (chrome.runtime.lastError) {
      // Popup is closed — not an error worth logging loudly.
      console.debug(
        "[background] Popup not open, AI result not delivered:",
        chrome.runtime.lastError.message
      );
    } else {
      console.log("[background] AI result delivered to popup.");
    }
  });
}

/**
 * Broadcasts the raw transcript to the popup for live display.
 */
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

/**
 * Full processing pipeline for one audio chunk:
 *   audio → /transcribe → /analyze-answer → popup
 */
async function handleAudioChunk(
  audio: { buffer: ArrayBuffer; mimeType: string },
  sequenceId: number,
  speaker: string
): Promise<void> {
  console.log(
    `[background] Processing audio chunk | seq=${sequenceId} | speaker=${speaker}`
  );

  // ── Step 1: Transcribe ───────────────────────────────────────────────
  let transcript: string;

  try {
    const audioBlob = rebuildBlob(audio);
    console.log(
      `[background] Sending audio to /transcribe | seq=${sequenceId} | size=${audioBlob.size}B`
    );

    const transcribeResponse = await sendAudio(audioBlob, sequenceId, speaker);
    transcript = transcribeResponse.transcript;

    console.log(
      `[background] Transcript received for seq=${sequenceId}: "${transcript}"`
    );
  } catch (err) {
    if (err instanceof ApiError) {
      console.error(
        `[background] /transcribe failed (HTTP ${err.status}):`,
        err.message
      );
    } else {
      console.error("[background] /transcribe network error:", err);
    }
    return; // Cannot continue without a transcript
  }

  // Forward transcript to popup immediately for live display
  broadcastTranscript(transcript);

  // ── Step 2: Analyze ──────────────────────────────────────────────────
  if (!storedResume) {
    console.warn(
      "[background] No resume data stored yet — skipping /analyze-answer."
    );
    return;
  }

  let aiResult: AIResultMessage;

  try {
    console.log(
      `[background] Sending transcript to /analyze-answer | seq=${sequenceId}`
    );

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
      console.error(
        `[background] /analyze-answer failed (HTTP ${err.status}):`,
        err.message
      );
    } else {
      console.error("[background] /analyze-answer network error:", err);
    }
    return;
  }

  // ── Step 3: Broadcast to popup ───────────────────────────────────────
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
      // ── Audio chunk from content script ─────────────────────────────
      case "AUDIO_CHUNK": {
        const { audio, sequence_id, speaker } = message as any;

        if (!audio?.buffer) {
          console.warn(
            `[background] AUDIO_CHUNK seq=${sequence_id} has no buffer — ignoring.`
          );
          sendResponse({ ok: false, reason: "missing audio buffer" });
          return false;
        }

        // Kick off async pipeline; respond immediately so the message
        // channel isn't held open (returning true would keep it open).
        handleAudioChunk(audio, sequence_id, speaker).catch((err) =>
          console.error("[background] Unhandled pipeline error:", err)
        );

        sendResponse({ ok: true, sequence_id });
        return false; // synchronous response already sent
      }

      // ── Resume data from popup ───────────────────────────────────────
      case "RESUME_DATA": {
        storedResume = message.data;
        console.log(
          "[background] Resume data stored:",
          JSON.stringify(storedResume).slice(0, 120) + "…"
        );
        sendResponse({ ok: true });
        return false;
      }

      // ── Unknown message type ─────────────────────────────────────────
      default: {
        console.warn("[background] Unknown message type:", (message as any).type);
        sendResponse({ ok: false, reason: "unknown message type" });
        return false;
      }
    }
  }
);

// ─────────────────────────────────────────────
// Service worker lifecycle
// ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log(
    `[background] Extension installed | reason=${details.reason} | ` +
      `version=${chrome.runtime.getManifest().version}`
  );
});

console.log("[background] Service worker initialised and ready.");
