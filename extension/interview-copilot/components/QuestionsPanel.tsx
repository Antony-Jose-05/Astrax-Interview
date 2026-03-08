import React, { useState } from "react";

interface FollowUpQuestion {
  id: string;
  question: string;
  vaguenessScore: number;
  category: "technical" | "behavioral" | "clarification" | "deep-dive";
  rationale: string;
}

const defaultQuestions: FollowUpQuestion[] = [
  {
    id: "1",
    question: "Can you walk me through how you actually implemented the circuit breaker — did you use a state machine pattern?",
    vaguenessScore: 78,
    category: "deep-dive",
    rationale: "Candidate used buzzwords without technical specifics",
  },
  {
    id: "2",
    question: "What was the P99 latency SLA you were targeting, and how often were thresholds breached in production?",
    vaguenessScore: 62,
    category: "technical",
    rationale: "Metrics mentioned but no concrete numbers given",
  },
  {
    id: "3",
    question: "How did your team decide when to run chaos engineering sessions — was it scheduled or triggered by events?",
    vaguenessScore: 45,
    category: "clarification",
    rationale: "Process detail unclear — probe for ownership vs team process",
  },
];

const categoryConfig: Record<string, { color: string; label: string }> = {
  "deep-dive": { color: "text-purple-400 bg-purple-500/15 border-purple-500/30", label: "DEEP DIVE" },
  "technical": { color: "text-blue-400 bg-blue-500/15 border-blue-500/30", label: "TECHNICAL" },
  "clarification": { color: "text-amber-400 bg-amber-500/15 border-amber-500/30", label: "CLARIFY" },
  "behavioral": { color: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30", label: "BEHAVIORAL" },
  "probe_depth": { color: "text-blue-400 bg-blue-500/15 border-blue-500/30", label: "DEEP DIVE" },
  "verify_claim": { color: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30", label: "VERIFY" },
  "test_edge_case": { color: "text-red-400 bg-red-500/15 border-red-500/30", label: "EDGE CASE" },
  "challenge_assumption": { color: "text-purple-400 bg-purple-500/15 border-purple-500/30", label: "CHALLENGE" },
  "default": { color: "text-slate-400 bg-slate-500/15 border-slate-500/30", label: "FOLLOW-UP" }
};

function vaguenessColor(score: number): string {
  if (score >= 70) return "bg-red-500";
  if (score >= 45) return "bg-amber-500";
  return "bg-emerald-500";
}

function vaguenessLabel(score: number): string {
  if (score >= 70) return "HIGH VAGUENESS";
  if (score >= 45) return "MODERATE";
  return "LOW";
}

export const QuestionsPanel: React.FC = () => {
  const [questions, setQuestions] = useState<FollowUpQuestion[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // Listen for AI_RESULT custom events from App component
  React.useEffect(() => {
    const handler = (event: CustomEvent) => {
      console.log("[QuestionsPanel] AI_RESULT custom event received:", event.detail);
      const message = event.detail;
      if (message.questions) {
        console.log("[QuestionsPanel] Updating questions:", message.questions.length);
        const newQuestions: FollowUpQuestion[] = message.questions.map((q: any, i: number) => {
          // Safely handle different question formats
          let questionText = "";
          let intent = "technical";
          let triggeredBy = "";
          
          if (typeof q === "string") {
            questionText = q;
          } else if (q && typeof q === "object") {
            questionText = q.question || q.text || "";
            intent = q.intent || "technical";
            triggeredBy = q.triggered_by || "";
          }
          
          return {
            id: `ai-${Date.now()}-${i}`,
            question: questionText,
            vaguenessScore: 0, 
            category: intent as "technical" | "behavioral" | "clarification" | "deep-dive",
            rationale: triggeredBy ? `Triggered by: "${triggeredBy}"` : "Live AI suggestion",
          };
        }).filter(q => q.question); // Filter out empty questions
        setQuestions(newQuestions);
      }
    };

    window.addEventListener('AI_RESULT', handler as EventListener);
    return () => window.removeEventListener('AI_RESULT', handler as EventListener);
  }, []);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="panel-card">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
        <span className="panel-label">AI FOLLOW-UP SUGGESTIONS</span>
        <span className="ml-auto text-[10px] font-mono text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
          {questions.length} queued
        </span>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => {
          // Safe fallback for unknown intents - prevents crashes
          const catCfg = categoryConfig[q.category] || categoryConfig["default"];
          return (
            <div
              key={q.id}
              className="p-3 rounded-xl bg-slate-700/30 border border-slate-600/20 hover:border-indigo-500/30 transition-all duration-200 group"
            >
              {/* Top row */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-slate-500 font-mono">#{String(i + 1).padStart(2, "0")}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold tracking-wider ${catCfg.color}`}>
                  {catCfg.label}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className={`text-[9px] font-bold tracking-wider ${
                    q.vaguenessScore >= 70 ? "text-red-400" : q.vaguenessScore >= 45 ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {vaguenessLabel(q.vaguenessScore)}
                  </span>
                </div>
              </div>

              {/* Vagueness bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">Vagueness Score</span>
                  <span className="text-[9px] font-mono font-bold text-slate-300">{q.vaguenessScore}%</span>
                </div>
                <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${vaguenessColor(q.vaguenessScore)}`}
                    style={{ width: `${q.vaguenessScore}%` }}
                  />
                </div>
              </div>

              {/* Rationale */}
              <p className="text-[10px] text-slate-500 italic mb-2">⚡ {q.rationale || "Live AI suggestion"}</p>

              {/* Question text - safe fallback */}
              <p className="text-slate-200 text-xs leading-relaxed mb-2">
                "{q.question || "Unknown question"}"
              </p>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(q.id, q.question || "Unknown question")}
                  className="flex-1 text-[10px] py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/50 transition-all font-semibold"
                >
                  {copied === q.id ? "✓ COPIED" : "COPY QUESTION"}
                </button>
                <button className="text-[10px] px-2 py-1 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 border border-slate-600/30 transition-all">
                  SKIP
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};