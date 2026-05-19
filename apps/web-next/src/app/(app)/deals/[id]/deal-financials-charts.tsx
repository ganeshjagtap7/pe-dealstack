"use client";

import { useRef, useState } from "react";
import type { Chart as ChartJS, ChartOptions, ChartData } from "chart.js";
import { Chart } from "react-chartjs-2";

import { comparePeriodChronologically } from "./deal-financials-period-scope";
import {
  type ChartScopeFilter,
  ChartToolbar,
  ScopeEmptyState,
  ScopeFilterPills,
  filterRowsByScope,
} from "./deal-financials-chart-controls";
import {
  type FinancialStatement,
  CHART_TOOLTIP,
  CHART_LEGEND,
} from "./deal-financials-charts-shared";
import { formatFinancialValue, toActualDollars } from "@/lib/formatters";

// Re-export so existing consumers (deal-financials.tsx) don't have to change
// their import paths after the file split.
export type { FinancialStatement } from "./deal-financials-charts-shared";
export { GrowthChart } from "./deal-financials-chart-growth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Avoid mixing annual totals with quarterly data on the same chart. */
function filterConsistentPeriods(rows: FinancialStatement[]): FinancialStatement[] {
  const isFY = (p: string) => /^FY\b/i.test(p) || /^\d{4}$/i.test(p);
  const fyRows = rows.filter((r) => isFY(r.period));
  const nonFyRows = rows.filter((r) => !isFY(r.period));
  if (fyRows.length > 0 && nonFyRows.length >= 2) return nonFyRows;
  return rows;
}

// ---------------------------------------------------------------------------
// Revenue + EBITDA + Margin chart
// ---------------------------------------------------------------------------

