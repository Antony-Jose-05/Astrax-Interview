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

const CHUNK_INTERVAL_MS = 5_000;
const AUDIO_MIME_TYPE = "audio/webm;codecs=opus";

let micStream: MediaStream | null = null;
let tabAudioStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let mixedDestination: MediaStreamAudioDestinationNode | null = null;
let sequenceId = 0;
let isRecording = false;

function recordStream(stream: MediaStream): void {
  if (!isRecording) return;

  const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)
    ? AUDIO_MIME_TYPE
    : "";

  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : {}
  );

  const chunks: Blob[] = [];

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data.size > 0) {
      console.log(`[content] Audio data available: ${e.data.size} bytes`);
      chunks.push(e.data);
    }
  };

  recorder.onstop = async () => {
    const currentId = sequenceId++;

    const blob = new Blob(chunks, {
      type: mimeType || "audio/webm",
    });

    console.log(
      `[content] Mixed chunk complete | seq=${currentId} | size=${blob.size}B`
    );

    if (blob.size < 500) { 
      console.warn(`[content] Chunk too small (${blob.size}B) — likely empty header. Skipping.`);
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        chrome.runtime.sendMessage(
          {
            type: "AUDIO_CHUNK",
            audioDataUrl: dataUrl,
            sequence_id: currentId,
            speaker: "mixed", // Unified tag for the simplified pipeline
          },
          (response) => {
             if (chrome.runtime.lastError) {
               console.debug(`[content] Broadcast error:`, chrome.runtime.lastError.message);
             }
          }
        );
      };
      reader.readAsDataURL(blob);
    }

    if (isRecording) {
      setTimeout(() => recordStream(stream), 100); 
    }
  };

  recorder.onerror = (e) => console.error(`[content] Mixed recorder error:`, e);
  recorder.start();

  setTimeout(() => {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  }, CHUNK_INTERVAL_MS);
}

async function startRecording(): Promise<void> {
  console.log("[content] Initializing Mixed-Audio Pipeline (Mic + Tab)…");
  
  try {
    // 1. Get Microphone
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    console.log("[content] Microphone access granted.");

    // 2. Get Tab Audio
    tabAudioStream = await (navigator.mediaDevices as any).getDisplayMedia({
      video: { 
        displaySurface: "browser",
        width: { max: 1 }, 
        height: { max: 1 },
        frameRate: { max: 1 }
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true
      },
      systemAudio: "include",
      preferCurrentTab: false,
      selfBrowserSurface: "include",
      monitorTypeSurfaces: "include"
    });
    console.log("[content] Tab audio access granted.");

    // 3. Setup Audio Mixing
    audioContext = new AudioContext(); 
    mixedDestination = audioContext.createMediaStreamDestination();

    // Defensive track check
    const micTracks = micStream.getAudioTracks();
    const tabTracks = tabAudioStream.getAudioTracks();

    if (micTracks.length === 0) console.warn("[content] No mic audio tracks found!");
    if (tabTracks.length === 0) {
      console.warn("[content] NO TAB AUDIO DETECTED! Ensure 'Share tab audio' was checked in the picker.");
      // Optional: alert the user or show a UI warning
    }

    const micSource = audioContext.createMediaStreamSource(micStream);
    const tabSource = audioContext.createMediaStreamSource(
      tabTracks.length > 0 ? tabAudioStream : new MediaStream() // Fallback to empty stream if no tab audio
    );
    
    micSource.connect(mixedDestination);
    if (tabTracks.length > 0) {
      tabSource.connect(mixedDestination);
    }

    await audioContext.resume();
    console.log(`[content] Pipeline active. Rate=${audioContext.sampleRate}Hz, MicTracks=${micTracks.length}, TabTracks=${tabTracks.length}`);

    isRecording = true;
    
    // Start unified recording loop
    recordStream(mixedDestination.stream);

    // Add track-end monitoring
    tabAudioStream.getTracks().forEach(track => {
      track.onended = () => {
        console.warn(`[content] Tab Audio Track (${track.kind}) ENDED unexpectedly.`);
      };
    });

    // Keep-alive video for Tab Audio tracks
    if (tabAudioStream.getVideoTracks().length > 0) {
      const dummyVideo = document.createElement("video");
      dummyVideo.id = "astrax-keep-alive-video";
      dummyVideo.style.position = "fixed";
      dummyVideo.style.top = "0";
      dummyVideo.style.left = "0";
      dummyVideo.style.width = "1px";
      dummyVideo.style.height = "1px";
      dummyVideo.style.opacity = "0.01";
      dummyVideo.style.pointerEvents = "none";
      dummyVideo.style.zIndex = "-999";
      
      dummyVideo.srcObject = tabAudioStream;
      document.body.appendChild(dummyVideo); 
      
      dummyVideo.play().catch(err => console.error("[content] Keep-alive video play error:", err));
      (window as any)._dummyVideo = dummyVideo; 
    }

  } catch (err) {
    console.error("[content] Audio mix failed:", err);
    stopRecording();
    throw err;
  }
}

function stopRecording(): void {
  isRecording = false;
  
  const stopTracks = (stream: MediaStream | null) => {
    stream?.getTracks().forEach(t => t.stop());
  };

  stopTracks(micStream);
  stopTracks(tabAudioStream);

  if (audioContext) {
    audioContext.close().catch(console.error);
    audioContext = null;
  }

  if ((window as any)._dummyVideo) {
    (window as any)._dummyVideo.srcObject = null;
    (window as any)._dummyVideo.remove();
    delete (window as any)._dummyVideo;
  }

  micStream = null;
  tabAudioStream = null;
  mixedDestination = null;

  console.log("[content] Mixed recording stopped and cleaned up.");
}

export default defineContentScript({
  // Active on Google Meet and Zoom only
  matches: ["*://meet.google.com/*", "*://*.zoom.us/j/*"],

  async main() {
    console.log("[content] Content script loaded and main() running.");

    // Listen for start/stop commands from the popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log("[content] Message received:", message.type, message);
      if (message.type === "TOGGLE_RECORDING") {
        const platform = detectPlatform();
        if (!platform) {
          console.warn("[content] Cannot start recording: Not a supported meeting page.");
          sendResponse({ active: false, error: "Not a supported meeting page" });
          return true;
        }

        if (message.active && !isRecording) {
          console.log("[content] Starting recording session...");
          startRecording()
            .then(() => {
              console.log("[content] Recording session active.");
              sendResponse({ active: true });
            })
            .catch((err) => {
              console.error("[content] Failed to start recording:", err);
              sendResponse({ active: false, error: err.message });
            });
        } else {
          console.log("[content] Stopping recording session...");
          stopRecording();
          sendResponse({ active: false });
        }
        return true;
      }
    });

    const platform = detectPlatform();
    if (!platform) {
      console.log(`[content] Not a supported meeting page (${window.location.href}). Idle.`);
      return;
    }

    console.log(`[content] Meeting platform detected: ${platform}`);

    window.addEventListener("beforeunload", () => {
      console.log("[content] Page unloading — stopping recording.");
      stopRecording();
    });
  },
});
