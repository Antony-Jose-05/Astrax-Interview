/**
 * content.ts — WXT Content Script
 *
 * Unified platform handler:
 *
 *  ┌─────────────────────┬──────────────────────────────────────────┐
 *  │ Platform            │ Strategy                                  │
 *  ├─────────────────────┼──────────────────────────────────────────┤
 *  │ Google Meet         │ DOM caption scraper                       │
 *  │                     │ Reads Meet's own live caption elements.   │
 *  │                     │ Fastest, free, real speaker names.        │
 *  ├─────────────────────┼──────────────────────────────────────────┤
 *  │ Zoom                │ Audio capture → STT service               │
 *  │                     │ Zoom's DOM captions are inaccessible.     │
 *  │                     │ Captures mic + tab audio, sends chunks    │
 *  │                     │ to SSI-Service (:8000) via background.    │
 *  └─────────────────────┴──────────────────────────────────────────┘
 *
 * Both strategies are triggered by TOGGLE_RECORDING from the side panel
 * and send their output to background.ts for deduplication + broadcast.
 */

// ─────────────────────────────────────────────
// Platform detection
// ─────────────────────────────────────────────

type MeetingPlatform = 'google_meet' | 'zoom' | null;

function detectPlatform(): MeetingPlatform {
  const { hostname, pathname } = window.location;
  if (hostname === 'meet.google.com' && pathname.length > 1) return 'google_meet';
  if (hostname.endsWith('zoom.us') && pathname.startsWith('/j/'))  return 'zoom';
  return null;
}

// ─────────────────────────────────────────────
// Shared state
// ─────────────────────────────────────────────

let isScraping   = false;
let isRecording  = false; // Zoom audio recording flag

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY A — Google Meet DOM Caption Scraper
// ══════════════════════════════════════════════════════════════════════════════

let captionObserver : MutationObserver | null = null;
let intervalId      : ReturnType<typeof setInterval>  | null = null;
let observerDebounce: ReturnType<typeof setTimeout>   | null = null;
let lastContainer   : Element | null = null;
let persistentSpeaker = 'Speaker';

/** Fingerprint set — absolutely prevents the same speaker+text being sent twice */
const sentFingerprints = new Set<string>();

/** Tracks the last sent text per speaker for delta deduplication */
const lastSpeechBySpeaker = new Map<string, string>();

/**
 * Scrapes Google Meet's live caption DOM and sends deltas to background.ts
 * as TRANSCRIPT_SEGMENT messages.
 *
 * WHY scrape instead of audio? Meet renders its own high-quality captions with
 * speaker attribution directly in the DOM. This is faster than Whisper (~0ms
 * vs ~2s), costs nothing, and gives us real speaker names for free.
 */
