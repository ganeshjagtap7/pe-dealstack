"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { WidgetShell, WidgetEmpty, WidgetError, WidgetLoading } from "./shell";

// Ported from deal-funnel.js.
const STAGES: Array<{ key: string; label: string; color: string; also?: string[] }> = [
  { key: "INITIAL_REVIEW", label: "Sourcing", color: "#60A5FA" },
  { key: "DUE_DILIGENCE", label: "Due Diligence", color: "#003366" },
  { key: "IOI_SUBMITTED", label: "IOI / LOI", color: "#F59E0B", also: ["LOI_SUBMITTED"] },
  { key: "NEGOTIATION", label: "Negotiation", color: "#8B5CF6", also: ["CLOSING"] },
  { key: "CLOSED_WON", label: "Closed", color: "#10B981" },
];

type DealRow = { stage: string; status?: string };

export function DealFunnelWidget() {
  const [rows, setRows] = useState<Array<{ label: string; color: string; count: number; pct: number }> | null>(null);
  const [error, setError] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<DealRow[] | { deals: DealRow[] }>("/deals?limit=500");
        if (cancelled) return;
        const deals = Array.isArray(data) ? data : data.deals || [];
        const active = deals.filter((d) => d.status !== "ARCHIVED");
        if (active.length === 0) {
          setEmpty(true);
          return;
        }
        const total = active.length;
        const computed = STAGES.map((stage) => {
          const keys = [stage.key, ...(stage.also || [])];
          const count = active.filter((d) => keys.includes(d.stage)).length;
          const pct = Math.round((count / total) * 100);
          return { label: stage.label, color: stage.color, count, pct };
        });
        setRows(computed);
      } catch (err) {
        console.warn("[dashboard/deal-funnel] failed to load deals:", err);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetShell title="Deal Funnel" icon="filter_alt">
      {error ? (
        <WidgetError message="Could not load deal funnel" />
      ) : empty ? (
        <WidgetEmpty message="No deals yet" icon="filter_alt" />
      ) : !rows ? (
        <WidgetLoading />
      ) : (
        <div className="p-4 space-y-3">
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-text-secondary">{r.label}</span>
                <span className="text-xs text-text-muted">
                  <strong className="text-text-main">{r.count}</strong> · {r.pct}%
                </span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(r.pct, 2)}%`, backgroundColor: r.color }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  );
}
