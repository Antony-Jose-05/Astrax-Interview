/**
 * content.ts — WXT Content Script
 *
 * Responsibilities:
 *  1. Detect if the current page is a Google Meet or Zoom meeting.
 *  2. Capture microphone audio via getUserMedia + MediaRecorder.
 *  3. Slice audio into 2-second chunks and forward each to the
 *     background script as an AUDIO_CHUNK message.
 */

type MeetingPlatform = "google_meet" | "zoom" | null;

function detectPlatform(): MeetingPlatform {
  const { hostname, pathname } = window.location;

  if (hostname === "meet.google.com" && pathname.length > 1) {
    return "google_meet";
  }
  if (hostname.endsWith("zoom.us") && pathname.startsWith("/j/")) {
    return "zoom";
  }
  return null;
}

const CHUNK_INTERVAL_MS = 2_000;
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";

let mediaStream: MediaStream | null = null;
let sequenceId = 0;
let isRecording = false;

function recordChunk(): void {
  if (!mediaStream || !isRecording) return;

  const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
    ? AUDIO_MIME_TYPE
    : "";

  const recorder = new MediaRecorder(
    mediaStream,
    mimeType ? { mimeType } : {}
  );

  const chunks: Blob[] = [];

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = async () => {
    const currentId = sequenceId++;

    const blob = new Blob(chunks, {
      type: mimeType || "audio/webm",
    });

    console.log(
      `[content] Chunk complete | seq=${currentId} | size=${blob.size}B | mime=${blob.type}`
    );

    if (blob.size === 0) {
      console.warn(`[content] Empty blob for seq=${currentId} — skipping.`);
    } else {
      const buffer = await blob.arrayBuffer();
      chrome.runtime.sendMessage(
        {
          type: "AUDIO_CHUNK",
          audio: { buffer, mimeType: blob.type },
          sequence_id: currentId,
          speaker: "candidate",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              `[content] sendMessage error for seq=${currentId}:`,
              chrome.runtime.lastError.message
            );
          } else {
            console.log(`[content] Background ack for seq=${currentId}:`, response);
          }
        }
      );
    }

    recordChunk();
  };

  recorder.onerror = (e) => console.error("[content] MediaRecorder error:", e);
  recorder.start();
  console.log(`[content] Recording window started (${CHUNK_INTERVAL_MS}ms)…`);

  setTimeout(() => {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }, CHUNK_INTERVAL_MS);
}

async function startRecording(): Promise<void> {
  console.log("[content] Requesting microphone access…");
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16_000,
      },
      video: false,
    });
  } catch (err) {
    console.error("[content] getUserMedia failed:", err);
    return;
  }

  console.log("[content] Microphone access granted. Starting independent-chunk recorder.");
  isRecording = true;
  recordChunk();
}

function stopRecording(): void {
  isRecording = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => {
      track.stop();
    });
    mediaStream = null;
  }
  console.log("[content] Recording stopped.");
}

export default defineContentScript({
  // Active on Google Meet and Zoom only
  matches: ["*://meet.google.com/*", "*://*.zoom.us/j/*"],

  async main() {
    const platform = detectPlatform();

    if (!platform) {
      console.log(`[content] Not a supported meeting page (${window.location.href}). Exiting.`);
      return;
    }

    console.log(`[content] Meeting platform detected: ${platform}`);
    await startRecording();

    window.addEventListener("beforeunload", () => {
      console.log("[content] Page unloading — stopping recording.");
      stopRecording();
    });
  },
});