function startMeetScraper(): void {
  if (isScraping) return;
  isScraping = true;

  console.log('[content] 🟢 Starting Google Meet caption scraper.');

  const performScrape = (): void => {
    // Google Meet renders captions inside [jsname="YSxPC"] or similar aria regions
    const captionRoot =
      document.querySelector('[jsname="YSxPC"]') ||
      document.querySelector('div[role="region"][aria-label="Captions"]') ||
      document.querySelector('[aria-live="polite"]');

    if (!captionRoot) return;

    // Reset per-speaker state when the caption container is replaced by Meet
    if (captionRoot !== lastContainer) {
      lastContainer = captionRoot;
      lastSpeechBySpeaker.clear();
      console.log('[content] 🔄 Caption container replaced — resetting speaker state.');
    }

    const SPEAKER_SELECTORS = ['.zs7s8d', '.CNusmb', '[data-sender-name]', '.NWpY1d'];
    const TEXT_SELECTORS    = ['.CNusmb', '.VbkSUe', '.P7ZZmd', 'span'];

    // Each caption utterance is a child block inside the root
    const blocks = Array.from(captionRoot.querySelectorAll('div')).filter(
      (el) => el.children.length >= 1 && (el as HTMLElement).innerText?.trim().length > 0
    );

    for (const block of blocks) {
      // ── Extract speaker name ─────────────────────────────────────────────
      let speakerName = '';
      for (const sel of SPEAKER_SELECTORS) {
        const node = block.querySelector(sel);
        if (node?.textContent?.trim()) {
          speakerName = node.textContent.trim();
          break;
        }
      }

      // ── Extract caption text ─────────────────────────────────────────────
      let captionText = '';
      for (const sel of TEXT_SELECTORS) {
        const nodes = Array.from(block.querySelectorAll(sel));
        for (const node of nodes) {
          const t = node.textContent?.trim() || '';
          if (t && t !== speakerName && t.length > 2) {
            captionText = t;
            break;
          }
        }
        if (captionText) break;
      }

      // Fallback: strip speaker prefix from full block text
      if (!captionText) {
        const full = (block as HTMLElement).innerText?.trim() || '';
        captionText = speakerName ? full.replace(speakerName, '').trim() : full;
      }

      if (!captionText || captionText.length < 2) continue;

      // Persist last known speaker name across caption blocks
      if (!speakerName) speakerName = persistentSpeaker;
      else persistentSpeaker = speakerName;

      // ── Delta deduplication ──────────────────────────────────────────────
      // Meet captions grow in place as the speaker talks. We only want the
      // new words appended since we last checked, not the full sentence again.
      const lastForSpeaker = lastSpeechBySpeaker.get(speakerName) || '';
      let delta = captionText;

      if (lastForSpeaker && captionText.startsWith(lastForSpeaker)) {
        delta = captionText.substring(lastForSpeaker.length).trim();
      } else if (lastForSpeaker && captionText.length < lastForSpeaker.length) {
        delta = captionText; // caption was reset mid-sentence
      }

      lastSpeechBySpeaker.set(speakerName, captionText);

      if (!delta || delta.length < 2) continue;

      // ── Absolute fingerprint dedup ───────────────────────────────────────
      // Ensures we never send the exact same speaker+text twice even across
      // multiple scrape cycles.
      const fingerprint = `${speakerName}::${delta}`;
      if (sentFingerprints.has(fingerprint)) continue;
      sentFingerprints.add(fingerprint);

      // Prune fingerprint set to prevent unbounded memory growth
      if (sentFingerprints.size > 500) {
        const first = sentFingerprints.values().next().value;
        if (first) sentFingerprints.delete(first);
      }

      console.log(`[content] 🎙️ ${speakerName}: ${delta}`);

      // @ts-ignore — TRANSCRIPT_SEGMENT now typed in messages.ts
      chrome.runtime.sendMessage({
        type   : 'TRANSCRIPT_SEGMENT',
        text   : delta,
        speaker: speakerName,
        isFinal: false,
      });
    }
  };

  // Poll every second as a safety net
  intervalId = setInterval(performScrape, 1000);

  // MutationObserver handles real-time DOM changes; debounced to 300ms to
  // avoid firing hundreds of times per second during Meet DOM updates
  captionObserver = new MutationObserver(() => {
    if (observerDebounce) clearTimeout(observerDebounce);
    observerDebounce = setTimeout(performScrape, 300);
  });

  captionObserver.observe(document.body, {
    childList    : true,
    subtree      : true,
    characterData: true,
  });
}

function stopMeetScraper(): void {
  isScraping = false;

  if (intervalId)       { clearInterval(intervalId);          intervalId = null;       }
  if (captionObserver)  { captionObserver.disconnect();       captionObserver = null;  }
  if (observerDebounce) { clearTimeout(observerDebounce);     observerDebounce = null; }

  lastSpeechBySpeaker.clear();
  sentFingerprints.clear();
  lastContainer = null;

  console.log('[content] 🔴 Google Meet caption scraper stopped.');
}


// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY B — Zoom Audio Capture → STT Service
// ══════════════════════════════════════════════════════════════════════════════

const CHUNK_INTERVAL_MS = 5_000;
const AUDIO_MIME_TYPE   = 'audio/webm;codecs=opus';
const MIN_CHUNK_BYTES   = 500;

let micStream         : MediaStream | null = null;
let audioContext      : AudioContext | null = null;
let mixedDestination  : MediaStreamAudioDestinationNode | null = null;
let currentRecorder   : MediaRecorder | null = null;
let zoomSequenceId    = 0;

/**
 * Builds a Web Audio graph mixing mic + tab audio into one MediaStream.
 *
 * WHY mix both? The STT service receives a single audio stream. Mixing
 * gives Whisper the full conversation context (both interviewer and candidate)
 * which significantly improves transcription accuracy vs mic-only.
 *
 * NOTE: Tab audio requires the user to click "Share tab audio" in Chrome's
 * screen share dialog. We handle the case where they don't gracefully.
 */
async function buildZoomAudioStream(): Promise<MediaStream | null> {
  try {
    audioContext     = new AudioContext({ sampleRate: 16_000 });
    mixedDestination = audioContext.createMediaStreamDestination();

    // 1. Microphone — always available
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16_000 },
      video: false,
    });
    const micSource = audioContext.createMediaStreamSource(micStream);
    micSource.connect(mixedDestination);
    console.log('[content] ✅ Mic audio connected.');

    // 2. Tab audio — optional, requires screen share with audio
    try {
      const tabStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,  // Chrome requires video:true even when we only want audio
        audio: true,
      });

      // Immediately stop the video track — we only need audio
      tabStream.getVideoTracks().forEach((t: MediaStreamTrack) => {
        t.stop();
        tabStream.removeTrack(t);
      });

      if (tabStream.getAudioTracks().length > 0) {
        const tabSource = audioContext.createMediaStreamSource(tabStream);
        tabSource.connect(mixedDestination);
        console.log('[content] ✅ Tab audio connected (both sides captured).');
      } else {
        console.warn('[content] ⚠️ Tab audio unavailable — mic only. Ask user to check "Share tab audio".');
      }
    } catch (tabErr) {
      // User dismissed the screen share dialog — continue with mic only
      console.warn('[content] ⚠️ Tab audio capture skipped (user cancelled or denied).');
    }

    return mixedDestination.stream;
  } catch (err) {
    console.error('[content] ❌ Failed to build Zoom audio stream:', err);
    return null;
  }
}

