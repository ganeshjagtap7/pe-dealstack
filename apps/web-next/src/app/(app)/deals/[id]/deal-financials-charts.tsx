"use client";

import { useRef, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
  Title,
  type ChartOptions,
  type ChartData,
} from "chart.js";
import { Chart } from "react-chartjs-2";

// Register Chart.js components once
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
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
  unitScale?: "ACTUALS" | "THOUSANDS" | "MILLIONS";
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

function createGradient(
  ctx: CanvasRenderingContext2D,
  colorTop: string,
  colorBottom: string,
  height = 300,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, colorTop);
  gradient.addColorStop(1, colorBottom);
  return gradient;
}

// ---------------------------------------------------------------------------
// Revenue + EBITDA + Margin chart
// ---------------------------------------------------------------------------

export function RevenueChart({ statements }: { statements: FinancialStatement[] }) {
  const canvasRef = useRef<ChartJS | null>(null);
  const containerRef = useRef<HTMLCanvasElement | null>(null);

  let rows = statements
    .filter((s) => s.statementType === "INCOME_STATEMENT")
    .sort((a, b) => a.period.localeCompare(b.period));

  rows = filterConsistentPeriods(rows);

  if (rows.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-8">No income statement data available.</p>;
  }

  const labels = rows.map((r) => r.period);
  const revenues = rows.map((r) => r.lineItems?.revenue ?? null);
  const ebitdas = rows.map((r) => r.lineItems?.ebitda ?? null);
  const margins = rows.map((r) => r.lineItems?.ebitda_margin_pct ?? null);
  const unitLabel = rows[0]?.unitScale === "THOUSANDS" ? "$K" : "$M";

  const data: ChartData<"bar" | "line", (number | null)[], string> = {
    labels,
    datasets: [
      {
        type: "bar" as const,
        label: `Revenue (${unitLabel})`,
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
        label: `EBITDA (${unitLabel})`,
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
            return ` ${ctx.dataset.label}: $${Number(v).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
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
        title: { display: true, text: unitLabel, font: { size: 11, family: "Inter", weight: "normal" }, color: "#9ca3af" },
        ticks: {
          font: { size: 10, family: "Inter" },
          color: "#9ca3af",
          callback: (v) => "$" + Number(v).toLocaleString(),
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
  let rows = statements
    .filter((s) => s.statementType === "INCOME_STATEMENT")
    .sort((a, b) => a.period.localeCompare(b.period));

  rows = filterConsistentPeriods(rows);

  if (rows.length < 2) {
    return <p className="text-xs text-gray-400 text-center py-8">Need at least 2 periods to show growth.</p>;
  }

  const labels: string[] = [];
  const growthData: number[] = [];

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].lineItems?.revenue;
    const curr = rows[i].lineItems?.revenue;
    if (prev != null && curr != null && prev !== 0) {
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      labels.push(rows[i].period);
      growthData.push(parseFloat(pct.toFixed(1)));
    }
  }

  if (labels.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-8">No revenue data available for growth calculation.</p>;
  }

  const bgColors = growthData.map((v) => (v >= 0 ? "rgba(5,150,105,0.7)" : "rgba(220,38,38,0.7)"));
  const borderColors = growthData.map((v) => (v >= 0 ? "rgba(5,150,105,0.6)" : "rgba(220,38,38,0.6)"));

  const data: ChartData<"bar", number[], string> = {
    labels,
    datasets: [
      {
        label: "Revenue Growth %",
        data: growthData,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.65,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (ctx) => {
            const v = Number(ctx.raw);
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
  const li = (row: FinancialStatement, key: string) => row.lineItems?.[key] ?? 0;
  const unitLabel = rows[0]?.unitScale === "THOUSANDS" ? "$K" : "$M";

  const data: ChartData<"bar", number[], string> = {
    labels,
    datasets: [
      { label: "Cash", data: rows.map((r) => li(r, "cash")), backgroundColor: "#003366", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "Receivables", data: rows.map((r) => li(r, "accounts_receivable")), backgroundColor: "#2563eb", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "Inventory", data: rows.map((r) => li(r, "inventory")), backgroundColor: "#60a5fa", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "PP&E", data: rows.map((r) => li(r, "ppe_net")), backgroundColor: "#93c5fd", stack: "assets", borderWidth: 0, borderRadius: 3 },
      { label: "Goodwill + Intangibles", data: rows.map((r) => (li(r, "goodwill") || 0) + (li(r, "intangibles") || 0)), backgroundColor: "#bfdbfe", stack: "assets", borderWidth: 0, borderRadius: 3 },
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
            return ` ${ctx.dataset.label}: $${Number(v).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unitLabel.replace("$", "")}`;
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
        title: { display: true, text: unitLabel, font: { size: 11, family: "Inter", weight: "normal" }, color: "#9ca3af" },
        ticks: {
          font: { size: 10, family: "Inter" },
          color: "#9ca3af",
          callback: (v) => "$" + Number(v).toLocaleString(),
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
