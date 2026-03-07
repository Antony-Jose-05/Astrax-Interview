import React, { useEffect, useRef, useState } from "react";

interface TranscriptMessage {
  id: string;
  text: string;
  speaker: "INTERVIEWER" | "CANDIDATE";
  timestamp: Date;
}

const mockMessages: TranscriptMessage[] = [
  { id: "1", text: "Tell me about your experience with distributed systems.", speaker: "INTERVIEWER", timestamp: new Date(Date.now() - 240000) },
  { id: "2", text: "Sure! I've spent the last 3 years building microservices at scale. My main project was an orchestration platform handling over 10 million requests per day using Go and Kubernetes.", speaker: "CANDIDATE", timestamp: new Date(Date.now() - 210000) },
  { id: "3", text: "How did you handle failures and ensure fault tolerance?", speaker: "INTERVIEWER", timestamp: new Date(Date.now() - 180000) },
  { id: "4", text: "We implemented circuit breakers using a custom Go library, combined with exponential backoff retry strategies. We also had chaos engineering sessions every sprint to proactively test failure scenarios.", speaker: "CANDIDATE", timestamp: new Date(Date.now() - 150000) },
  { id: "5", text: "Interesting. What metrics were you tracking to ensure SLA compliance?", speaker: "INTERVIEWER", timestamp: new Date(Date.now() - 90000) },
  { id: "6", text: "Primarily P99 latency, error rates, and throughput. We used Prometheus and Grafana dashboards with PagerDuty alerts when thresholds were breached.", speaker: "CANDIDATE", timestamp: new Date(Date.now() - 60000) },
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const TranscriptPanel: React.FC = () => {
  const [messages, setMessages] = useState<TranscriptMessage[]>(mockMessages);
  const [isLive, setIsLive] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === "TRANSCRIPT_LINE") {
        const newMsg: TranscriptMessage = {
          id: Date.now().toString(),
          text: message.text,
          speaker: message.speaker,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, newMsg]);
      }
    };

    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener(handler);
      return () => chrome.runtime.onMessage.removeListener(handler);
    }
  }, []);

  useEffect(() => {
    if (isLive) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLive]);

  return (
    <div className="panel-card flex flex-col" style={{ maxHeight: "280px" }}>
      
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="panel-label">LIVE TRANSCRIPT</span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500">
            {messages.length} lines
          </span>

          <button
            onClick={() => setIsLive(!isLive)}
            className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${
              isLive
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "bg-slate-700 text-slate-400 border border-slate-600"
            }`}
          >
            {isLive ? "● AUTO-SCROLL" : "PAUSED"}
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

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar"
      >
        {messages.map((msg, i) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.speaker === "INTERVIEWER"
                ? "justify-end"
                : "justify-start"
            }`}
            style={{ animationDelay: `${i * 20}ms` }}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed relative group ${
                msg.speaker === "INTERVIEWER"
                  ? "bg-indigo-600/25 border border-indigo-500/30 text-indigo-100 rounded-br-sm"
                  : "bg-slate-700/60 border border-slate-600/40 text-slate-200 rounded-bl-sm"
              }`}
            >
              <div
                className={`text-[9px] font-bold mb-1 uppercase tracking-wider ${
                  msg.speaker === "INTERVIEWER"
                    ? "text-indigo-400"
                    : "text-slate-500"
                }`}
              >
                {msg.speaker === "INTERVIEWER"
                  ? "YOU"
                  : "CANDIDATE"}
              </div>

              <p>{msg.text}</p>

              <div
                className={`text-[9px] mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                  msg.speaker === "INTERVIEWER"
                    ? "text-indigo-400/60 text-right"
                    : "text-slate-500"
                }`}
              >
                {formatTime(msg.timestamp)}
              </div>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default TranscriptPanel;