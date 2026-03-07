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

import { sendAudio, analyzeAnswer, ApiError } from "../utils/api";
import type {
  ExtensionMessage,
  AIResultMessage,
  TranscriptMessage,
} from "../utils/messages";

export default defineBackground(() => {
  // ─────────────────────────────────────────────
  // In-memory state
  // ─────────────────────────────────────────────

  /** Holds the most recently uploaded resume payload. */
  let storedResume: any = null;
  /** Accumulates the entire session transcript. */
  let fullTranscript: string = "";
  /** Keeps track of the last processed transcript for AI to avoid duplicate analysis. */
  let lastAnalyzedLength: number = 0;

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  function dataUrlToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || "audio/webm";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  function broadcastAIResult(payload: AIResultMessage): void {
    console.log("[background] Broadcasting AI_RESULT to UI...");
    const message: AIResultMessage = {
      type: "AI_RESULT",
      questions: payload.questions,
      alerts: payload.alerts,
      score: payload.score,
    };

    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        console.debug(
          "[background] UI not open, AI result not delivered.",
        );
      } else {
        console.log("[background] AI_RESULT delivered successfully.");
      }
    });
  }

  function broadcastTranscript(text: string, speaker: string = "candidate") {
    console.log(`[background] Broadcasting TRANSCRIPT: "${text.slice(0, 30)}..." from ${speaker}`);
    chrome.runtime.sendMessage({
      type: "TRANSCRIPT",
      text: text,
      speaker: speaker
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.debug("[background] Transcript broadcast failed (UI closed).");
      } else {
        console.log("[background] Transcript broadcast successful.");
      }
    });
  }

  // ─────────────────────────────────────────────
  // Core pipeline
  // ─────────────────────────────────────────────

  async function handleAudioChunk(
    audioBlob: Blob,
    sequenceId: number,
    speaker: string
  ): Promise<void> {
    console.log(
      `[background] Processing audio chunk | seq=${sequenceId} | size=${audioBlob.size}B | speaker=${speaker}`
    );

    // ── Step 1: Transcribe ──────────────────────────────────────────────
    let transcript: string;

    try {
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

    if (!transcript || transcript.trim().length === 0) {
      console.log(`[background] Empty transcript for seq=${sequenceId} — skipping broadcast and analysis.`);
      return;
    }

    const hallucinations = [
      "Thank you.", "Thank you", "Breathe.", "Breathe", "Okay.", "Hi, thank you.", "Hi, thank you", 
      "Bye.", "Wait, let's pause.", "I'm sure you can stop recording.", "You", "Thank you for watching.",
      "So", "So.", "And", "And.", "Uh", "Um", "Yeah", "Yeah."
    ];
    const cleanTranscript = transcript.trim();
    if (hallucinations.some(h => cleanTranscript === h)) {
       console.log(`[background] Hallucination detected for seq=${sequenceId}: "${cleanTranscript}" — skipping.`);
       return;
    }

    // Append to full transcript
    // Since audio is mixed, we don't know for sure who's talking, but AI can figure it out.
    // For now, we'll just store the raw text or prefix with 'Interview'
    fullTranscript += `${cleanTranscript}\n`;
    
    broadcastTranscript(cleanTranscript, "mixed");

    // ── Step 2: Analyze ────────────────────────────────────────────────
    // Only analyze if the transcript has grown significantly (e.g. 200+ chars)
    // AND total length is enough to be meaningful (at least 300 chars)
    const MIN_LENGTH_THRESHOLD = 300;
    const GROWTH_THRESHOLD = 200;

    if (fullTranscript.length < MIN_LENGTH_THRESHOLD) {
      console.log(`[background] Transcript too short (${fullTranscript.length} chars) for AI analysis.`);
      return;
    }

    if (lastAnalyzedLength > 0 && fullTranscript.length - lastAnalyzedLength < GROWTH_THRESHOLD) {
      console.log(`[background] Transcript growth too small (${fullTranscript.length - lastAnalyzedLength} chars) for new AI analysis.`);
      return;
    }
    if (!storedResume) {
      console.warn("[background] No resume data stored yet — skipping /analyze-answer.");
      return;
    }

    let aiResult: AIResultMessage;

    try {
      const resumeToPass = storedResume.resume || storedResume;
      const analysis = await analyzeAnswer(fullTranscript, resumeToPass);
      lastAnalyzedLength = fullTranscript.length;
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
          const { audioDataUrl, sequence_id, speaker } = message as any;

          if (!audioDataUrl) {
            sendResponse({ ok: false, reason: "missing audioDataUrl" });
            return false;
          }

          try {
            const blob = dataUrlToBlob(audioDataUrl);
            handleAudioChunk(blob, sequence_id, speaker)
              .then(() => sendResponse({ ok: true, sequence_id }))
              .catch((err) => {
                console.error("[background] Unhandled pipeline error:", err);
                sendResponse({ ok: false, error: err.message });
              });
          } catch (err) {
            console.error("[background] Failed to decode audioDataUrl:", err);
            sendResponse({ ok: false, error: "decode_failed" });
          }
          
          return true; // Keep channel open for async handleAudioChunk
        }

        case "RESUME_DATA": {
          storedResume = message.data;
          console.log("[background] Resume data stored successfully.");
          // Broadcast to all parts (e.g. sidepanel)
          chrome.runtime.sendMessage({ type: "RESUME_DATA", data: storedResume }).catch(() => {
             // Ignore error if sidepanel is closed
          });
          sendResponse({ ok: true });
          return false;
        }

        case "GET_STATUS": {
          sendResponse({ 
            ok: true, 
            storedResume,
          });
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

  chrome.runtime.onInstalled.addListener(() => {
    chrome.sidePanel
      .setOptions({ path: 'sidepanel.html', enabled: true })
      .catch((error) => console.error(error));
  });

  // Open side panel on action click
  chrome.sidePanel.setOptions({
    path: 'sidepanel.html',
    enabled: true
  });
  
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
  });

  console.log("[background] Service worker initialised and ready (SidePanel enabled).");
});
