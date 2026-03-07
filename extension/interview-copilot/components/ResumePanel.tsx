import React, { useState } from "react";

interface ResumeData {
  name: string;
  title: string;
  yearsOfExperience: number;
  skills: string[];
  projects: { name: string; description: string; tech: string[] }[];
}

const defaultResume: ResumeData = {
  name: "Alex Chen",
  title: "Senior Full-Stack Engineer",
  yearsOfExperience: 7,
  skills: [
    "TypeScript", "React", "Node.js", "GraphQL", "PostgreSQL",
    "AWS", "Docker", "Kubernetes", "Redis", "Python", "Go",
  ],
  projects: [
    {
      name: "DistributeIQ",
      description: "Microservices orchestration platform handling 10M+ req/day",
      tech: ["Go", "Kubernetes", "gRPC"],
    },
    {
      name: "StreamSync",
      description: "Real-time collaborative editor with CRDT conflict resolution",
      tech: ["React", "WebSockets", "Redis"],
    },
    {
      name: "NeuralDeploy",
      description: "ML model deployment pipeline with A/B testing support",
      tech: ["Python", "Docker", "AWS SageMaker"],
    },
  ],
};

const skillColorMap: Record<string, string> = {
  TypeScript: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  React: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Node.js": "bg-green-500/20 text-green-300 border-green-500/30",
  GraphQL: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  PostgreSQL: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  AWS: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  Docker: "bg-blue-400/20 text-blue-200 border-blue-400/30",
  Kubernetes: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  Redis: "bg-red-500/20 text-red-300 border-red-500/30",
  Python: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  Go: "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

const defaultSkillColor = "bg-slate-600/40 text-slate-300 border-slate-500/30";

export const ResumePanel: React.FC<{ data?: ResumeData }> = ({ data = defaultResume }) => {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="panel-card group">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
        <span className="panel-label">CANDIDATE PROFILE</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-emerald-400 font-mono">LOADED</span>
        </div>
      </div>

      {/* Identity */}
      <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-slate-700/40 border border-slate-600/30">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {data.name.split(" ").map(n => n[0]).join("")}
        </div>
        <div className="min-w-0">
          <div className="text-white font-semibold text-sm truncate">{data.name}</div>
          <div className="text-slate-400 text-xs truncate">{data.title}</div>
        </div>
        <div className="ml-auto flex-shrink-0 text-right">
          <div className="text-indigo-400 font-mono font-bold text-lg leading-none">{data.yearsOfExperience}</div>
          <div className="text-slate-500 text-[10px] uppercase tracking-wider">yrs exp</div>
        </div>
      </div>

      {/* Skills */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-semibold">Skills</div>
        <div className="flex flex-wrap gap-1.5">
          {data.skills.map((skill) => (
            <span
              key={skill}
              className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${skillColorMap[skill] || defaultSkillColor}`}
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* Projects */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-semibold">Projects</div>
        <div className="space-y-1.5">
          {data.projects.map((project, i) => (
            <button
              key={project.name}
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full text-left p-2.5 rounded-lg bg-slate-700/30 border border-slate-600/20 hover:border-indigo-500/40 hover:bg-slate-700/50 transition-all duration-200 group/proj"
            >
              <div className="flex items-center justify-between">
                <span className="text-slate-200 text-xs font-medium">{project.name}</span>
                <svg
                  className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${expanded === i ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {expanded === i && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-slate-400 text-[11px] leading-relaxed">{project.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {project.tech.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};