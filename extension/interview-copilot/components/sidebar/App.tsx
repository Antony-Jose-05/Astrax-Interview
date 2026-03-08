import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";

import { ResumePanel } from "../../components/ResumePanel";
import TranscriptPanel from "../../components/TranscriptPanel";
import { QuestionsPanel } from "../../components/QuestionsPanel";
import { AlertPanel } from "../../components/AlertPanel";
import { ScorePanel } from "../../components/ScorePanel";

type PanelId = "resume" | "transcript" | "questions" | "alerts" | "scores";

interface NavItem {
  id: PanelId;
  icon: string;
  label: string;
  badge?: number;
  badgeColor?: string;
}

const navItems: NavItem[] = [
  { id: "resume", icon: "👤", label: "Profile" },
  { id: "transcript", icon: "🎙", label: "Transcript" },
  { id: "questions", icon: "💡", label: "Questions", badge: 3, badgeColor: "bg-purple-500" },
  { id: "alerts", icon: "⚠", label: "Alerts", badge: 2, badgeColor: "bg-red-500" },
  { id: "scores", icon: "📊", label: "Scores" },
];

function ElapsedTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;

    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [running]);

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const fmt = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full ${
          running ? "bg-red-500 animate-pulse" : "bg-slate-500"
        } cursor-pointer`}
        onClick={() => setRunning((r) => !r)}
      />
      <span className="text-xs font-mono text-slate-300">
        {h > 0 ? `${fmt(h)}:` : ""}
        {fmt(m)}:{fmt(s)}
      </span>
    </div>
  );
}

function App() {
  const [activePanel, setActivePanel] = useState<PanelId>("transcript");
  const [isRecording, setIsRecording] = useState(false);
  const [sttStatus, setSttStatus] = useState<"online" | "offline">("offline");
  const [aiStatus, setAiStatus] = useState<"online" | "offline">("offline");

  useEffect(() => {
    // Ping services to check status
    const checkStatus = async () => {
      try {
        const sttReq = await fetch("http://localhost:8000/").catch(() => null);
        setSttStatus(sttReq ? "online" : "offline");
        
        const aiReq = await fetch("http://localhost:8002/").catch(() => null);
        setAiStatus(aiReq ? "online" : "offline");
      } catch (e) {}
    };
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const toggleTracking = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "TOGGLE_RECORDING", active: !isRecording }, (res) => {
          if (chrome.runtime.lastError) {
            console.error("Content script not ready");
          } else {
            setIsRecording(!!res?.active);
          }
        });
      }
    });
  };

  return (
    <div
      style={{ width: "420px", height: "100vh" }}
      className="bg-slate-900 flex flex-col text-white"
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-slate-700 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 w-7 h-7 rounded flex items-center justify-center text-white font-bold">
            AI
          </div>
          <div>
            <div className="text-sm font-bold">InterviewIQ</div>
            <div className="text-xs text-indigo-400">AI Interview Assistant</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            <div className={`w-1.5 h-1.5 rounded-full ${sttStatus === "online" ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-[9px] font-bold text-slate-400">STT</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
            <div className={`w-1.5 h-1.5 rounded-full ${aiStatus === "online" ? "bg-emerald-500" : "bg-red-500"}`} />
            <span className="text-[9px] font-bold text-slate-400">AI</span>
          </div>
          <button 
            onClick={toggleTracking}
            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${
              isRecording 
                ? "bg-red-500/20 text-red-500 border border-red-500/30 animate-pulse" 
                : "bg-emerald-600 text-white"
            }`}
          >
            {isRecording ? "◼ STOP TRACKING" : "▶ START TRACKING"}
          </button>
          <ElapsedTimer />
        </div>
      </header>

      {/* Navigation */}
      <nav className="flex gap-1 px-2 py-2 border-b border-slate-700">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActivePanel(item.id)}
            className={`flex-1 text-xs py-1 rounded ${
              activePanel === item.id
                ? "bg-indigo-600 text-white"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            <div>{item.icon}</div>
            <div>{item.label}</div>
          </button>
        ))}
      </nav>

      {/* Panel Content */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {activePanel === "resume" && <ResumePanel />}
        {activePanel === "transcript" && <TranscriptPanel />}
        {activePanel === "questions" && <QuestionsPanel />}
        {activePanel === "alerts" && <AlertPanel />}
        {activePanel === "scores" && <ScorePanel />}
      </main>

      {/* Footer */}
      <footer className="px-3 py-2 border-t border-slate-700 text-xs flex justify-between">
        <span className="text-green-400">Agent Active</span>
        <span className="text-indigo-400">v1.0</span>
      </footer>
    </div>
  );
}

export default App;

/* React Mount */
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(<App />);