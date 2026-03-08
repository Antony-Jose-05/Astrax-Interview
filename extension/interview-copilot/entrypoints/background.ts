/**
 * background.ts — WXT Background Service Worker
 *
 * Responsibilities:
 *  1. Receive transcript segments from content.ts
 *  2. Track interviewer questions and candidate answers
 *  3. Trigger AI pipelines
 *  4. Send AI results to UI
 */

import { analyzeAnswer } from "../utils/api";

export default defineBackground(() => {
  console.log("[background] Service worker started");

  // ===============================
  // STATE
  // ===============================

  let storedResume: any = null;
  let latestQuestion: string = "";
  let latestAnswer: string = "";
  let aiRunning: boolean = false;
  let transcriptHistory: any[] = [];

  // Smart transcript deduplication
  let transcriptMap: Map<string, { text: string; timestamp: number }> = new Map();
  let transcriptSilenceTimer: NodeJS.Timeout | null = null;
  const TRANSCRIPT_SILENCE_DELAY: number = 1200; // 1.2 seconds
  const MIN_TRANSCRIPT_LENGTH: number = 3; // Ignore very short fragments

  // ===============================
  // HELPERS
  // ===============================

  function broadcastTranscript(text: string, speaker: string = "candidate") {
    console.log(`[background] Broadcasting TRANSCRIPT: "${text.slice(0, 30)}..." from ${speaker}`);

    const msg = {
      id: `msg-${Date.now()}-${Math.random()}`,
      text: text,
      speaker: speaker.toUpperCase()
    };

    transcriptHistory.push(msg);

    // @ts-ignore
    chrome.runtime.sendMessage(
      {
        type: "TRANSCRIPT",
        ...msg
      },
      () => {
        // @ts-ignore
        if (chrome.runtime.lastError) {
          console.debug("[background] Transcript broadcast failed (UI closed).");
        } else {
          console.log("[background] Transcript broadcast successful.");
        }
      }
    );
  }

  function broadcastAIResult(result: any) {
    console.log("[background] Broadcasting AI_RESULT to UI...");
    const message = {
      type: "AI_RESULT",
      questions: result.follow_up_questions || [],
      alerts: result.contradictions || [],
      score: result.score || 0
    };

    // @ts-ignore
    chrome.runtime.sendMessage(message).catch(() => {
      console.debug("[background] AI result not delivered via runtime.");
    });

    // @ts-ignore
    chrome.tabs.query({}, (tabs: any[]) => {
      tabs.forEach((tab: any) => {
        if (tab.id) {
          // @ts-ignore
          chrome.tabs.sendMessage(tab.id, message).catch(() => {
            // Ignore errors - some tabs may not have content scripts
          });
        }
      });
    });
  }

  async function sendOptimizedAIPayload() {
    if (aiRunning) {
      console.log("[background] AI already running - skipping");
      return;
    }

    if (!latestQuestion || !latestAnswer) {
      console.warn("[background] Missing question or answer, skipping AI payload");
      return;
    }

    aiRunning = true;

    const resume = storedResume?.resume || storedResume || {};
    const cleanedAnswer = latestAnswer.trim();
    
    // Build full transcript for AI service
    const transcript = `Interviewer: ${latestQuestion}\nCandidate: ${cleanedAnswer}`;
    
    console.log("[background] 🚀 SENDING OPTIMIZED AI PAYLOAD");
    console.log("[background] Payload:", {
      transcript,
      resume: resume,
      latest_answer: cleanedAnswer
    });
    
    try {
      const analysis = await analyzeAnswer(transcript, resume, cleanedAnswer);
      console.log("🤖 [BACKGROUND] AI RESULT RECEIVED:", analysis);

      broadcastAIResult(analysis);
    } catch (err) {
      console.error("❌ [BACKGROUND] AI CALL FAILED:", err);
    } finally {
      aiRunning = false;
    }
  }

  function generateFollowUps(question: string) {
    console.log("[background] 🤖 GENERATING FOLLOW-UP QUESTIONS");
    
    if (!storedResume) {
      console.warn("[background] No resume data available for follow-up generation");
      return;
    }

    const resume = storedResume?.resume || storedResume || {};
    
    // Use existing AI analysis for follow-up generation
    analyzeAnswer(`Interviewer: ${question}`, resume)
      .then((analysis) => {
        console.log("🤖 [BACKGROUND] FOLLOW-UP QUESTIONS GENERATED:", analysis);

        broadcastAIResult({
          type: "AI_RESULT",
          questions: analysis.follow_up_questions || [],
          alerts: analysis.contradictions || [],
          score: analysis.score || 0,
        });
      })
      .catch((err) => {
        console.error("❌ [BACKGROUND] FOLLOW-UP GENERATION FAILED:", err);
      });
  }

  function updateTranscript(text: string, speaker: string, isFinal: boolean = false) {
    const key = speaker.toLowerCase();
    const now = Date.now();
    
    // Ignore very short fragments
    if (text.length < MIN_TRANSCRIPT_LENGTH) {
      console.log(`[background] 🚫 IGNORING SHORT FRAGMENT: "${text}"`);
      return;
    }
    
    // Check if this is a longer version of previous transcript OR completely different
    const existing = transcriptMap.get(key);
    const isLongerVersion = existing && text.length > existing.text.length && 
      (text.includes(existing.text) || existing.text.includes(text.substring(0, Math.floor(existing.text.length * 0.8))));
    
    if (isLongerVersion) {
      console.log(`[background] 📝 UPDATING TRANSCRIPT: "${existing.text}" → "${text}"`);
      transcriptMap.set(key, { text, timestamp: now });
      
      // Clear silence timer and reset
      if (transcriptSilenceTimer) {
        clearTimeout(transcriptSilenceTimer);
      }
      
      // Set new timer to emit final transcript after silence
      transcriptSilenceTimer = setTimeout(() => {
        // Map speaker to role for AI triggering
        const role = speaker === "You" ? "interviewer" : "candidate";
        
        console.log(`[background] ✅ FINAL TRANSCRIPT: "${text}" from ${role}`);
        broadcastTranscript(text, role);
        
        // Track latest question/answer for AI evaluation
        if (role === "interviewer" && isFinal) {
          latestQuestion = text;
          console.log("[background] Question detected:", latestQuestion);
          generateFollowUps(text);
        }
        
        if (role === "candidate" && isFinal) {
          console.log("[AI] Evaluating candidate answer");
          latestAnswer = text;
          setTimeout(() => {
            sendOptimizedAIPayload();
          }, 2000);
        }
      }, TRANSCRIPT_SILENCE_DELAY);
    } else if (!existing) {
      // New transcript segment
      console.log(`[background] 🆕 NEW TRANSCRIPT: "${text}" from ${speaker}`);
      transcriptMap.set(key, { text, timestamp: now });
      
      // Set timer to emit after silence
      transcriptSilenceTimer = setTimeout(() => {
        // Map speaker to role for AI triggering
        const role = speaker === "You" ? "interviewer" : "candidate";
        
        console.log(`[background] ✅ FINAL TRANSCRIPT: "${text}" from ${role}`);
        broadcastTranscript(text, role);
        
        if (role === "interviewer") {
          latestQuestion = text;
          console.log("[background] Question detected:", latestQuestion);
          generateFollowUps(text);
        }
        
        if (role === "candidate" && isFinal) {
          console.log("[AI] Evaluating candidate answer");
          latestAnswer = text;
          setTimeout(() => {
            sendOptimizedAIPayload();
          }, 2000);
        }
      }, TRANSCRIPT_SILENCE_DELAY);
    } else if (existing && existing.text !== text) {
      // Different text - treat as new segment
      console.log(`[background] 🔄 DIFFERENT TRANSCRIPT: "${existing.text}" → "${text}"`);
      transcriptMap.set(key, { text, timestamp: now });
      
      // Clear and reset timer
      if (transcriptSilenceTimer) {
        clearTimeout(transcriptSilenceTimer);
      }
      
      transcriptSilenceTimer = setTimeout(() => {
        // Map speaker to role for AI triggering
        const role = speaker === "You" ? "interviewer" : "candidate";
        
        console.log(`[background] ✅ FINAL TRANSCRIPT: "${text}" from ${role}`);
        broadcastTranscript(text, role);
        
        if (role === "interviewer") {
          latestQuestion = text;
          console.log("[background] Question detected:", latestQuestion);
          generateFollowUps(text);
        }
        
        if (role === "candidate" && isFinal) {
          console.log("[AI] Evaluating candidate answer");
          latestAnswer = text;
          setTimeout(() => {
            sendOptimizedAIPayload();
          }, 2000);
        }
      }, TRANSCRIPT_SILENCE_DELAY);
    } else {
      // Same text, ignore
      console.log(`[background] 🚫 IGNORING DUPLICATE: "${text}"`);
    }
  }

  // ===============================
  // MESSAGE HANDLER
  // ===============================

  // @ts-ignore
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`🎯 [BACKGROUND] 📨 MESSAGE RECEIVED!`);
    console.log(`🎯 [BACKGROUND] Message type: ${message.type}`);
    console.log(`🎯 [BACKGROUND] Message keys: ${Object.keys(message)}`);

    switch (message.type) {
      case "TRANSCRIPT_SEGMENT": {
        const { text, speaker, isFinal } = message;

        if (!text || text.trim().length === 0) {
          sendResponse({ ok: true });
          return false;
        }

        console.log(`[background] 📥 RECEIVED Segment from Scraper: "${text.slice(0, 30)}..." | speaker=${speaker} | isFinal=${isFinal}`);

        updateTranscript(text.trim(), speaker, isFinal);

        sendResponse({ ok: true });
        return false;
      }

      case "RESUME_DATA": {
        console.log("[background] 📋 RECEIVED RESUME DATA");
        storedResume = message.data;
        console.log("[background] Resume data stored successfully.");

        // @ts-ignore
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
          transcriptHistory
        });
        return false;
      }

      case "GET_TRANSCRIPT": {
        sendResponse({ ok: true, history: transcriptHistory });
        return false;
      }

      default: {
        console.warn("[background] Unknown message type:", (message as any).type);
        sendResponse({ ok: false, reason: "unknown message type" });
        return false;
      }
    }
  });

  // @ts-ignore
  chrome.runtime.onInstalled.addListener(() => {
    // @ts-ignore
    chrome.sidePanel
      .setOptions({ path: 'sidepanel.html', enabled: true })
      .catch((error: any) => console.error(error));
  });

  // Open side panel on action click
  // @ts-ignore
  chrome.sidePanel.setOptions({
    path: 'sidepanel.html',
    enabled: true
  });
  
  // @ts-ignore
  chrome.action.onClicked.addListener((tab: any) => {
    // @ts-ignore
    chrome.sidePanel.open({ windowId: tab.windowId });
  });

  console.log("[background] Service worker initialised and ready (SidePanel enabled).");
});