/**
 * content.ts — WXT Content Script
 *
 * Responsibilities:
 *  1. Detect if the current page is a Google Meet or Zoom meeting.
 *  2. Capture microphone audio via getUserMedia + MediaRecorder.
 *  3. Slice audio into 2-second chunks and forward each to the
 *     background script as an AUDIO_CHUNK message.
 */


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

const CHUNK_INTERVAL_MS = 2_000; // duration of each standalone WebM file
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus"; // broad browser support

let mediaStream: MediaStream | null = null;
let sequenceId = 0;
let isRecording = false; // guards the recursive stop/start loop

/**
 * WHY STOP/START INSTEAD OF timeslice?
 *
 * Chrome's MediaRecorder emits a valid WebM header only in the FIRST
 * ondataavailable chunk when using MediaRecorder.start(timeslice).
 * Every subsequent chunk is a raw continuation fragment that STT
 * services cannot parse as a standalone file.
 *
 * Fix: spin up a fresh MediaRecorder for every 2-second window so that
 * each Blob begins with its own valid WebM EBML header.
 */

/**
 * Records exactly CHUNK_INTERVAL_MS of audio, assembles a complete
 * standalone WebM Blob, ships it to the background script, then
 * immediately starts the next recording cycle — as long as isRecording
 * is still true.
 */
function recordChunk(): void {
  if (!mediaStream || !isRecording) return;

  // Prefer the requested codec; fall back gracefully if unsupported.
  const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
    ? AUDIO_MIME_TYPE
    : "";

  const recorder = new MediaRecorder(
    mediaStream,
    mimeType ? { mimeType } : {}
  );

  const chunks: Blob[] = [];

  // Collect all data fragments emitted during this recording window.
  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // onstop fires after recorder.stop() — all fragments are guaranteed
  // to be in `chunks` at this point.
  recorder.onstop = async () => {
    const currentId = sequenceId++;

    // Combine fragments into ONE complete, self-contained WebM file.
    const blob = new Blob(chunks, {
      type: mimeType || "audio/webm",
    });

    console.log(
      `[content] Chunk complete | seq=${currentId} | size=${blob.size}B | mime=${blob.type}`
    );

    if (blob.size === 0) {
      console.warn(`[content] Empty blob for seq=${currentId} — skipping.`);
    } else {
      // Blobs are not structured-cloneable; serialise to ArrayBuffer.
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
            console.log(
              `[content] Background ack for seq=${currentId}:`,
              response
            );
          }
        }
      );
    }

    // Kick off the next standalone recording window immediately.
    recordChunk();
  };

  recorder.onerror = (e) =>
    console.error("[content] MediaRecorder error:", e);

  recorder.start(); // no timeslice — collect all data until stop()
  console.log(`[content] Recording window started (${CHUNK_INTERVAL_MS}ms)…`);

  // Schedule the stop; onstop will chain the next recordChunk() call.
  setTimeout(() => {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }, CHUNK_INTERVAL_MS);
}

/**
 * Requests microphone access and kicks off the first recording window.
 */
async function startRecording(): Promise<void> {
  console.log("[content] Requesting microphone access…");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16_000, // 16 kHz is standard for STT pipelines
      },
      video: false,
    });
  } catch (err) {
    console.error("[content] getUserMedia failed:", err);
    return;
  }

  console.log(
    "[content] Microphone access granted. Starting independent-chunk recorder."
  );

  isRecording = true;
  recordChunk(); // begin the first 2-second window
}

/**
 * Signals the recording loop to stop after the current window finishes,
 * then releases all microphone tracks.
 */
function stopRecording(): void {
  isRecording = false; // prevents recordChunk() from re-scheduling itself

  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => {
      track.stop();
      console.log(`[content] Media track released: ${track.kind} (${track.id})`);
    });
    mediaStream = null;
  }

  console.log("[content] Recording stopped.");
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
