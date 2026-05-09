"use client";

import { useEffect, useRef, useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type TooltipItem,
} from "chart.js";
import { api } from "@/lib/api";
import { useToast } from "@/providers/ToastProvider";
import type {
  CostBreakdownSeriesPoint,
  CostBreakdownReconciliationRow,
} from "./types";
import { PillGroup, EmptyState, ErrorPanel, KpiCard } from "./_ui";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const PALETTE = [
  "#003366", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#84cc16", "#ec4899", "#f97316", "#14b8a6",
];

type DayRange = 7 | 14 | 30 | 60;

const DAY_PILL_OPTIONS: { value: DayRange; label: string }[] = [
  { value: 7,  label: "7d"  },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 60, label: "60d" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function CostBreakdown() {
  const { showToast } = useToast();
  const [series, setSeries]                 = useState<CostBreakdownSeriesPoint[]>([]);
  const [reconciliation, setReconciliation] = useState<CostBreakdownReconciliationRow[]>([]);
  const [showLoading, setShowLoading]       = useState(true); // true on mount
  const [hasError, setHasError]             = useState(false);
  const [days, setDays]                     = useState<DayRange>(30);
  const loadingTimerRef                     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Delay indicator on subsequent changes (not on mount — already showing)
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => {
      if (!cancelled) setShowLoading(true);
    }, 300);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasError(false);

    api
      .get<{
        series: CostBreakdownSeriesPoint[];
        reconciliation: CostBreakdownReconciliationRow[];
      }>(`/internal/usage/cost-breakdown?days=${days}`)
      .then((res) => {
        if (cancelled) return;
        setSeries(res.series);
        setReconciliation(res.reconciliation);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[CostBreakdown] failed to load cost data", err);
        setHasError(true);
        showToast("Failed to load cost breakdown data.", "error");
      })
      .finally(() => {
        if (cancelled) return;
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
        setShowLoading(false);
      });

    return () => {
      cancelled = true;
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, [days, showToast]);

  // ── Derived values ──────────────────────────────────────────────────────────

  const allOperations = Array.from(
    new Set(series.flatMap((s) => Object.keys(s.byOperation))),
  ).sort();

  const chartData = {
    labels: series.map((s) => s.day),
    datasets: allOperations.map((op, i) => ({
      label: op,
      data: series.map((s) => s.byOperation[op] ?? 0),
      backgroundColor: PALETTE[i % PALETTE.length],
      stack: "cost",
    })),
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: "top" as const,
        align:    "start" as const,
        labels: {
          boxWidth:  8,
          boxHeight: 8,
          padding:   16,
          font: { size: 11 },
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<"bar">) =>
            `${ctx.dataset.label ?? ""}: $${(ctx.parsed.y ?? 0).toFixed(4)}`,
        },
      },
    },
    scales: {
      x: { stacked: true },
      y: {
        stacked: true,
        ticks: {
          callback: (val: string | number) => `$${Number(val).toFixed(3)}`,
        },
      },
    },
    maintainAspectRatio: false,
  };

  // KPI totals
  const totalCost    = reconciliation.reduce((s, r) => s + r.costUsd, 0);
  const totalCalls   = reconciliation.reduce((s, r) => s + r.credits, 0); // credits ≈ calls proxy
  const topOp        = reconciliation.reduce<CostBreakdownReconciliationRow | null>(
    (best, r) => (!best || r.costUsd > best.costUsd ? r : best),
    null,
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Day-range selector ── */}
      <div className="flex flex-wrap gap-2 items-center mb-6">
        <PillGroup
          options={DAY_PILL_OPTIONS}
          value={days}
          onChange={(v) => setDays(v)}
        />
      </div>

      {hasError ? (
        <ErrorPanel message="Couldn't load cost breakdown. Try refreshing." />
      ) : showLoading ? (
        <div className="text-xs text-gray-400 py-8 text-center">Loading cost breakdown…</div>
      ) : series.length === 0 ? (
        <EmptyState
          heading="No cost data yet"
          body="Cost data will appear here once users make AI calls within this period."
        />
      ) : (
        <>
          {/* ── KPI strip ── */}
          <div className="flex gap-10 mb-6 px-1">
            <KpiCard
              value={`$${totalCost.toFixed(2)}`}
              caption={`Total · last ${days}d`}
            />
            <KpiCard
              value={totalCalls.toLocaleString()}
              caption="Credits used"
            />
            <KpiCard
              value={topOp?.operation ?? "—"}
              caption="Top operation"
            />
          </div>

          {/* ── Chart card ── */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
              Daily $ Cost by Operation
            </p>
            <div style={{ height: 360 }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* ── Reconciliation table ── */}
          {reconciliation.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50/60">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Reconciliation — last {days} days
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-gray-400 uppercase tracking-wide border-b border-gray-200 bg-white">
                    <tr>
                      <th className="text-left px-5 py-2.5 font-medium">Operation</th>
                      <th
                        className="text-right px-4 py-2.5 font-medium whitespace-nowrap"
                        title="Cumulative AI provider cost for this operation"
                      >
                        $ Cost
                      </th>
                      <th
                        className="text-right px-5 py-2.5 font-medium whitespace-nowrap"
                        title="Internal credits charged; $/credit ratio flags mispriced operations"
                      >
                        Credits
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliation.map((r, idx) => (
                      <tr
                        key={r.operation}
                        className={
                          idx % 2 === 0
                            ? "bg-white border-t border-gray-100"
                            : "bg-gray-50/60 border-t border-gray-100"
                        }
                      >
                        <td className="px-5 py-2.5 font-mono text-gray-800">
                          {r.operation}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-800 font-medium">
                          ${Number(r.costUsd).toFixed(4)}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-gray-700">
                          {r.credits}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50/60">
                    <tr>
                      <td className="px-5 py-3 text-sm font-semibold text-gray-700">
                        Total
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-gray-800">
                        ${totalCost.toFixed(4)}
                      </td>
                      <td className="px-5 py-3 text-right text-sm font-semibold tabular-nums text-gray-800">
                        {totalCalls}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
