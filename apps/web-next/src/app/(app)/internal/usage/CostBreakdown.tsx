"use client";

import { useEffect, useState } from "react";
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

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Enough colors for typical operation counts; cycles if needed.
const PALETTE = [
  "#003366",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
  "#f97316",
  "#14b8a6",
];

const DAY_OPTIONS = [7, 14, 30, 60] as const;
type DayRange = (typeof DAY_OPTIONS)[number];

export function CostBreakdown() {
  const { showToast } = useToast();
  const [series, setSeries] = useState<CostBreakdownSeriesPoint[]>([]);
  const [reconciliation, setReconciliation] = useState<
    CostBreakdownReconciliationRow[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DayRange>(30);

  useEffect(() => {
    let cancelled = false;

    // Don't synchronously flip loading=true on day-range change — that
    // triggers a cascading render and the lint rule blocks it. The new
    // data updates in place when it arrives; previous chart stays
    // visible until then. Initial mount already starts loading=true.
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
        showToast("Failed to load cost breakdown data.", "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [days, showToast]);

  // Collect all unique operation names across every day in the series.
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
      legend: { position: "bottom" as const },
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
  };

  const totalCost = reconciliation.reduce((sum, r) => sum + r.costUsd, 0);
  const totalCredits = reconciliation.reduce((sum, r) => sum + r.credits, 0);

  return (
    <div>
      {/* Day range selector */}
      <div className="flex gap-2 mb-4 items-center flex-wrap">
        <span className="text-sm text-text-secondary">Range:</span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={
              days === d
                ? "px-3 py-1 text-sm rounded border text-white border-transparent"
                : "px-3 py-1 text-sm rounded border bg-white border-border-subtle text-text-secondary hover:bg-gray-50"
            }
            style={
              days === d
                ? { backgroundColor: "#003366", borderColor: "#003366" }
                : undefined
            }
          >
            {d}d
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="text-text-secondary py-6">Loading cost breakdown…</div>
      ) : series.length === 0 ? (
        <div className="text-text-secondary py-6 italic">
          No cost data for this period.
        </div>
      ) : (
        <div className="bg-white border border-border-subtle rounded p-4 mb-6">
          <h2 className="text-sm font-semibold mb-3" style={{ color: "#003366" }}>
            Daily $ Cost by Operation
          </h2>
          <Bar data={chartData} options={chartOptions} />
        </div>
      )}

      {/* Reconciliation table */}
      {!loading && reconciliation.length > 0 && (
        <div className="bg-white border border-border-subtle rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-border-subtle bg-gray-50">
            <h2 className="text-sm font-semibold" style={{ color: "#003366" }}>
              Reconciliation — last {days} days
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-text-secondary bg-gray-50">
              <tr>
                <th className="text-left p-2 pl-4">Operation</th>
                <th className="text-right p-2">$ Cost</th>
                <th className="text-right p-2 pr-4">Credits</th>
              </tr>
            </thead>
            <tbody>
              {reconciliation.map((r) => (
                <tr
                  key={r.operation}
                  className="border-t border-border-subtle hover:bg-gray-50"
                >
                  <td className="p-2 pl-4 font-mono text-xs">{r.operation}</td>
                  <td className="p-2 text-right text-xs">
                    ${Number(r.costUsd).toFixed(4)}
                  </td>
                  <td className="p-2 pr-4 text-right text-xs">{r.credits}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border-subtle bg-gray-50">
              <tr>
                <td className="p-2 pl-4 text-sm font-semibold">Total</td>
                <td className="p-2 text-right text-sm font-semibold">
                  ${totalCost.toFixed(4)}
                </td>
                <td className="p-2 pr-4 text-right text-sm font-semibold">
                  {totalCredits}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
