"use client";

import { cn } from "@/lib/cn";
import {
  type QoEFlag,
  BANKER_BLUE,
  SEVERITY_STYLES,
} from "./deal-analysis-types";

// ---------------------------------------------------------------------------
// Shared sub-components used across analysis panels
// ---------------------------------------------------------------------------

export function AnalysisCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white border border-gray-200 rounded-xl p-5 mb-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,51,102,0.08)] transition-shadow", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="material-symbols-outlined text-[20px]" style={{ color: BANKER_BLUE }}>{icon}</span>
      <span className="text-[13px] font-bold text-gray-900 uppercase tracking-wider" style={{ letterSpacing: "0.06em" }}>{title}</span>
      {children}
    </div>
  );
}

export function EmptyTabState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="text-center py-10">
      <span className="material-symbols-outlined text-[40px] text-gray-300 block mb-2">{icon}</span>
      <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">{message}</p>
    </div>
  );
}

export function SeverityBadges({ flags }: { flags: QoEFlag[] }) {
  const counts: Record<string, number> = { critical: 0, warning: 0, positive: 0, info: 0 };
  flags.forEach((f) => { if (counts[f.severity] !== undefined) counts[f.severity]++; });
  const labels: Record<string, string> = { critical: "Critical", warning: "Warning", positive: "Positive", info: "Info" };
  const icons: Record<string, string> = { critical: "error", warning: "warning", positive: "check_circle", info: "info" };

  return (
    <div className="flex gap-2 flex-wrap">
      {Object.entries(counts).filter(([, c]) => c > 0).map(([sev, count]) => {
        const s = SEVERITY_STYLES[sev];
        return (
          <span key={sev} className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: s.badgeBg, color: s.badge }}>
            <span className="material-symbols-outlined text-[13px]">{icons[sev]}</span>
            {count} {labels[sev]}
          </span>
        );
      })}
    </div>
  );
}

export function FlagCard({ flag }: { flag: QoEFlag }) {
  const s = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.info;
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border hover:translate-x-0.5 transition-transform" style={{ background: s.bg, borderColor: s.border }}>
      <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5" style={{ color: s.icon }}>{flag.icon || "info"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-bold" style={{ color: s.text }}>{flag.title}</span>
          {flag.metric && (
            <span className="text-[10px] font-semibold px-2 py-px rounded-md bg-white/70" style={{ color: s.icon }}>{flag.metric}</span>
          )}
          {flag.category && <span className="text-[10px] ml-auto opacity-50" style={{ color: s.text }}>{flag.category}</span>}
        </div>
        <p className="text-[11px] leading-relaxed opacity-85 m-0" style={{ color: s.text }}>{flag.detail}</p>
        {flag.evidence && (
          <p className="text-[10px] opacity-50 italic mt-1 mb-0" style={{ color: s.text }}>Evidence: {flag.evidence}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score Ring SVG (used by Overview tab QoE hero)
// ---------------------------------------------------------------------------

export function ScoreRing({ score }: { score: number }) {
  let ringColor: string, ringBg: string, label: string;
  if (score >= 75) { ringColor = "#059669"; ringBg = "#ECFDF5"; label = "Strong"; }
  else if (score >= 50) { ringColor = "#d97706"; ringBg = "#FFFBEB"; label = "Moderate"; }
  else { ringColor = "#dc2626"; ringBg = "#FEF2F2"; label = "Weak"; }

  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - score / 100);

  return (
    <div className="relative shrink-0" style={{ width: 96, height: 96 }}>
      <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="48" cy="48" r="40" fill={ringBg} stroke="#E5E7EB" strokeWidth="5" />
        <circle
          cx="48" cy="48" r="40" fill="none" stroke={ringColor} strokeWidth="5"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-extrabold leading-none" style={{ color: ringColor }}>{score}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: ringColor }}>{label}</span>
      </div>
    </div>
  );
}
