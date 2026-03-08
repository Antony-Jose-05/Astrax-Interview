import React, { useState, useEffect, useRef } from 'react';

// ── CRITICAL FIX 1 ──────────────────────────────────────────────────────────
// Previously listened to window.addEventListener('AI_RESULT') — a custom DOM
// event only ever dispatched by components/App/App.tsx (the popup). In the
// side panel, that event never fired so alerts never appeared.
// Now listens directly on chrome.runtime.onMessage.
//
// ── CRITICAL FIX 2 ──────────────────────────────────────────────────────────
// Dismissed alert IDs were stored in useState([]) which resets every time the
// component unmounts (i.e. every time the user switches to another panel tab).
// Now uses chrome.storage.session to persist dismissals for the whole session.
// ────────────────────────────────────────────────────────────────────────────

interface MismatchAlert {
  id: string;
  field: string;
  resumeClaim: string;
  candidateClaim: string;
  quote: string;
  severity: 'high' | 'medium' | 'low';
  confidenceScore: number;
}

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const severityConfig = {
  high: {
    border: 'border-red-500/40',
    bg:     'bg-red-500/5',
    badge:  'bg-red-500/20 text-red-400 border-red-500/30',
    dot:    'bg-red-500',
    label:  'HIGH RISK',
  },
  medium: {
    border: 'border-amber-500/30',
    bg:     'bg-amber-500/5',
    badge:  'bg-amber-500/20 text-amber-400 border-amber-500/30',
    dot:    'bg-amber-500',
    label:  'MEDIUM',
  },
  low: {
    border: 'border-slate-600/30',
    bg:     'bg-slate-700/20',
    badge:  'bg-slate-600/30 text-slate-400 border-slate-500/20',
    dot:    'bg-slate-400',
    label:  'LOW',
  },
};

const STORAGE_KEY = 'alertPanel:dismissed';

// ─────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────

async function loadDismissed(): Promise<Set<string>> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      const result = await chrome.storage.session.get(STORAGE_KEY);
      return new Set<string>(result[STORAGE_KEY] ?? []);
    }
  } catch {
    // storage.session not available in dev outside extension context
  }
  return new Set<string>();
}

async function saveDismissed(ids: Set<string>): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      await chrome.storage.session.set({ [STORAGE_KEY]: Array.from(ids) });
    }
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────
// Alert Card
// ─────────────────────────────────────────────

