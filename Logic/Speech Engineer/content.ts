/**
 * content.ts — WXT Content Script
 *
 * Responsibilities:
 *  1. Detect if the current page is a Google Meet or Zoom meeting.
 *  2. Capture microphone audio via getUserMedia + MediaRecorder.
 *  3. Slice audio into 2-second chunks and forward each to the
 *     background script as an AUDIO_CHUNK message.
 */

import type { AudioChunkMessage } from "./messages";

// ─────────────────────────────────────────────
// Platform detection
// ─────────────────────────────────────────────

type MeetingPlatform = "google_meet" | "zoom" | null;

/**
 * Inspects the current URL and returns the detected meeting platform,
 * or null if the page is not a supported meeting.
 */
function detectPlatform(): MeetingPlatform {
  const { hostname, pathname } = window.location;

  if (hostname === "meet.google.com" && pathname.length > 1) {
    // meet.google.com/<room-code>
    return "google_meet";
  }

  if (hostname.endsWith("zoom.us") && pathname.startsWith("/j/")) {
    // zoom.us/j/<meeting-id>
    return "zoom";
  }

  return null;
}

// ─────────────────────────────────────────────
// Audio recording
// ─────────────────────────────────────────────

const CHUNK_INTERVAL_MS = 2_000; // emit a chunk every 2 seconds
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus"; // broad browser support

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let sequenceId = 0;

/**
 * Requests microphone access, wires up MediaRecorder, and starts
 * emitting AUDIO_CHUNK messages to the background script.
 */
async function startRecording(): Promise<void> {
  console.log("[content] Requesting microphone access…");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16_000, // 16 kHz is typical for STT pipelines
      },
      video: false,
    });
  } catch (err) {
    console.error("[content] getUserMedia failed:", err);
    return;
  }

  console.log("[content] Microphone access granted. Starting MediaRecorder.");

  // Prefer the explicit MIME type; fall back to browser default if unsupported.
  const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
    ? AUDIO_MIME_TYPE
    : "";

  mediaRecorder = new MediaRecorder(mediaStream, {
    ...(mimeType ? { mimeType } : {}),
  });

  // ── ondataavailable fires every CHUNK_INTERVAL_MS ──────────────────────
  mediaRecorder.ondataavailable = (event: BlobEvent) => {
    if (!event.data || event.data.size === 0) {
      console.warn("[content] Received empty audio chunk — skipping.");
      return;
    }

    const currentId = sequenceId++;

    console.log(
      `[content] Audio chunk ready | seq=${currentId} | size=${event.data.size}B | mime=${event.data.type}`
    );

    const message: AudioChunkMessage = {
      type: "AUDIO_CHUNK",
      audio: event.data,
      sequence_id: currentId,
      speaker: "candidate",
    };

    // Blobs are not directly serialisable over the chrome message bus.
    // Convert to an ArrayBuffer first; the background script reassembles
    // it into a Blob with the correct MIME type.
    event.data.arrayBuffer().then((buffer) => {
      chrome.runtime.sendMessage(
        {
          ...message,
          // Replace Blob with a plain transferable object
          audio: { buffer, mimeType: event.data.type },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[content] sendMessage error:",
              chrome.runtime.lastError.message
            );
          } else {
            console.log(
              `[content] Background ack for seq=${currentId}:`,
              response
            );
          }
        }
      );
    });
  };

  // ── lifecycle logs ────────────────────────────────────────────────────
  mediaRecorder.onstart = () =>
    console.log("[content] MediaRecorder started.");

  mediaRecorder.onstop = () =>
    console.log("[content] MediaRecorder stopped.");

  mediaRecorder.onerror = (event) =>
    console.error("[content] MediaRecorder error:", event);

  // Start recording; raise a dataavailable event every CHUNK_INTERVAL_MS
  mediaRecorder.start(CHUNK_INTERVAL_MS);
  console.log(
    `[content] Recording… chunks every ${CHUNK_INTERVAL_MS / 1_000}s.`
  );
}

/**
 * Cleanly stops the MediaRecorder and releases the microphone track.
 */
function stopRecording(): void {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    console.log("[content] MediaRecorder stopped by cleanup.");
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => {
      track.stop();
      console.log(`[content] Media track stopped: ${track.kind} (${track.id})`);
    });
    mediaStream = null;
  }

  mediaRecorder = null;
}

// ─────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────

(async () => {
  const platform = detectPlatform();

  if (!platform) {
    console.log(
      `[content] Not a supported meeting page (${window.location.href}). Exiting.`
    );
    return;
  }

  console.log(`[content] Meeting platform detected: ${platform}`);
  await startRecording();

  // Stop recording when the tab is closed or navigated away.
  window.addEventListener("beforeunload", () => {
    console.log("[content] Page unloading — stopping recording.");
    stopRecording();
  });
})();