export function RevenueChart({ statements }: { statements: FinancialStatement[] }) {
  const canvasRef = useRef<ChartJS | null>(null);
  const [scopeFilter, setScopeFilter] = useState<ChartScopeFilter>("all");

  // Filter by scope BEFORE sort + chart construction so the empty-state check
  // sees the post-filter row count.
  let rows = statements.filter((s) => s.statementType === "INCOME_STATEMENT");
  rows = filterRowsByScope(rows, scopeFilter);
  rows = rows.sort((a, b) => comparePeriodChronologically(a.period, b.period));

  // Only fall back to FY-vs-non-FY consistency filtering when the user hasn't
  // already locked the scope down. With an explicit scope filter, all rows
  // share a scope by definition.
  if (scopeFilter === "all") {
    rows = filterConsistentPeriods(rows);
  }

  const toolbar = (
    <ChartToolbar>
      <ScopeFilterPills value={scopeFilter} onChange={setScopeFilter} />
    </ChartToolbar>
  );

  if (rows.length === 0) {
    return (
      <div className="w-full">
        {toolbar}
        {scopeFilter === "all" ? (
          <p className="text-xs text-gray-400 text-center py-8">No income statement data available.</p>
        ) : (
          <ScopeEmptyState filter={scopeFilter} />
        )}
      </div>
    );
  }

  const labels = rows.map((r) => r.period);
  // Convert each row's stored value into actual dollars using its own
  // `unitScale` so the y-axis auto-scales correctly even when periods mix scales.
  const revenues = rows.map((r) => toActualDollars(r.lineItems?.revenue ?? null, r.unitScale));
  const ebitdas = rows.map((r) => toActualDollars(r.lineItems?.ebitda ?? null, r.unitScale));
  const margins = rows.map((r) => r.lineItems?.ebitda_margin_pct ?? null);
  const currency = rows[0]?.currency ?? "USD";

  const data: ChartData<"bar" | "line", (number | null)[], string> = {
    labels,
    datasets: [
      {
        type: "bar" as const,
        label: "Revenue",
        data: revenues,
        backgroundColor: "rgba(0,51,102,0.7)",
        borderColor: "transparent",
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: "y",
        order: 2,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
      },
      {
        type: "bar" as const,
        label: "EBITDA",
        data: ebitdas,
        backgroundColor: "rgba(5,150,105,0.7)",
        borderColor: "transparent",
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        yAxisID: "y",
        order: 2,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
      },
      {
        type: "line" as const,
        label: "EBITDA Margin %",
        data: margins,
        borderColor: "#f59e0b",
        backgroundColor: "rgba(245,158,11,0.08)",
        fill: true,
        pointBackgroundColor: "#fff",
        pointBorderColor: "#f59e0b",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        tension: 0.4,
        yAxisID: "y1",
        order: 1,
        spanGaps: true,
      },
    ],
  };

  const options: ChartOptions<"bar" | "line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: CHART_LEGEND,
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: {
          title: (items) => {
            const r = rows[items[0]?.dataIndex ?? 0];
            return r ? `${r.period}${r.periodType === "PROJECTED" ? " (Projected)" : ""}` : "";
          },
          label(ctx) {
            const v = ctx.raw as number | null;
            if (v === null || v === undefined) return "";
            if (ctx.dataset.yAxisID === "y1") return ` EBITDA Margin: ${Number(v).toFixed(1)}%`;
            return ` ${ctx.dataset.label}: ${formatFinancialValue(v, "ACTUALS", { currency })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 11, family: "Inter" }, color: "#9ca3af", maxRotation: 45 },
        border: { display: false },
      },
      y: {
        type: "linear",
        position: "left",
        ticks: {
          font: { size: 10, family: "Inter" },
          color: "#9ca3af",
          callback: (v) => formatFinancialValue(Number(v), "ACTUALS", { currency }),
          padding: 8,
        },
        grid: { color: "rgba(0,0,0,0.04)" },
        border: { display: false },
        beginAtZero: true,
      },
      y1: {
        type: "linear",
        position: "right",
        title: { display: true, text: "Margin %", font: { size: 11, family: "Inter", weight: "normal" }, color: "#d97706" },
        ticks: {
          font: { size: 10, family: "Inter" },
          color: "#d97706",
          callback: (v) => v + "%",
          padding: 8,
        },
        grid: { drawOnChartArea: false },
        border: { display: false },
      },
    },
  };

  return (
    <div className="w-full">
      {toolbar}
      <div className="relative w-full bg-white rounded-lg border border-gray-200 p-4" style={{ height: 320 }}>
        {/* @ts-expect-error -- react-chartjs-2 mixed type chart has loose generics */}
        <Chart ref={canvasRef} type="bar" data={data} options={options} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Balance Sheet Composition chart
// ---------------------------------------------------------------------------

export function BalanceSheetChart({ statements }: { statements: FinancialStatement[] }) {
  const [scopeFilter, setScopeFilter] = useState<ChartScopeFilter>("all");

  // Filter by scope BEFORE sort so empty-state checks see the right count.
  const filteredBaseRows = filterRowsByScope(
    statements.filter((s) => s.statementType === "BALANCE_SHEET"),
    scopeFilter,
  );
  const rows = filteredBaseRows.sort((a, b) => comparePeriodChronologically(a.period, b.period));

  const toolbar = (
    <ChartToolbar>
      <ScopeFilterPills value={scopeFilter} onChange={setScopeFilter} />
    </ChartToolbar>
  );

  if (rows.length === 0) {
    return (
      <div className="w-full">
        {toolbar}
        {scopeFilter !== "all" ? (
          <ScopeEmptyState filter={scopeFilter} />
        ) : (
          <p className="text-xs text-gray-400 text-center py-8">No balance sheet data available.</p>
        )}
      </div>
    );
  }

  const chartKeys = [
    "cash", "accounts_receivable", "inventory", "ppe_net", "goodwill", "intangibles",
    "total_current_liabilities", "long_term_debt", "total_equity", "total_assets", "total_liabilities",
  ];
  const hasChartData = rows.some((r) => chartKeys.some((k) => r.lineItems?.[k] != null && r.lineItems[k] !== 0));
  if (!hasChartData) {
    return (
      <div className="w-full">
        {toolbar}
        <p className="text-xs text-gray-400 text-center py-8">Balance sheet data exists but key values are not yet extracted.</p>
      </div>
    );
  }

  const labels = rows.map((r) => r.period);
  // Convert per-row to actual dollars so the y-axis auto-scales uniformly.
  const li = (row: FinancialStatement, key: string) => toActualDollars(row.lineItems?.[key] ?? 0, row.unitScale) ?? 0;
  const currency = rows[0]?.currency ?? "USD";

  const data: ChartData<"bar", number[], string> = {
    labels,
    datasets: [
      { label: "Cash", data: rows.map((r) => li(r, "cash")), backgroundColor: "#003366", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "Receivables", data: rows.map((r) => li(r, "accounts_receivable")), backgroundColor: "#2563eb", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "Inventory", data: rows.map((r) => li(r, "inventory")), backgroundColor: "#60a5fa", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "PP&E", data: rows.map((r) => li(r, "ppe_net")), backgroundColor: "#93c5fd", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "Goodwill + Intangibles", data: rows.map((r) => li(r, "goodwill") + li(r, "intangibles")), backgroundColor: "#bfdbfe", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "Current Liab.", data: rows.map((r) => li(r, "total_current_liabilities")), backgroundColor: "#dc2626", stack: "liabilities", borderWidth: 0, borderRadius: 3 },
      { label: "LT Debt", data: rows.map((r) => li(r, "long_term_debt")), backgroundColor: "#f87171", stack: "liabilities", borderWidth: 0, borderRadius: 3 },
      { label: "Equity", data: rows.map((r) => li(r, "total_equity")), backgroundColor: "#059669", stack: "liabilities", borderWidth: 0, borderRadius: 3 },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        ...CHART_LEGEND,
        labels: { ...CHART_LEGEND.labels, font: { size: 10, family: "Inter", weight: "normal" }, boxWidth: 10, padding: 12 },
      },
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: {
          label: (ctx) => {
            const v = ctx.raw as number;
            if (!v) return "";
            return ` ${ctx.dataset.label}: ${formatFinancialValue(v, "ACTUALS", { currency })}`;
          },
        },
      },
      title: {
        display: true,
        text: "Assets  vs  Liabilities + Equity",
        font: { size: 11, family: "Inter", weight: "normal" },
        color: "#9ca3af",
        padding: { bottom: 8 },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 11, family: "Inter" }, color: "#9ca3af" },
        border: { display: false },
      },
      y: {
        stacked: true,
        ticks: {
          font: { size: 10, family: "Inter" },
          color: "#9ca3af",
          callback: (v) => formatFinancialValue(Number(v), "ACTUALS", { currency }),
          padding: 8,
        },
        grid: { color: "rgba(0,0,0,0.04)" },
        border: { display: false },
      },
    },
  };

  return (
    <div className="w-full">
      {toolbar}
      <div className="relative w-full bg-white rounded-lg border border-gray-200 p-4" style={{ height: 320 }}>
        <Chart type="bar" data={data} options={options} />
      </div>
    </div>
  );
}
