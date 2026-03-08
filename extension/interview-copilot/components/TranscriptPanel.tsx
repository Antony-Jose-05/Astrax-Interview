import React, { useEffect, useRef, useState, useCallback } from "react";

interface TranscriptMessage {
  id: string;
  text: string;
  speaker: "INTERVIEWER" | "CANDIDATE" | "MIXED";
  timestamp: Date;
}

// Max messages to keep in the DOM — older ones are trimmed to prevent blank/slow box
const MAX_MESSAGES = 300;
// Batch update interval to prevent rapid DOM updates
const BATCH_UPDATE_INTERVAL = 500;
// Scroll debounce time
const SCROLL_DEBOUNCE = 100;

// Smart message difference system - only show new content
function getMessageDifference(fullText: string, previousText: string): string {
  if (!previousText) return fullText; // First message, show all
  if (!fullText) return '';
  
  // Find the longest common prefix
  let commonLength = 0;
  const minLength = Math.min(fullText.length, previousText.length);
  
  while (commonLength < minLength && 
         fullText[commonLength] === previousText[commonLength]) {
    commonLength++;
  }
  
  // If there's no difference, return empty
  if (commonLength === fullText.length && commonLength === previousText.length) {
    return '';
  }
  
  // Get only the new part
  const newPart = fullText.slice(commonLength);
  
  // Clean up the new part (remove leading spaces/punctuation)
  const cleanedNewPart = newPart.replace(/^[\s.,!?]+/, '');
  
  return cleanedNewPart;
}

// Final message cleanup - more aggressive deduplication
function finalMessageCleanup(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  return text
    // Remove exact duplicates in sequence
    .replace(/(\b\w+\b)(\s+\1\b)+/gi, '$1')
    // Remove repeated phrases (more aggressive)
    .replace(/(.{10,})(\s+\1)+/gi, '$1')
    // Fix common caption fragmentation
    .replace(/([a-z])([A-Z])/g, '$1. $2')
    // Remove multiple punctuation
    .replace(/[.,]{2,}/g, '.')
    // Fix spacing around punctuation
    .replace(/\s*[.,!?]\s*/g, '. ')
    // Remove extra spaces
    .replace(/\s+/g, ' ')
    // Capitalize first letter
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    // Trim
    .trim();
}

