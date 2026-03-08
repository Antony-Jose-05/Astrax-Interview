import React, { useEffect, useState } from "react";

function getScoreLabel(score: number): { label: string; color: string } {
  const displayScore = Math.round(score * 10); // Convert 0-10 scale to 0-100
  if (displayScore >= 80) return { label: "STRONG", color: "text-emerald-400" };
  if (displayScore >= 50) return { label: "AVERAGE", color: "text-amber-400" };
  return { label: "WEAK", color: "text-red-400" };
}

export const ScorePanel: React.FC = () => {
  const [animated, setAnimated] = useState(false);
  const [liveScore, setLiveScore] = useState<number>(0);

  useEffect(() => {
    const handler = (event: CustomEvent) => {
      console.log("[ScorePanel] AI_RESULT custom event received:", event.detail);
      const message = event.detail;
      if (typeof message.score === "number") {
        console.log("[ScorePanel] Updating score:", message.score);
        const displayScore = Math.round(message.score * 10);
        setLiveScore(displayScore);
        setAnimated(false);
        setTimeout(() => setAnimated(true), 50);
      }
    };

    window.addEventListener('AI_RESULT', handler as EventListener);
    return () => window.removeEventListener('AI_RESULT', handler as EventListener);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(timer);
  }, []);

  const { label, color } = getScoreLabel(liveScore / 10); // Convert back for label calculation

  return (
    <div className="panel-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="panel-label">CANDIDATE EVALUATION</span>
        <div className="ml-auto">
          <span className="text-[10px] text-slate-400 font-mono">LIVE SCORING</span>
        </div>
      </div>

      {/* Overall Score */}
      <div className="flex items-center justify-between p-3 mb-4 rounded-xl bg-gradient-to-r from-indigo-900/40 to-slate-800/60 border border-indigo-500/20">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Overall Score</div>
          <div className="text-slate-300 text-xs">{label}</div>
        </div>
        <div className="relative">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18" cy="18" r="15.9"
              fill="none"
              stroke="#1e293b"
              strokeWidth="3"
            />
            <circle
              cx="18" cy="18" r="15.9"
              fill="none"
              stroke="url(#scoreGrad)"
              strokeWidth="3"
              strokeDasharray={`${animated ? liveScore : 0} 100`}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
            <defs>
              <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#818cf8" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-base font-bold text-white font-mono">{liveScore}</span>
          </div>
        </div>
      </div>

      {/* Rating */}
      <div className="text-center p-4">
        <div className={`text-2xl font-bold ${color}`}>{label}</div>
        <div className="text-slate-500 text-sm mt-1">{liveScore} / 100</div>
      </div>
    </div>
  );
};