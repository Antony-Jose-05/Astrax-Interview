import React, { useEffect, useState } from "react";

interface ScoreMetric {
  key: string;
  label: string;
  score: number;
  icon: string;
  color: string;
  glow: string;
  description: string;
}

const metrics: ScoreMetric[] = [
  {
    key: "technical_depth",
    label: "Technical Depth",
    score: 82,
    icon: "⚙",
    color: "from-blue-600 to-indigo-500",
    glow: "shadow-blue-500/20",
    description: "Strong on distributed systems, K8s gaps noted",
  },
  {
    key: "communication",
    label: "Communication",
    score: 74,
    icon: "💬",
    color: "from-emerald-600 to-teal-500",
    glow: "shadow-emerald-500/20",
    description: "Clear but uses jargon without always explaining",
  },
  {
    key: "confidence",
    label: "Confidence",
    score: 68,
    icon: "⚡",
    color: "from-amber-600 to-yellow-500",
    glow: "shadow-amber-500/20",
    description: "Hesitant on leadership questions",
  },
  {
    key: "problem_solving",
    label: "Problem Solving",
    score: 88,
    icon: "🧠",
    color: "from-purple-600 to-violet-500",
    glow: "shadow-purple-500/20",
    description: "Excellent structured thinking with real examples",
  },
  {
    key: "culture_fit",
    label: "Culture Fit",
    score: 79,
    icon: "✦",
    color: "from-pink-600 to-rose-500",
    glow: "shadow-pink-500/20",
    description: "Values align well; collaborative mindset evident",
  },
];

function getScoreLabel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "EXCEPTIONAL", color: "text-emerald-400" };
  if (score >= 70) return { label: "STRONG", color: "text-blue-400" };
  if (score >= 55) return { label: "ADEQUATE", color: "text-amber-400" };
  return { label: "WEAK", color: "text-red-400" };
}

const overallScore = Math.round(metrics.reduce((sum, m) => sum + m.score, 0) / metrics.length);

export const ScorePanel: React.FC = () => {
  const [animated, setAnimated] = useState(false);
  const [liveScore, setLiveScore] = useState<number>(0);

  useEffect(() => {
    const handler = (message: any) => {
      console.log("[ScorePanel] Message received:", message.type, message);
      if (message.type === "AI_RESULT" && typeof message.score === "number") {
        console.log("[ScorePanel] Updating score:", message.score);
        setLiveScore(Math.round(message.score));
        setAnimated(false);
        setTimeout(() => setAnimated(true), 50);
      }
    };

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => chrome.runtime.onMessage.removeListener(handler);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(timer);
  }, []);

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
          <div className="text-slate-300 text-xs">{getScoreLabel(liveScore).label}</div>
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
              strokeDasharray={`${animated ? (liveScore / 100) * 100 : 0} 100`}
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

      {/* Individual metrics */}
      <div className="space-y-3">
        {metrics.map((metric, i) => {
          const { label, color } = getScoreLabel(metric.score);
          return (
            <div key={metric.key} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm leading-none">{metric.icon}</span>
                  <span className="text-slate-300 text-xs font-medium">{metric.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold tracking-wider ${color}`}>{label}</span>
                  <span className="text-slate-300 text-xs font-mono font-bold">{metric.score}</span>
                </div>
              </div>

              {/* Bar */}
              <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${metric.color} shadow-lg ${metric.glow} transition-all duration-1000 ease-out`}
                  style={{
                    width: animated ? `${metric.score}%` : "0%",
                    transitionDelay: `${i * 100}ms`,
                  }}
                />
              </div>

              {/* Description tooltip on hover */}
              <p className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors mt-0.5 truncate">
                {metric.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Recommendation */}
      <div className="mt-4 p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
        <div className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider mb-1">⚡ AI Recommendation</div>
        <p className="text-slate-300 text-[11px] leading-relaxed">
          Strong technical candidate. Probe leadership claims further. Recommend advancing to system design round.
        </p>
      </div>
    </div>
  );
};