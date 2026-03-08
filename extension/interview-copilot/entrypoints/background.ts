/**
 * background.ts — WXT Background Service Worker
 *
 * Responsibilities:
 *  1. Receive transcript segments from content.ts (two sources):
 *       • TRANSCRIPT_SEGMENT — from Google Meet DOM caption scraper (fast, free)
 *       • AUDIO_CHUNK        — from Zoom audio capture, forwarded to STT :8000
 *  2. Deduplicate and debounce transcript segments
 *  3. Track interviewer questions and candidate answers
 *  4. Trigger AI analysis pipeline at the right moments
 *  5. Broadcast TRANSCRIPT and AI_RESULT to the side panel UI
 */

import { sendAudio, analyzeAnswer } from '../utils/api';

export default defineBackground(() => {
  console.log('[background] Service worker started.');

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  let storedResume   : any    = null;
  let latestQuestion : string = '';
  let latestAnswer   : string = '';
  let aiRunning      : boolean = false;

  // Full conversation history — returned to TranscriptPanel on GET_TRANSCRIPT
  let transcriptHistory: Array<{ id: string; text: string; speaker: string; timestamp: number }> = [];

  // Per-speaker deduplication map — prevents re-broadcasting the same growing sentence
  const transcriptMap  = new Map<string, { text: string; timestamp: number }>();
  let   silenceTimer   : ReturnType<typeof setTimeout> | null = null;

  // Zoom audio sequencing — tracks next expected chunk to forward in order
  let zoomSequenceQueue = new Map<number, string>(); // sequenceId → base64 dataUrl
  let nextZoomSequence  = 0;

  const SILENCE_DELAY       = 1_200; // ms — wait for speaker to pause before finalising
  const MIN_TEXT_LENGTH     = 3;     // ignore single-character noise fragments
  const ZOOM_FLUSH_TIMEOUT  = 3_000; // ms — max wait before flushing out-of-order Zoom chunks

  // ═══════════════════════════════════════════════════════════════════════════
  // BROADCAST HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function broadcastTranscript(text: string, speaker: string): void {
    const msg = {
      type     : 'TRANSCRIPT' as const,
      id       : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      speaker  : speaker.toUpperCase(),
      timestamp: Date.now(),
    };

    transcriptHistory.push(msg);

    // @ts-ignore
    chrome.runtime.sendMessage(msg, () => {
      // @ts-ignore
      if (chrome.runtime.lastError) {
        console.debug('[background] Transcript broadcast failed (UI not open).');
      }
    });
  }

  function broadcastAIResult(result: any): void {
    const msg = {
      type     : 'AI_RESULT' as const,
      questions: result.follow_up_questions ?? [],
      alerts   : result.contradictions       ?? [],
      score    : result.score                ?? 0,
    };

    // @ts-ignore
    chrome.runtime.sendMessage(msg, () => {
      // @ts-ignore
      if (chrome.runtime.lastError) {
        console.debug('[background] AI result broadcast failed (UI not open).');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPT DEDUPLICATION & SILENCE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Called for every TRANSCRIPT_SEGMENT received from the Meet scraper.
   *
   * Google Meet captions grow in-place as a speaker talks — e.g.:
   *   "Tell me"  →  "Tell me about"  →  "Tell me about yourself"
   *
   * We store the latest version per speaker and wait SILENCE_DELAY ms after
   * the last update before treating the sentence as final and broadcasting it.
   * This avoids spamming the UI with partial sentences.
   */
  function updateTranscript(text: string, speaker: string): void {
    if (text.length < MIN_TEXT_LENGTH) return;

    const key      = speaker.toLowerCase();
    const now      = Date.now();
    const existing = transcriptMap.get(key);

    // Always update to the latest text for this speaker
    transcriptMap.set(key, { text, timestamp: now });

    // Reset silence timer — restart countdown from now
    if (silenceTimer) clearTimeout(silenceTimer);

    silenceTimer = setTimeout(() => {
      // Determine role from speaker name
      // "You" in Google Meet = the local user = the interviewer running this tool
      const role = speaker === 'You' ? 'interviewer' : 'candidate';

      console.log(`[background] ✅ Final: "${text}" | role=${role}`);
      broadcastTranscript(text, role);
      transcriptMap.delete(key); // clear so next sentence starts fresh

      // Trigger AI pipeline based on role
      if (role === 'interviewer') {
        latestQuestion = text;
      }

      if (role === 'candidate') {
        latestAnswer = text;
        // Delay slightly to allow any trailing words to arrive
        setTimeout(sendOptimizedAIPayload, 2_000);
      }
    }, SILENCE_DELAY);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZOOM: AUDIO CHUNK FORWARDING → STT SERVICE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Zoom audio chunks arrive as base64 data URLs from content.ts.
   * We forward them to SSI-Service (:8000) which runs Groq Whisper.
   * The transcript returned is then processed through the same pipeline
   * as Meet captions, but attributed to 'mixed' (both speakers).
   *
   * WHY queue and order? MediaRecorder slices can arrive slightly out of order.
   * We hold chunks until the expected sequence is available, then flush.
   */
  async function handleZoomAudioChunk(audioDataUrl: string, sequenceId: number): Promise<void> {
    zoomSequenceQueue.set(sequenceId, audioDataUrl);

    // Flush all available in-order chunks
    while (zoomSequenceQueue.has(nextZoomSequence)) {
      const dataUrl = zoomSequenceQueue.get(nextZoomSequence)!;
      zoomSequenceQueue.delete(nextZoomSequence);
      const currentSeq = nextZoomSequence;
      nextZoomSequence++;

      try {
        // Convert base64 data URL back to Blob for the STT service
        const base64 = dataUrl.split(',')[1];
        const binary  = atob(base64);
        const bytes   = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/webm' });

        console.log(`[background] Forwarding Zoom chunk ${currentSeq} (${blob.size}B) to STT.`);
        const result = await sendAudio(blob, currentSeq, 'mixed');

        if (result.transcript?.trim()) {
          console.log(`[background] Zoom STT result: "${result.transcript}"`);
          // Zoom transcripts don't have speaker attribution — treat as candidate
          // (The interviewer using this tool would be on the same mic on Zoom)
          updateTranscript(result.transcript.trim(), 'candidate');
        }
      } catch (err) {
        console.error(`[background] STT failed for Zoom chunk ${currentSeq}:`, err);
      }
    }

    // Safety flush: if a chunk went missing, don't block forever
    setTimeout(() => {
      if (zoomSequenceQueue.size > 0) {
        console.warn(`[background] Flushing ${zoomSequenceQueue.size} stale Zoom chunks.`);
        for (const [seq, dataUrl] of [...zoomSequenceQueue.entries()].sort(([a], [b]) => a - b)) {
          zoomSequenceQueue.delete(seq);
          nextZoomSequence = seq + 1;
          // Re-enqueue as if it arrived now — will be flushed in next call
          handleZoomAudioChunk(dataUrl, seq);
        }
      }
    }, ZOOM_FLUSH_TIMEOUT);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════

  async function sendOptimizedAIPayload(): Promise<void> {
    // Guard: don't stack concurrent AI calls
    if (aiRunning) {
      console.log('[background] AI already running — skipping.');
      return;
    }

    // Guard: need both halves of the exchange to analyse
    if (!latestQuestion || !latestAnswer) {
      console.warn('[background] Missing question or answer — skipping AI call.');
      return;
    }

    aiRunning = true;
    const resume   = storedResume?.resume ?? storedResume ?? {};
    const transcript = `Interviewer: ${latestQuestion}\nCandidate: ${latestAnswer.trim()}`;

    console.log('[background] 🚀 Sending AI payload.');

    try {
      const analysis = await analyzeAnswer(transcript, resume, latestAnswer.trim());
      console.log('[background] 🤖 AI result received:', analysis);
      broadcastAIResult(analysis);
    } catch (err) {
      console.error('[background] ❌ AI call failed:', err);
    } finally {
      aiRunning = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE HANDLER
  // ═══════════════════════════════════════════════════════════════════════════

  // @ts-ignore
  chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {

    switch (message.type) {

      // ── From: Google Meet DOM scraper in content.ts ──────────────────────
      case 'TRANSCRIPT_SEGMENT': {
        const { text, speaker } = message;
        if (!text?.trim()) { sendResponse({ ok: true }); return false; }

        console.log(`[background] 📥 SEGMENT "${text.slice(0, 40)}..." | speaker=${speaker}`);
        updateTranscript(text.trim(), speaker);

        sendResponse({ ok: true });
        return false;
      }

      // ── From: Zoom audio capture in content.ts ───────────────────────────
      case 'AUDIO_CHUNK': {
        const { audioDataUrl, sequence_id } = message;

        if (!audioDataUrl) {
          console.warn('[background] AUDIO_CHUNK missing audioDataUrl — ignoring.');
          sendResponse({ ok: false, reason: 'missing audioDataUrl' });
          return false;
        }

        console.log(`[background] 🎵 Zoom AUDIO_CHUNK seq=${sequence_id}`);

        // Async — keep message channel open
        handleZoomAudioChunk(audioDataUrl, sequence_id ?? 0)
          .then(() => sendResponse({ ok: true }))
          .catch((err) => sendResponse({ ok: false, reason: err.message }));

        return true; // keep channel open for async response
      }

      // ── From: ResumePanel ─────────────────────────────────────────────────
      case 'RESUME_DATA': {
        console.log('[background] 📋 Resume data received and stored.');
        storedResume = message.data;
        sendResponse({ ok: true });
        return false;
      }

      // ── From: TranscriptPanel (hydrate on mount) ──────────────────────────
      case 'GET_TRANSCRIPT': {
        sendResponse({ ok: true, history: transcriptHistory });
        return false;
      }

      // ── From: sidebar/App.tsx (check service state) ───────────────────────
      case 'GET_STATUS': {
        sendResponse({
          ok          : true,
          storedResume,
          transcriptLength: transcriptHistory.length,
          isRecording : false, // content.ts owns recording state; background doesn't track it
        });
        return false;
      }

      default: {
        console.warn('[background] Unknown message type:', message.type);
        sendResponse({ ok: false, reason: 'unknown message type' });
        return false;
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SIDE PANEL SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  // @ts-ignore
  chrome.action.onClicked.addListener((tab: any) => {
    // @ts-ignore
    chrome.sidePanel.open({ windowId: tab.windowId });
  });

  // @ts-ignore
  chrome.runtime.onInstalled.addListener(() => {
    // @ts-ignore
    chrome.sidePanel
      .setOptions({ path: 'sidepanel.html', enabled: true })
      .catch((err: any) => console.error('[background] sidePanel.setOptions error:', err));
  });

  console.log('[background] ✅ Ready — listening for Meet captions and Zoom audio.');
});