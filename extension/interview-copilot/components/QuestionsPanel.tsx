import React, { useState, useEffect } from 'react';

// ── CRITICAL FIX ────────────────────────────────────────────────────────────
// Previously this component listened to window.addEventListener('AI_RESULT').
// That custom DOM event was only ever dispatched by components/App/App.tsx.
// Since the side panel uses sidebar/App.tsx which never dispatches that event,
// questions NEVER appeared in the real side panel — only in local dev previews.
//
// Fix: listen directly on chrome.runtime.onMessage, exactly like TranscriptPanel
// and AlertPanel already do. This works in any context (popup, sidepanel, etc.)
// ────────────────────────────────────────────────────────────────────────────

interface FollowUpQuestion {
  id: string;
  question: string;
  intent: string;
  triggeredBy: string;
}

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const categoryConfig: Record<string, { color: string; label: string }> = {
  probe_depth:          { color: 'text-purple-400 bg-purple-500/15 border-purple-500/30', label: 'DEEP DIVE'  },
  verify_claim:         { color: 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30', label: 'VERIFY'     },
  test_edge_case:       { color: 'text-red-400    bg-red-500/15    border-red-500/30',    label: 'EDGE CASE'  },
  challenge_assumption: { color: 'text-purple-400 bg-purple-500/15 border-purple-500/30', label: 'CHALLENGE'  },
  technical:            { color: 'text-blue-400   bg-blue-500/15   border-blue-500/30',   label: 'TECHNICAL'  },
  behavioral:           { color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', label: 'BEHAVIORAL' },
  clarification:        { color: 'text-amber-400  bg-amber-500/15  border-amber-500/30',  label: 'CLARIFY'    },
  'deep-dive':          { color: 'text-purple-400 bg-purple-500/15 border-purple-500/30', label: 'DEEP DIVE'  },
  default:              { color: 'text-slate-400  bg-slate-500/15  border-slate-500/30',  label: 'FOLLOW-UP'  },
};

function getCategoryConfig(intent: string) {
  return categoryConfig[intent] ?? categoryConfig['default'];
}

// ─────────────────────────────────────────────
// Question Card
// ─────────────────────────────────────────────

function QuestionCard({
  question,
  onCopy,
  copied,
}: {
  question: FollowUpQuestion;
  onCopy: (id: string, text: string) => void;
  copied: string | null;
}) {
  const cfg = getCategoryConfig(question.intent);

  return (
    <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/40 space-y-2">
      {/* Category badge */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded border font-bold tracking-wider ${cfg.color}`}
        >
          {cfg.label}
        </span>

        {/* Copy button */}
        <button
          onClick={() => onCopy(question.id, question.question)}
          className="text-[9px] text-slate-500 hover:text-indigo-400 transition-colors font-medium"
        >
          {copied === question.id ? '✓ COPIED' : 'COPY'}
        </button>
      </div>

      {/* Question text */}
      <p className="text-slate-200 text-xs leading-relaxed">{question.question}</p>

      {/* Triggered by */}
      {question.triggeredBy && (
        <div className="px-2 py-1.5 rounded bg-slate-900/60 border-l-2 border-indigo-500/40">
          <p className="text-[10px] text-slate-500 italic leading-snug">
            Triggered by: "{question.triggeredBy}"
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────

export const QuestionsPanel: React.FC = () => {
  const [questions, setQuestions] = useState<FollowUpQuestion[]>([]);
  const [copied, setCopied]       = useState<string | null>(null);

  useEffect(() => {
    const handler = (message: any) => {
      // ── Listening directly on chrome.runtime.onMessage ──────────────────
      // This fires in ANY extension context — popup, sidepanel, content script.
      // The old window 'AI_RESULT' custom event only worked in the same JS
      // context where App/App.tsx dispatched it, i.e. never in the sidepanel.
      if (message.type !== 'AI_RESULT' || !message.questions) return;

      const incoming: FollowUpQuestion[] = message.questions.map(
        (q: any, i: number) => {
          // Safely handle both string and object shapes from the backend
          const questionText =
            typeof q === 'string' ? q : q?.question ?? q?.text ?? '';
          const intent =
            typeof q === 'string' ? 'default' : q?.intent ?? 'default';
          const triggeredBy =
            typeof q === 'string' ? '' : q?.triggered_by ?? '';

          return {
            id:          `q-${Date.now()}-${i}`,
            question:    questionText,
            intent,
            triggeredBy,
          };
        }
      );

      // Replace the list — each AI cycle gives a fresh set of questions
      setQuestions(incoming);
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => chrome.runtime.onMessage.removeListener(handler);
    }
  }, []);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="panel-card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-2 h-2 rounded-full ${
            questions.length > 0 ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'
          }`}
        />
        <span className="panel-label">AI FOLLOW-UP QUESTIONS</span>
        {questions.length > 0 && (
          <span className="ml-auto text-[10px] text-purple-400 font-mono">
            {questions.length} suggestion{questions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Empty state */}
      {questions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-600">
          <div className="text-2xl mb-2 opacity-40">💡</div>
          <p className="text-[11px] text-center leading-relaxed">
            Questions will appear here as the
            <br />
            candidate speaks.
          </p>
        </div>
      )}

      {/* Question cards */}
      {questions.length > 0 && (
        <div className="space-y-2">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              onCopy={handleCopy}
              copied={copied}
            />
          ))}
        </div>
      )}
    </div>
  );
};