"use client";

import { useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Filler,
  Tooltip,
  Legend,
  Title,
  type ChartOptions,
  type ChartData,
} from "chart.js";
import { Chart } from "react-chartjs-2";

import {
  type PeriodScope,
  PERIOD_SCOPE_LABEL,
  groupRowsByScope,
} from "./deal-financials-period-scope";
import { formatFinancialValue, toActualDollars } from "@/lib/formatters";

// Register Chart.js components once
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  Filler,
  Tooltip,
  Legend,
  Title,
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FinancialStatement {
  id: string;
  statementType: "INCOME_STATEMENT" | "BALANCE_SHEET" | "CASH_FLOW";
  period: string;
  periodType?: "ACTUAL" | "PROJECTED";
  currency?: string;
  unitScale?: "ACTUALS" | "THOUSANDS" | "MILLIONS" | "BILLIONS";
  extractionConfidence?: number | null;
  extractionSource?: string | null;
  lineItems?: Record<string, number | null>;
  Document?: { id: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Shared chart config (ported from legacy CHART_TOOLTIP / CHART_LEGEND)
// ---------------------------------------------------------------------------

const CHART_TOOLTIP = {
  backgroundColor: "rgba(255,255,255,0.98)",
  titleColor: "#111827",
  titleFont: { size: 12 as const, family: "Inter", weight: "bold" as const },
  bodyColor: "#4b5563",
  bodyFont: { size: 11 as const, family: "Inter" },
  borderColor: "#e5e7eb",
  borderWidth: 1,
  padding: { top: 10, bottom: 10, left: 14, right: 14 },
  cornerRadius: 10,
  boxPadding: 4,
  usePointStyle: true as const,
  caretSize: 6,
};

const CHART_LEGEND = {
  position: "bottom" as const,
  labels: {
    font: { size: 11 as const, family: "Inter", weight: "normal" as const },
    boxWidth: 14,
    boxHeight: 8,
    padding: 18,
    color: "#6b7280",
    usePointStyle: true as const,
    pointStyleWidth: 14,
  },
};

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

// Period-scope inference helpers live in `./deal-financials-period-scope`.

// ---------------------------------------------------------------------------
// Revenue + EBITDA + Margin chart
// ---------------------------------------------------------------------------

export function RevenueChart({ statements }: { statements: FinancialStatement[] }) {
  const canvasRef = useRef<ChartJS | null>(null);

  let rows = statements
    .filter((s) => s.statementType === "INCOME_STATEMENT")
    .sort((a, b) => a.period.localeCompare(b.period));

  rows = filterConsistentPeriods(rows);

  if (rows.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-8">No income statement data available.</p>;
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
    <div className="relative w-full bg-white rounded-lg border border-gray-200 p-4" style={{ height: 320 }}>
      {/* @ts-expect-error -- react-chartjs-2 mixed type chart has loose generics */}
      <Chart ref={canvasRef} type="bar" data={data} options={options} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue Growth chart
// ---------------------------------------------------------------------------

export function GrowthChart({ statements }: { statements: FinancialStatement[] }) {
  const incomeRows = statements
    .filter((s) => s.statementType === "INCOME_STATEMENT")
    .sort((a, b) => a.period.localeCompare(b.period));

  if (incomeRows.length < 2) {
    return <p className="text-xs text-gray-400 text-center py-8">Need at least 2 periods to show growth.</p>;
  }

  // Group by inferred period scope so growth deltas are only computed between
  // periods of the same kind (e.g. Monthly→Monthly, never Monthly→YTD).
  const groups = groupRowsByScope(incomeRows);

  // Per-group palette (distinct colors so the legend communicates scope).
  // Negative values get the corresponding red shade for that group's hue.
  const GROUP_PALETTE: Record<PeriodScope, { pos: string; neg: string; border: string }> = {
    annual:    { pos: "rgba(0,51,102,0.75)",   neg: "rgba(220,38,38,0.75)", border: "rgba(0,51,102,0.65)" },
    estimate:  { pos: "rgba(124,58,237,0.7)",  neg: "rgba(220,38,38,0.7)",  border: "rgba(124,58,237,0.6)" },
    ltm:       { pos: "rgba(13,148,136,0.7)",  neg: "rgba(220,38,38,0.7)",  border: "rgba(13,148,136,0.6)" },
    ytd:       { pos: "rgba(217,119,6,0.7)",   neg: "rgba(220,38,38,0.7)",  border: "rgba(217,119,6,0.6)" },
    quarterly: { pos: "rgba(37,99,235,0.7)",   neg: "rgba(220,38,38,0.7)",  border: "rgba(37,99,235,0.6)" },
    monthly:   { pos: "rgba(5,150,105,0.7)",   neg: "rgba(220,38,38,0.7)",  border: "rgba(5,150,105,0.6)" },
    mtd:       { pos: "rgba(2,132,199,0.7)",   neg: "rgba(220,38,38,0.7)",  border: "rgba(2,132,199,0.6)" },
    other:     { pos: "rgba(107,114,128,0.7)", neg: "rgba(220,38,38,0.7)",  border: "rgba(107,114,128,0.6)" },
  };

  // Build a contiguous X-axis: each group's labels appear together, in order.
  // Each group becomes its own dataset, with `null` at positions outside the
  // group — this gives a natural visual gap between scope clusters.
  // The first row of each group has no prior period of the same scope, so it
  // is skipped (growth is undefined for the first point in any series).
  const allLabels: string[] = [];
  const groupSpans: { scope: PeriodScope; startIdx: number; labels: string[]; growth: (number | null)[] }[] = [];

  for (const g of groups) {
    const labels: string[] = [];
    const growth: (number | null)[] = [];
    for (let i = 1; i < g.rows.length; i++) {
      const prev = g.rows[i - 1].lineItems?.revenue;
      const curr = g.rows[i].lineItems?.revenue;
      if (prev != null && curr != null && prev !== 0) {
        const pct = ((curr - prev) / Math.abs(prev)) * 100;
        labels.push(g.rows[i].period);
        growth.push(parseFloat(pct.toFixed(1)));
      }
    }
    if (labels.length > 0) {
      groupSpans.push({ scope: g.scope, startIdx: allLabels.length, labels, growth });
      allLabels.push(...labels);
    }
  }

  if (allLabels.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-8">No revenue data available for growth calculation.</p>;
  }

  // One dataset per scope group. Each dataset has `null` outside its own span
  // so bars only render in their group's slot — this creates the visual divider.
  const datasets = groupSpans.map((span) => {
    const fullData: (number | null)[] = new Array(allLabels.length).fill(null);
    const bgColors: string[] = new Array(allLabels.length).fill("rgba(0,0,0,0)");
    const borderColors: string[] = new Array(allLabels.length).fill("rgba(0,0,0,0)");
    const palette = GROUP_PALETTE[span.scope];
    for (let i = 0; i < span.growth.length; i++) {
      const v = span.growth[i];
      const slot = span.startIdx + i;
      fullData[slot] = v;
      bgColors[slot] = (v ?? 0) >= 0 ? palette.pos : palette.neg;
      borderColors[slot] = (v ?? 0) >= 0 ? palette.border : "rgba(220,38,38,0.6)";
    }
    return {
      label: PERIOD_SCOPE_LABEL[span.scope],
      data: fullData,
      backgroundColor: bgColors,
      borderColor: borderColors,
      borderWidth: 1,
      borderRadius: 6,
      borderSkipped: false,
      barPercentage: 0.65,
      categoryPercentage: 0.9,
    };
  });

  const data: ChartData<"bar", (number | null)[], string> = {
    labels: allLabels,
    datasets,
  };

  // Tooltip needs to know which scope a given X position belongs to so the
  // header can label the comparison correctly.
  const scopeForLabelIdx = new Array(allLabels.length).fill("other") as PeriodScope[];
  for (const span of groupSpans) {
    for (let i = 0; i < span.labels.length; i++) {
      scopeForLabelIdx[span.startIdx + i] = span.scope;
    }
  }

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: groupSpans.length > 1
        ? { ...CHART_LEGEND, labels: { ...CHART_LEGEND.labels } }
        : { display: false },
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: {
          title: (items) => {
            const idx = items[0]?.dataIndex ?? 0;
            const label = items[0]?.label ?? "";
            const scope = scopeForLabelIdx[idx] ?? "other";
            return `${label} · ${PERIOD_SCOPE_LABEL[scope]}`;
          },
          label: (ctx) => {
            const v = ctx.raw as number | null;
            if (v === null || v === undefined) return "";
            const sign = v >= 0 ? "+" : "";
            return ` Revenue Growth: ${sign}${v.toFixed(1)}%`;
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
        ticks: {
          font: { size: 10, family: "Inter" },
          color: "#9ca3af",
          callback: (v) => (Number(v) >= 0 ? "+" : "") + v + "%",
          padding: 8,
        },
        grid: { color: "rgba(0,0,0,0.04)" },
        border: { display: false },
      },
    },
  };

  return (
    <div className="relative w-full bg-white rounded-lg border border-gray-200 p-4" style={{ height: 320 }}>
      <Chart type="bar" data={data} options={options} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Balance Sheet Composition chart
// ---------------------------------------------------------------------------

export function BalanceSheetChart({ statements }: { statements: FinancialStatement[] }) {
  const rows = statements
    .filter((s) => s.statementType === "BALANCE_SHEET")
    .sort((a, b) => a.period.localeCompare(b.period));

  if (rows.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-8">No balance sheet data available.</p>;
  }

  const chartKeys = [
    "cash", "accounts_receivable", "inventory", "ppe_net", "goodwill", "intangibles",
    "total_current_liabilities", "long_term_debt", "total_equity", "total_assets", "total_liabilities",
  ];
  const hasChartData = rows.some((r) => chartKeys.some((k) => r.lineItems?.[k] != null && r.lineItems[k] !== 0));
  if (!hasChartData) {
    return <p className="text-xs text-gray-400 text-center py-8">Balance sheet data exists but key values are not yet extracted.</p>;
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
    <div className="relative w-full bg-white rounded-lg border border-gray-200 p-4" style={{ height: 320 }}>
      <Chart type="bar" data={data} options={options} />
    </div>
  );
}
