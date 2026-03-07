import "../../assets/tailwind.css";
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

import { ResumePanel } from "../ResumePanel";
import TranscriptPanel from "../TranscriptPanel";
import { QuestionsPanel } from "../QuestionsPanel";
import { AlertPanel } from "../AlertPanel";
import { ScorePanel } from "../ScorePanel";

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  const fmt = (n: number) => String(n).padStart(2, "0");
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <span className="text-xs font-mono text-slate-400">{fmt(m)}:{fmt(s)}</span>;
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [sttStatus, setSttStatus] = useState<"online" | "offline">("offline");
  const [aiStatus, setAiStatus] = useState<"online" | "offline">("offline");

  useEffect(() => {
    const checkStatus = async () => {
      const stt = await fetch("http://127.0.0.1:8002/").catch(() => null);
      setSttStatus(stt ? "online" : "offline");
      const ai = await fetch("http://127.0.0.1:8001/").catch(() => null);
      setAiStatus(ai ? "online" : "offline");
    };
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleTracking = () => {
    console.log("[Popup] Attempting to toggle tracking. Current state:", isRecording);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        console.log("[Popup] Found active tab:", tabId, tabs[0]?.url);
        chrome.tabs.sendMessage(tabId, { type: "TOGGLE_RECORDING", active: !isRecording }, (res) => {
          if (chrome.runtime.lastError) {
            console.error("[Popup] sendMessage error:", chrome.runtime.lastError.message);
            alert("Please make sure you are on a Google Meet or Zoom call page and refresh the page.");
          } else {
            console.log("[Popup] Received response from content script:", res);
            setIsRecording(!!res?.active);
          }
        });
      } else {
        console.warn("[Popup] No active tab found.");
      }
    });
  };

  return (
    <div
      style={{ width: "450px", height: "600px" }}
      className="bg-slate-900 text-white flex flex-col overflow-hidden"
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold">IQ</div>
          <span className="text-sm font-bold tracking-tight">InterviewIQ</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${sttStatus === "online" ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-[8px] text-slate-400">STT</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full ${aiStatus === "online" ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-[8px] text-slate-400">AI</span>
          </div>
          <button 
            onClick={toggleTracking}
            className={`px-3 py-1 rounded text-[10px] font-bold transition-all ${
              isRecording ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-emerald-600 text-white"
            }`}
          >
            {isRecording ? "STOP" : "START TRACKING"}
          </button>
          <ElapsedTimer />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-3 space-y-4">
        <ResumePanel />
        <TranscriptPanel />
        <QuestionsPanel />
        <AlertPanel />
        <ScorePanel />
      </main>
    </div>
  );
}

export default App;

/* Mount React to popup */
const rootElement = document.getElementById("root");

if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}