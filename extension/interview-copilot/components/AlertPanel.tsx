import React, { useState } from "react";

interface MismatchAlert {
  id: string;
  resumeClaim: string;
  candidateClaim: string;
  confidenceScore: number;
  field: string;
  severity: "high" | "medium" | "low";
}

const defaultAlerts: MismatchAlert[] = [
  {
    id: "1",
    field: "Leadership Experience",
    resumeClaim: "Led a team of 12 engineers across 3 squads",
    candidateClaim: "I was working closely with the team leads, mostly as an IC",
    confidenceScore: 91,
    severity: "high",
  },
  {
    id: "2",
    field: "System Scale",
    resumeClaim: "Architected system processing 50M+ transactions/month",
    candidateClaim: "We were at about 10 million requests per day",
    confidenceScore: 74,
    severity: "medium",
  },
  {
    id: "3",
    field: "Kubernetes Expertise",
    resumeClaim: "Kubernetes certified, 4 years production experience",
    candidateClaim: "I've used K8s mostly through our DevOps team's tooling",
    confidenceScore: 58,
    severity: "medium",
  },
];

const severityConfig = {
  high: {
    border: "border-red-500/40",
    bg: "bg-red-500/5",
    badge: "bg-red-500/20 text-red-400 border-red-500/30",
    dot: "bg-red-500",
    label: "HIGH RISK",
    glow: "shadow-red-900/40",
  },
  medium: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    dot: "bg-amber-500",
    label: "MEDIUM",
    glow: "shadow-amber-900/30",
  },
  low: {
    border: "border-slate-600/30",
    bg: "bg-slate-700/20",
    badge: "bg-slate-600/30 text-slate-400 border-slate-500/20",
    dot: "bg-slate-400",
    label: "LOW",
    glow: "",
  },
};

export const AlertPanel: React.FC = () => {
  const [alerts, setAlerts] = useState<MismatchAlert[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  React.useEffect(() => {
    const handler = (message: any) => {
      console.log("[AlertPanel] Message received:", message.type, message);
      if (message.type === "AI_RESULT" && message.alerts) {
        console.log("[AlertPanel] Updating alerts:", message.alerts.length);
        const newAlerts: MismatchAlert[] = message.alerts.map((a: any, i: number) => ({
          id: `alert-${Date.now()}-${i}`,
          field: "AI Detection",
          resumeClaim: a.resume_claim || "No direct resume claim found.",
          candidateClaim: a.interview_claim || a.quote || "N/A",
          confidenceScore: 100,
          severity: (a.severity === "high" || a.severity === "medium" || a.severity === "low") ? a.severity : "medium",
        }));
        setAlerts(newAlerts);
      }
    };

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => chrome.runtime.onMessage.removeListener(handler);
    }
  }, []);

  const visible = alerts.filter(a => !dismissed.includes(a.id));

  return (
    <div className="panel-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="panel-label">RESUME MISMATCH ALERTS</span>
        <div className="ml-auto flex items-center gap-1.5">
          {visible.length > 0 && (
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
              {visible.length} ACTIVE
            </span>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-2xl mb-2">✓</div>
          <p className="text-slate-500 text-xs">No mismatches detected</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((alert) => {
            const cfg = severityConfig[alert.severity];
            return (
              <div
                key={alert.id}
                className={`rounded-xl border p-3 ${cfg.border} ${cfg.bg} shadow-lg ${cfg.glow} transition-all duration-300`}
              >
                {/* Top */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} />
                    <span className="text-slate-300 text-xs font-semibold">{alert.field}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold tracking-wider ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                    <button
                      onClick={() => setDismissed(d => [...d, alert.id])}
                      className="text-slate-600 hover:text-slate-400 text-xs ml-1 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Claims comparison */}
                <div className="space-y-2 mb-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <div className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider mb-1">📄 Resume Claims</div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">"{alert.resumeClaim}"</p>
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="flex items-center gap-1 text-red-400/70">
                      <div className="w-8 h-px bg-red-500/30" />
                      <span className="text-[9px] font-bold">VS</span>
                      <div className="w-8 h-px bg-red-500/30" />
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-700/40 border border-slate-600/30">
                    <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">🎙 Candidate Said</div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">"{alert.candidateClaim}"</p>
                  </div>
                </div>

                {/* Confidence */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Mismatch Confidence</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      alert.confidenceScore >= 80 ? "text-red-400" : "text-amber-400"
                    }`}>
                      {alert.confidenceScore}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        alert.confidenceScore >= 80
                          ? "bg-gradient-to-r from-red-600 to-red-400"
                          : "bg-gradient-to-r from-amber-600 to-amber-400"
                      }`}
                      style={{ width: `${alert.confidenceScore}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};