function AlertCard({
  alert,
  onDismiss,
}: {
  alert: MismatchAlert;
  onDismiss: (id: string) => void;
}) {
  const cfg = severityConfig[alert.severity];

  return (
    <div
      className={`rounded-xl border p-3 ${cfg.border} ${cfg.bg} transition-all duration-300`}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot} animate-pulse`} />
          <span className="text-slate-300 text-xs font-semibold">{alert.field}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded border font-bold tracking-wider ${cfg.badge}`}
          >
            {cfg.label}
          </span>
          <button
            onClick={() => onDismiss(alert.id)}
            className="text-slate-600 hover:text-slate-400 text-xs ml-1 transition-colors"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Claims comparison */}
      <div className="space-y-2 mb-3">
        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
          <div className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider mb-1">
            📄 Resume Claims
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            "{alert.resumeClaim}"
          </p>
        </div>

        <div className="flex items-center justify-center">
          <div className="flex items-center gap-1 text-red-400/70">
            <div className="w-8 h-px bg-red-500/30" />
            <span className="text-[9px] font-bold">VS</span>
            <div className="w-8 h-px bg-red-500/30" />
          </div>
        </div>

        <div className="p-2 rounded-lg bg-slate-700/40 border border-slate-600/30">
          <div className="text-[9px] text-slate-500 font-bold uppercase tracking-wider mb-1">
            🎙 Candidate Said
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            "{alert.candidateClaim}"
          </p>
        </div>
      </div>

      {/* Quote */}
      {alert.quote && (
        <div className="px-2 py-1.5 rounded bg-slate-900/50 border-l-2 border-red-500/40 mb-3">
          <p className="text-[10px] text-slate-400 italic leading-snug">
            "{alert.quote}"
          </p>
        </div>
      )}

      {/* Confidence bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-slate-500 uppercase tracking-wider">
            Mismatch Confidence
          </span>
          <span
            className={`text-[10px] font-mono font-bold ${
              alert.confidenceScore >= 80 ? 'text-red-400' : 'text-amber-400'
            }`}
          >
            {alert.confidenceScore}%
          </span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              alert.confidenceScore >= 80
                ? 'bg-gradient-to-r from-red-600 to-red-400'
                : 'bg-gradient-to-r from-amber-600 to-amber-400'
            }`}
            style={{ width: `${alert.confidenceScore}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────

export const AlertPanel: React.FC = () => {
  const [alerts,    setAlerts]    = useState<MismatchAlert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Load persisted dismissed IDs from storage.session on mount
  useEffect(() => {
    loadDismissed().then(setDismissed);
  }, []);

  // Listen for AI_RESULT directly on chrome.runtime.onMessage
  useEffect(() => {
    const handler = (message: any) => {
      if (message.type !== 'AI_RESULT' || !message.alerts?.length) return;

      const incoming: MismatchAlert[] = message.alerts.map(
        (a: any, i: number) => ({
          id:             `alert-${Date.now()}-${i}`,
          // Backend sends 'explanation' as the human-readable field label
          field:          a.explanation ? 'AI Detection' : 'Mismatch Detected',
          resumeClaim:    a.resume_claim    ?? 'No resume claim found.',
          candidateClaim: a.interview_claim ?? a.quote ?? 'N/A',
          quote:          a.quote           ?? '',
          severity:       (['high', 'medium', 'low'].includes(a.severity)
                            ? a.severity
                            : 'medium') as MismatchAlert['severity'],
          // Backend doesn't return a confidence %; derive from severity
          confidenceScore:
            a.severity === 'high'   ? 90 :
            a.severity === 'medium' ? 65 : 40,
        })
      );

      // Merge with existing — don't wipe alerts from previous AI cycles
      setAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newOnes = incoming.filter((a) => !existingIds.has(a.id));
        return [...prev, ...newOnes];
      });
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => chrome.runtime.onMessage.removeListener(handler);
    }
  }, []);

  const handleDismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      // Persist immediately — survives panel tab switches and component unmounts
      saveDismissed(next);
      return next;
    });
  };

  const handleRestoreAll = () => {
    const empty = new Set<string>();
    setDismissed(empty);
    saveDismissed(empty);
  };

  const visible    = alerts.filter((a) => !dismissed.has(a.id));
  const highCount  = visible.filter((a) => a.severity === 'high').length;
  const hiddenCount = alerts.length - visible.length;

  return (
    <div className="panel-card">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className={`w-2 h-2 rounded-full ${
            highCount > 0
              ? 'bg-red-500 animate-pulse'
              : visible.length > 0
              ? 'bg-amber-400'
              : 'bg-slate-600'
          }`}
        />
        <span className="panel-label">RESUME MISMATCH ALERTS</span>
        <div className="ml-auto flex items-center gap-2">
          {visible.length > 0 && (
            <span className="text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">
              {visible.length} ACTIVE
            </span>
          )}
          {/* Restore dismissed button — only shown when some are hidden */}
          {hiddenCount > 0 && (
            <button
              onClick={handleRestoreAll}
              className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              Show {hiddenCount} dismissed
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {visible.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-slate-600">
          <div className="text-2xl mb-2 opacity-40">
            {alerts.length > 0 ? '✓' : '🛡'}
          </div>
          <p className="text-[11px] text-center leading-relaxed">
            {alerts.length > 0
              ? 'All alerts dismissed.'
              : 'No contradictions detected yet.'}
          </p>
        </div>
      )}

      {/* Alert cards */}
      {visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
};