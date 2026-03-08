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
let captionObserver: MutationObserver | null = null;
let isScraping = false;
let intervalId: any = null;
let lastFullText = "";
let persistentSpeaker = "Speaker";
let lastContainer: Element | null = null;
let lastSpeech = "";
/** Fingerprint set — absolutely prevents the same speaker+text being sent twice */
const sentFingerprints = new Set<string>();
/** Debounce timer for MutationObserver — prevents hundreds of calls/sec */
let observerDebounce: any = null;

/**
 * CaptionScraper - Watches the DOM for Google Meet captions.
 */
function startScraping(): void {
  if (isScraping) return;
  console.log("[content] Starting Caption Scraper Hook...");

  const platform = detectPlatform();
  if (platform !== "google_meet") {
    console.warn("[content] Caption scraping only implemented for Google Meet currently.");
    return;
  }

  isScraping = true;

  setInterval(() => {
    if (isScraping) {
       console.log("%c[content] 💓 Scraper Heartbeat (Active)", "color: #95a5a6; font-size: 10px;");
    }
  }, 5000);


  // Your name as shown by Google Meet — used to classify your role as INTERVIEWER
  const MY_NAME = "BAEVIN";

  // Tracks last sent text per speaker to deduplicate growing sentences
  const lastSpeechBySpeaker = new Map<string, string>();

  const performScrape = () => {
    // Google Meet renders each caption utterance as a block inside [jsname="YSxPC"]
    // We iterate all blocks and extract speaker + text from separate child nodes
    const captionRoot =
      document.querySelector('[jsname="YSxPC"]') ||
      document.querySelector('div[role="region"][aria-label="Captions"]') ||
      document.querySelector('[aria-live="polite"]');

    if (!captionRoot) return;

    // Detect container replacement — reset state
    if (captionRoot !== lastContainer) {
      lastContainer = captionRoot;
      lastFullText = "";
      lastSpeech = "";
      lastSpeechBySpeaker.clear();
      console.log("%c[content] 🔄 Caption container replaced", "color: #e67e22;");
    }

    // Each caption utterance is a child block within the root
    // Try known Meet inner selectors; fall back to iterating direct children
    const SPEAKER_SELECTORS = [".zs7s8d", ".CNusmb", "[data-sender-name]", ".NWpY1d"];
    const TEXT_SELECTORS    = [".CNusmb", ".VbkSUe", ".P7ZZmd", "span"];

    const blocks = Array.from(captionRoot.querySelectorAll("div")).filter(el =>
      el.children.length >= 1 && el.innerText?.trim().length > 0
    );

    for (const block of blocks) {
      // Try to find a dedicated speaker node
      let speakerName = "";
      for (const sel of SPEAKER_SELECTORS) {
        const node = block.querySelector(sel);
        if (node && node.textContent?.trim()) {
          speakerName = node.textContent.trim();
          break;
        }
      }

      // Try to find the text node (different from the speaker)
      let captionText = "";
      for (const sel of TEXT_SELECTORS) {
        const nodes = Array.from(block.querySelectorAll(sel));
        for (const node of nodes) {
          const t = node.textContent?.trim() || "";
          if (t && t !== speakerName && t.length > 2) {
            captionText = t;
            break;
          }
        }
        if (captionText) break;
      }

      // Fallback: use full block text, strip speaker prefix
      if (!captionText) {
        const full = block.innerText?.trim() || "";
        captionText = speakerName
          ? full.replace(speakerName, "").trim()
          : full;
      }

      if (!captionText || captionText.length < 2) continue;

      // Use persistent speaker if we couldn't detect one
      if (!speakerName) speakerName = persistentSpeaker;
      else persistentSpeaker = speakerName;

      // Delta deduplication per speaker
      const lastForSpeaker = lastSpeechBySpeaker.get(speakerName) || "";
      let delta = captionText;

      if (lastForSpeaker && captionText.startsWith(lastForSpeaker)) {
        delta = captionText.substring(lastForSpeaker.length).trim();
      } else if (lastForSpeaker && captionText.length < lastForSpeaker.length) {
        delta = captionText; // full rewrite
      }

      lastSpeechBySpeaker.set(speakerName, captionText);

      if (!delta || delta.length < 2) continue;

      // Absolute dedup: never send the same speaker+text fingerprint twice
      const fingerprint = `${speakerName}::${delta}`;
      if (sentFingerprints.has(fingerprint)) continue;
      sentFingerprints.add(fingerprint);
      // Prune set to prevent unbounded memory growth
      if (sentFingerprints.size > 500) {
        const first = sentFingerprints.values().next().value;
        if (first) sentFingerprints.delete(first);
      }

      console.log(`[content] 🎙️ ${speakerName}: ${delta}`);
      // @ts-ignore
      chrome.runtime.sendMessage({
        type: "TRANSCRIPT_SEGMENT",
        text: delta,
        speaker: speakerName,
        isFinal: false
      });
    }
  };

  // Poll every 1000ms (interval is for safety; observer handles real-time)
  intervalId = setInterval(performScrape, 1000);

  // Debounced MutationObserver — waits 300ms after last DOM change before firing
  // This prevents the observer firing hundreds of times/sec during Meet DOM updates
  captionObserver = new MutationObserver(() => {
    if (observerDebounce) clearTimeout(observerDebounce);
    observerDebounce = setTimeout(performScrape, 300);
  });
  captionObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function stopScraping(): void {
  isScraping = false;
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (captionObserver) {
    captionObserver.disconnect();
    captionObserver = null;
  }
  lastFullText = "";
  console.log("[content] Caption scraper stopped.");
}

export default defineContentScript({
  // Active on Google Meet and Zoom only
  matches: ["*://meet.google.com/*", "*://*.zoom.us/j/*"],

  async main() {
    console.log("[content] Content script loaded and main() running.");

    // Listen for start/stop commands from the popup
    // @ts-ignore
    chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
      console.log("[content] Message received:", message.type, message);
      if (message.type === "TOGGLE_RECORDING") {
        const platform = detectPlatform();
        if (!platform) {
          console.warn("[content] Cannot start scraping: Not a supported meeting page.");
          sendResponse({ active: false, error: "Not a supported meeting page" });
          return true;
        }

        if (message.active && !isScraping) {
          console.log("[content] Starting scraping session...");
          try {
            startScraping();
            sendResponse({ active: true });
          } catch (err: any) {
            console.error("[content] Failed to start scraping:", err);
            sendResponse({ active: false, error: err.message });
          }
        } else {
          console.log("[content] Stopping scraping session...");
          stopScraping();
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
      console.log("[content] Page unloading — stopping scraper.");
      stopScraping();
    });
  },
});