/**
 * Records one CHUNK_INTERVAL_MS interval of the mixed audio stream.
 * Converts to base64 data URL (chrome.runtime messages must be JSON-serialisable)
 * and sends to background.ts as AUDIO_CHUNK for forwarding to the STT service.
 */
function runZoomRecorderChunk(stream: MediaStream): void {
  if (!isRecording) return;

  const mimeType = MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE) ? AUDIO_MIME_TYPE : '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  currentRecorder = recorder;

  const chunks: Blob[] = [];

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    currentRecorder = null;
    const currentId = zoomSequenceId++;
    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });

    if (blob.size < MIN_CHUNK_BYTES) {
      console.warn(`[content] Zoom chunk ${currentId} too small (${blob.size}B) — skipping.`);
    } else {
      const reader = new FileReader();
      reader.onloadend = () => {
        // @ts-ignore — AUDIO_CHUNK handled in background.ts
        chrome.runtime.sendMessage({
          type       : 'AUDIO_CHUNK',
          audioDataUrl: reader.result as string,
          sequence_id: currentId,
          speaker    : 'mixed', // Whisper receives both sides; background labels them
        }, (response: any) => {
          if (chrome.runtime.lastError) {
            console.debug('[content] AUDIO_CHUNK send error:', chrome.runtime.lastError.message);
          } else {
            console.debug(`[content] Zoom chunk ${currentId} acknowledged:`, response);
          }
        });
      };
      reader.readAsDataURL(blob);
    }

    // Chain next interval while still recording
    if (isRecording) setTimeout(() => runZoomRecorderChunk(stream), 100);
  };

  recorder.onerror = (e) => console.error('[content] Zoom recorder error:', e);
  recorder.start();
  setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, CHUNK_INTERVAL_MS);
}

async function startZoomCapture(): Promise<boolean> {
  if (isRecording) return true;

  console.log('[content] 🟢 Starting Zoom audio capture → STT pipeline.');
  const stream = await buildZoomAudioStream();

  if (!stream) {
    console.error('[content] ❌ Could not obtain audio stream.');
    return false;
  }

  isRecording    = true;
  zoomSequenceId = 0;
  runZoomRecorderChunk(stream);
  return true;
}

function stopZoomCapture(): void {
  if (!isRecording) return;
  isRecording = false;

  if (currentRecorder && currentRecorder.state !== 'inactive') currentRecorder.stop();
  micStream?.getTracks().forEach((t) => t.stop());
  audioContext?.close();

  micStream        = null;
  audioContext     = null;
  mixedDestination = null;
  currentRecorder  = null;

  console.log('[content] 🔴 Zoom audio capture stopped.');
}


// ══════════════════════════════════════════════════════════════════════════════
// WXT Content Script Entry Point
// ══════════════════════════════════════════════════════════════════════════════

export default defineContentScript({
  matches: ['*://meet.google.com/*', '*://*.zoom.us/j/*'],

  async main() {
    const platform = detectPlatform();

    if (!platform) {
      console.log(`[content] Not a supported meeting page. Idle.`);
      return;
    }

    console.log(`[content] ✅ Platform detected: ${platform}. Awaiting TOGGLE_RECORDING.`);

    // ── Message listener — handles TOGGLE_RECORDING from the side panel ───
    // @ts-ignore
    chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
      if (message.type !== 'TOGGLE_RECORDING') return false;

      if (message.active) {
        // ── START ──────────────────────────────────────────────────────────
        if (platform === 'google_meet') {
          try {
            startMeetScraper();
            sendResponse({ active: true, strategy: 'dom_scraper' });
          } catch (err: any) {
            console.error('[content] Meet scraper failed to start:', err);
            sendResponse({ active: false, error: err.message });
          }
          return false; // synchronous response
        }

        if (platform === 'zoom') {
          // startZoomCapture is async — must return true to keep channel open
          startZoomCapture().then((success) => {
            sendResponse({ active: success, strategy: 'audio_capture' });
          });
          return true; // keep channel open for async response
        }

      } else {
        // ── STOP ───────────────────────────────────────────────────────────
        if (platform === 'google_meet') stopMeetScraper();
        if (platform === 'zoom')        stopZoomCapture();
        sendResponse({ active: false });
        return false;
      }
    });

    // Clean up on page unload (tab close, navigation away from call)
    window.addEventListener('beforeunload', () => {
      if (platform === 'google_meet') stopMeetScraper();
      if (platform === 'zoom')        stopZoomCapture();
    });
  },
});