// Smart AI-based message filtering and cleaning
async function processRawTranscript(rawText: string, speaker: string): Promise<string | null> {
  if (!rawText || typeof rawText !== 'string') return null;
  
  // First, basic cleaning
  let cleaned = rawText
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[.,!?\s]+|[.,!?\s]+$/g, '')
    .toLowerCase();
  
  // Skip if too short or just filler
  if (cleaned.length < 3) return null;
  
  // Check for filler words only
  const fillerWords = /^(um|uh|ah|er|mm|hmm|yeah|yes|no|okay|ok|thanks|thank you)$/;
  if (fillerWords.test(cleaned)) return null;
  
  // Check for repetitive fragments (common caption issue)
  if (cleaned.split(' ').length < 3 && !/[a-z]{4,}/.test(cleaned)) {
    return null; // Skip very short fragments without substantial words
  }
  
  // Return the cleaned text with proper capitalization
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Clean and format caption text from Google Meet
function cleanCaptionText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  
  return text
    // Remove extra whitespace and normalize spaces
    .trim()
    .replace(/\s+/g, ' ')
    // Fix common caption artifacts
    .replace(/[.,]{2,}/g, '.') // Remove multiple punctuation
    .replace(/\s*[.,]\s*/g, '. ') // Fix spacing around punctuation
    .replace(/\s*[!?]\s*/g, (match) => `${match.trim()} `) // Fix spacing around !?
    // Remove common filler words and artifacts
    .replace(/\b(um|uh|ah|er|mm)\b/gi, '')
    // Fix capitalization - capitalize first letter of sentences
    .replace(/([.!?]\s*)([a-z])/g, (match, punct, letter) => punct + letter.toUpperCase())
    // Capitalize first letter if it's lowercase
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
    // Remove leading/trailing punctuation
    .replace(/^[.,!?\s]+|[.,!?\s]+$/g, '')
    .trim();
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const TranscriptPanel: React.FC = () => {
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [isLive, setIsLive] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [followUpQuestions, setFollowUpQuestions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [score, setScore] = useState<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLiveRef = useRef(true); // shadow ref so the listener always has current value
  const pendingMessagesRef = useRef<TranscriptMessage[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastScrollTimeRef = useRef(0);

  // Keep the ref in sync with state
  useEffect(() => { isLiveRef.current = isLive; }, [isLive]);

  // Improved auto-scroll with debouncing and smooth behavior
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    
    // Debounce scroll calls
    const now = Date.now();
    if (now - lastScrollTimeRef.current < SCROLL_DEBOUNCE) return;
    lastScrollTimeRef.current = now;
    
    // Use requestAnimationFrame for smooth scrolling
    requestAnimationFrame(() => {
      if (el) {
        const scrollHeight = el.scrollHeight;
        const clientHeight = el.clientHeight;
        const targetScrollTop = scrollHeight - clientHeight;
        
        // Only scroll if we're not already at the bottom (within 10px tolerance)
        if (Math.abs(el.scrollTop - targetScrollTop) > 10) {
          el.scrollTo({
            top: scrollHeight,
            behavior: 'smooth'
          });
        }
      }
    });
  }, []);

  // Process pending messages in batches - REPLACE mode instead of accumulate
  const processPendingMessages = useCallback(() => {
    if (pendingMessagesRef.current.length === 0) return;
    
    const pending = pendingMessagesRef.current.splice(0);
    setMessages(prev => {
      let updated = [...prev];
      
      // Advanced coalescing with context awareness
      pending.forEach(newMsg => {
        const last = updated[updated.length - 1];
        
        if (
          last &&
          last.speaker === newMsg.speaker &&
          newMsg.timestamp.getTime() - last.timestamp.getTime() < 3000 // 3 second window
        ) {
          const lastText = last.text.trim();
          const newText = newMsg.text.trim();
          
          // AGGRESSIVE: Skip if new text adds no substantial new content
          const lastWords = new Set(lastText.toLowerCase().split(' ').filter(w => w.length > 2));
          const newWords = newText.toLowerCase().split(' ').filter(w => w.length > 2);
          const newSubstantialWords = newWords.filter(word => !lastWords.has(word));
          
          // If less than 2 substantial new words, skip it
          if (newSubstantialWords.length < 2 && newText.length < 30) {
            return;
          }
          
          // Check if we should merge or separate
          const shouldMerge = 
            // Merge if last doesn't end in complete sentence
            !/[.!?]$/.test(lastText) ||
            // Merge if new text is very short and looks like continuation
            (newText.length < 10 && !/^[A-Z]/.test(newText)) ||
            // Merge if new text starts with lowercase (continuation)
            /^[a-z]/.test(newText);
          
          if (shouldMerge) {
            // REPLACE the last message instead of accumulating
            const separator = (!lastText.endsWith(' ') && !newText.startsWith(' ')) ? ' ' : '';
            
            // AGGRESSIVE: Only merge if this adds substantial new content
            const lastWords = new Set(lastText.toLowerCase().split(' ').filter(w => w.length > 2));
            const newWords = newText.toLowerCase().split(' ').filter(w => w.length > 2);
            const newSubstantialWords = newWords.filter(word => !lastWords.has(word));
            
            // If no substantial new content, don't merge
            if (newSubstantialWords.length === 0) {
              return;
            }
            
            updated[updated.length - 1] = {
              ...last,
              text: `${lastText}${separator}${newText}`,
              timestamp: newMsg.timestamp
            };
          } else {
            // Add as separate message
            updated.push(newMsg);
          }
        } else {
          // Add as new message
          updated.push(newMsg);
        }
      });
      
      // Keep only the last MAX_MESSAGES messages
      return updated.slice(-MAX_MESSAGES);
    });
    setTotalCount(c => c + pending.length);
  }, []);
  
  // Scroll whenever messages change and auto-scroll is on
  useEffect(() => {
    if (isLive) {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        scrollToBottom();
      }, 50); // Small delay to allow DOM to update
    }
  }, [messages, isLive, scrollToBottom]);

  useEffect(() => {
    // 1. Pull history from background on mount
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "GET_TRANSCRIPT" }, (response) => {
        if (response?.history) {
          const history: TranscriptMessage[] = response.history.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp || Date.now()),
          }));
          setMessages(history.slice(-MAX_MESSAGES));
          setTotalCount(history.length);
        }
      });
    }

  // Real-time listener with AI-based processing
    const handler = async (message: any) => {
      console.log("🤖 [TRANSCRIPT] Message received:", message.type, message);
      
      if (
        message.type === "TRANSCRIPT" &&
        message.text &&
        message.text.trim().length > 0
      ) {
        const rawSpeaker = (message.speaker || "MIXED").toUpperCase();
        const rawText = message.text.trim();
        
        // Skip obvious garbage immediately
        if (rawText.length < 2 || /^(um|uh|ah|er|mm)$/i.test(rawText)) {
          return;
        }
        
        const newMsg: TranscriptMessage = {
          id: message.id || `msg-${Date.now()}-${Math.random()}`,
          text: rawText, // Keep raw text for now, we'll clean it later
          speaker: rawSpeaker as TranscriptMessage["speaker"],
          timestamp: new Date(),
        };

        // Add to pending queue with deduplication
        if (!pendingMessagesRef.current.some(m => m.id === newMsg.id)) {
          pendingMessagesRef.current.push(newMsg);
        }
        
        // Clear existing batch timeout
        if (batchTimeoutRef.current) {
          clearTimeout(batchTimeoutRef.current);
        }
        
        // Set new batch timeout
        batchTimeoutRef.current = setTimeout(() => {
          processPendingMessages();
        }, BATCH_UPDATE_INTERVAL);
      }
      
      // 🚀 NEW: Listen for AI_RESULT messages
      if (message.type === "AI_RESULT") {
        console.log("🤖 [TRANSCRIPT] AI RESULT RECEIVED:", message);
        console.log("🤖 [TRANSCRIPT] Questions:", message.questions);
        console.log("🤖 [TRANSCRIPT] Alerts:", message.alerts);
        console.log("🤖 [TRANSCRIPT] Score:", message.score);
        
        // Update UI state with AI results
        setFollowUpQuestions(message.questions || []);
        setAlerts(message.alerts || []);
        setScore(message.score || 0);
      }
    };

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => {
        chrome.runtime.onMessage.removeListener(handler);
        // Clean up timeouts
        if (batchTimeoutRef.current) {
          clearTimeout(batchTimeoutRef.current);
        }
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        // Process any remaining messages
        processPendingMessages();
      };
    }
  }, []);

  return (
    <div className="panel-card flex flex-col" style={{ maxHeight: "300px" }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="panel-label">LIVE TRANSCRIPT</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500">
            {messages.length}{totalCount > messages.length ? `+` : ""} / {totalCount} lines
          </span>

          <button
            onClick={() => setIsLive((v) => !v)}
            className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${
              isLive
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-slate-700 text-slate-400 border border-slate-600"
            }`}
          >
            {isLive ? "● LIVE" : "PAUSED"}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm bg-indigo-500/60" />
          <span className="text-[10px] text-slate-500">Interviewer</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-sm bg-slate-600" />
          <span className="text-[10px] text-slate-500">Candidate</span>
        </div>
      </div>

      {/* Scrollable messages container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar transcript-container"
        style={{ 
          overflowAnchor: "auto",
          scrollBehavior: 'smooth',
          willChange: 'scroll-position'
        }}
      >
        {totalCount > MAX_MESSAGES && (
          <div className="text-center text-[9px] text-slate-600 py-1">
            Showing last {MAX_MESSAGES} of {totalCount} messages
          </div>
        )}

        {messages.map((msg, i) => {
          const isInterviewer = msg.speaker === "INTERVIEWER";
          const isCandidate = msg.speaker === "CANDIDATE";

          return (
            <div
              key={msg.id || i}
              className={`flex ${isInterviewer ? "justify-end" : "justify-start"} mb-3`}
            >
              <div
                className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed relative group transcript-message shadow-sm ${
                  isInterviewer
                    ? "bg-gradient-to-r from-indigo-600/30 to-indigo-500/20 border border-indigo-400/20 text-indigo-50 rounded-br-none"
                    : isCandidate
                      ? "bg-gradient-to-r from-slate-700/80 to-slate-600/60 border border-slate-500/30 text-slate-100 rounded-bl-none"
                      : "bg-gradient-to-r from-emerald-600/25 to-emerald-500/15 border border-emerald-400/20 text-emerald-50 rounded-bl-none"
                }`}
              >
                {/* Speaker label */}
                <div
                  className={`text-[10px] font-semibold mb-1.5 uppercase tracking-wider flex items-center gap-1.5 ${
                    isInterviewer ? "text-indigo-300" :
                    isCandidate ? "text-slate-400" : "text-emerald-300"
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    isInterviewer ? "bg-indigo-400" :
                    isCandidate ? "bg-slate-400" : "bg-emerald-400"
                  }`} />
                  {isInterviewer ? "INTERVIEWER" : isCandidate ? "CANDIDATE" : "MIXED"}
                </div>
                
                {/* Message text - show only new content */}
                <p className="whitespace-pre-wrap break-words text-[13px] font-medium">
                  {(() => {
                    const currentText = finalMessageCleanup(msg.text) || "...";
                    const currentMsgIndex = messages.findIndex((m) => m.id === msg.id);
                    const prevMsg = currentMsgIndex > 0 ? messages[currentMsgIndex - 1] : null;
                    const prevText = prevMsg && prevMsg.speaker === msg.speaker ? finalMessageCleanup(prevMsg.text) || "" : "";
                    const displayText = getMessageDifference(currentText, prevText) || currentText;
                    return displayText;
                  })()}
                </p>
                
                {/* Timestamp */}
                <div
                  className={`text-[9px] mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 font-mono ${
                    isInterviewer ? "text-indigo-300/70 text-right" : "text-slate-400/70"
                  }`}
                >
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          );
        })}

        {/* Invisible anchor — kept for potential future use */}
        <div style={{ height: 1 }} />
      </div>
    </div>
  );
};

export default TranscriptPanel;