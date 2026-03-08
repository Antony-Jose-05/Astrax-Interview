import React, { useState, useEffect, useCallback } from 'react';

import { ResumePanel } from '../ResumePanel';
import TranscriptPanel from '../TranscriptPanel';
import { QuestionsPanel } from '../QuestionsPanel';
import { AlertPanel } from '../AlertPanel';
import { ScorePanel } from '../ScorePanel';

// ── CRITICAL FIX ────────────────────────────────────────────────────────────
// The previous version had ReactDOM.createRoot() at the BOTTOM of this file.
// That caused a double-mount: sidepanel/main.tsx also calls createRoot on the
// same #root element. React throws a hard error and the panel goes blank.
// This file now exports ONLY the App component — mounting is done exclusively
// in entrypoints/sidepanel/main.tsx.
// ────────────────────────────────────────────────────────────────────────────

type PanelId = 'resume' | 'transcript' | 'questions' | 'alerts' | 'scores';

interface ServiceStatus {
  stt: 'online' | 'offline';
  ai: 'online' | 'offline';
  resume: 'online' | 'offline';
}

// ─────────────────────────────────────────────
// ElapsedTimer
// ─────────────────────────────────────────────

function ElapsedTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0);

  // Reset to 0 whenever a new recording session starts
  useEffect(() => {
    if (running) setSeconds(0);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const fmt = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  return (
    <span className="text-xs font-mono text-slate-400 tabular-nums">
      {h > 0 ? `${fmt(h)}:` : ''}
      {fmt(m)}:{fmt(s)}
    </span>
  );
}

// ─────────────────────────────────────────────
// ServiceDot
// ─────────────────────────────────────────────

function ServiceDot({
  status,
  label,
}: {
  status: 'online' | 'offline';
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 border border-slate-700"
      title={`${label}: ${status}`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'online' ? 'bg-emerald-500' : 'bg-red-500'
        }`}
      />
      <span className="text-[9px] font-bold text-slate-400">{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────

function App() {
  const [activePanel, setActivePanel] = useState<PanelId>('transcript');
  const [isRecording, setIsRecording] = useState(false);
  const [services, setServices] = useState<ServiceStatus>({
    stt: 'offline',
    ai: 'offline',
    resume: 'offline',
  });

  // ── FIX: dynamic badge counts wired to real AI_RESULT messages ──────────
  // Previously these were hardcoded numbers in the navItems array and never
  // updated. Now they track actual live data from the background worker.
  const [questionCount, setQuestionCount] = useState(0);
  const [alertCount, setAlertCount] = useState(0);

  // ── Service health polling ───────────────────────────────────────────────
  useEffect(() => {
    const checkServices = async () => {
      // ── FIX: health checks were probing wrong ports in the old version ───
      // STT = :8000, Resume Parser = :8001, AI Intelligence = :8002
      const [sttRes, resumeRes, aiRes] = await Promise.allSettled([
        fetch('http://127.0.0.1:8000/').then((r) => r.ok),
        fetch('http://127.0.0.1:8001/health').then((r) => r.ok),
        fetch('http://127.0.0.1:8002/').then((r) => r.ok),
      ]);

      setServices({
        stt:    sttRes.status    === 'fulfilled' && sttRes.value    ? 'online' : 'offline',
        resume: resumeRes.status === 'fulfilled' && resumeRes.value ? 'online' : 'offline',
        ai:     aiRes.status     === 'fulfilled' && aiRes.value     ? 'online' : 'offline',
      });
    };

    checkServices();
    const id = setInterval(checkServices, 8000);
    return () => clearInterval(id);
  }, []);

  // ── Listen for AI_RESULT to update badge counts ──────────────────────────
  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === 'AI_RESULT') {
        setQuestionCount(message.questions?.length ?? 0);
        setAlertCount(message.alerts?.length ?? 0);
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => chrome.runtime.onMessage.removeListener(handler);
    }
  }, []);

  // ── Toggle recording via content script ─────────────────────────────────
  const toggleTracking = useCallback(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) {
        alert(
          'No active tab found. Navigate to a Google Meet or Zoom call first.'
        );
        return;
      }

      chrome.tabs.sendMessage(
        tabId,
        { type: 'TOGGLE_RECORDING', active: !isRecording },
        (res) => {
          if (chrome.runtime.lastError) {
            console.error('[sidebar/App] sendMessage error:', chrome.runtime.lastError.message);
            alert(
              'Could not connect to the page.\n\n' +
              'Make sure you are on a Google Meet or Zoom call and reload the tab.'
            );
          } else {
            setIsRecording(!!res?.active);
          }
        }
      );
    });
  }, [isRecording]);

  // ── Nav items — badges now come from live state, not hardcoded values ────
  const navItems = [
    { id: 'resume'     as PanelId, icon: '👤', label: 'Profile',    badge: null                                          },
    { id: 'transcript' as PanelId, icon: '🎙', label: 'Transcript', badge: null                                          },
    { id: 'questions'  as PanelId, icon: '💡', label: 'Questions',  badge: questionCount > 0 ? questionCount : null      },
    { id: 'alerts'     as PanelId, icon: '⚠',  label: 'Alerts',    badge: alertCount    > 0 ? alertCount    : null      },
    { id: 'scores'     as PanelId, icon: '📊', label: 'Scores',     badge: null                                          },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-white overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="px-4 py-3 border-b border-slate-700 flex-shrink-0">
        {/* Row 1: logo + controls */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 w-7 h-7 rounded flex items-center justify-center text-white font-bold text-xs">
              AI
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">InterviewIQ</div>
              <div className="text-[10px] text-indigo-400 leading-none">AI Interview Assistant</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ElapsedTimer running={isRecording} />
            <button
              onClick={toggleTracking}
              className={`px-3 py-1.5 rounded text-[10px] font-bold transition-all ${
                isRecording
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {isRecording ? '◼ STOP' : '▶ START TRACKING'}
            </button>
          </div>
        </div>

        {/* Row 2: service status dots */}
        <div className="flex items-center gap-2">
          <ServiceDot status={services.stt}    label="STT"    />
          <ServiceDot status={services.resume} label="Resume" />
          <ServiceDot status={services.ai}     label="AI"     />

          {/* Live recording indicator */}
          {isRecording && (
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] text-red-400 font-bold tracking-wide">LIVE</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="flex gap-1 px-2 py-2 border-b border-slate-700 flex-shrink-0">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActivePanel(item.id)}
            className={`relative flex-1 text-[10px] py-1.5 rounded flex flex-col items-center gap-0.5 transition-colors ${
              activePanel === item.id
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-base leading-none">{item.icon}</span>
            <span className="leading-none">{item.label}</span>

            {/* ── FIX: badges now show real counts, not hardcoded 3/2 ─── */}
            {item.badge !== null && (
              <span
                className={`absolute top-0.5 right-1 text-[8px] font-bold px-1 py-px rounded-full leading-none ${
                  item.id === 'alerts' ? 'bg-red-500 text-white' : 'bg-purple-500 text-white'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* ── Panel content ───────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {activePanel === 'resume'     && <ResumePanel />}
        {activePanel === 'transcript' && <TranscriptPanel />}
        {activePanel === 'questions'  && <QuestionsPanel />}
        {activePanel === 'alerts'     && <AlertPanel />}
        {activePanel === 'scores'     && <ScorePanel />}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="px-3 py-2 border-t border-slate-700 text-xs flex justify-between items-center flex-shrink-0">
        {/* ── FIX: was hardcoded "Agent Active" — now reflects real state ── */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-600'
            }`}
          />
          <span className={isRecording ? 'text-red-400' : 'text-slate-500'}>
            {isRecording ? 'Recording active' : 'Idle'}
          </span>
        </div>
        <span className="text-indigo-400">v1.1</span>
      </footer>
    </div>
  );
}

export default App;

// ── NOTE ────────────────────────────────────────────────────────────────────
// There is intentionally NO ReactDOM.createRoot() call here.
// Mounting is handled exclusively by entrypoints/sidepanel/main.tsx.
// Adding it here again would cause a double-mount error.
// ────────────────────────────────────────────────────────────────────────────