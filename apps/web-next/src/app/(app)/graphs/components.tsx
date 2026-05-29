"use client";

import type { ReactNode } from "react";
import { CURRENCY_LABEL, METRIC_CATALOG } from "./constants";
import type { GraphSeries } from "./types";

interface PanelProps {
  title: string;
  children: ReactNode;
}

export function Panel({ title, children }: PanelProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-4 py-2.5 border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500 font-medium">
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

interface AxisHintProps {
  series: GraphSeries[];
}

export function AxisHint({ series }: AxisHintProps) {
  const hasAbs = series.some(
    (s) => METRIC_CATALOG.find((m) => m.key === s.metricKey)?.kind === "absolute",
  );
  const hasPct = series.some(
    (s) => METRIC_CATALOG.find((m) => m.key === s.metricKey)?.kind === "percent",
  );
  if (!hasAbs && !hasPct) return null;
  return (
    <div className="flex gap-1.5">
      {hasAbs && (
        <span className="px-2 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-600 border border-slate-200">
          L · {CURRENCY_LABEL}
        </span>
      )}
      {hasPct && (
        <span
          className="px-2 py-0.5 text-[10px] rounded-full border"
          style={{
            backgroundColor: "#E6EEF5",
            color: "#003366",
            borderColor: "#B8CCDD",
          }}
        >
          R · %
        </span>
      )}
    </div>
  );
}

export function EmptyPreview() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
        <span className="material-symbols-outlined text-[24px]">add</span>
      </div>
      <div className="text-sm text-slate-600 font-medium">Pick metrics to start</div>
      <div className="text-[11px] text-slate-400 max-w-xs mt-1">
        Absolute values render on the left axis; percentage metrics get their own
        right-hand axis automatically.
      </div>
    </div>
  );
}
