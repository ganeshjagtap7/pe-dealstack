"use client";

// ---------------------------------------------------------------------------
// Deal chat chart artifact (Phase 3)
//
// Renders a Chart.js chart inline inside a chat message bubble from a
// `ChartSpec` (the wire format both the backend `generate_chart` tool and
// the frontend chat renderer agree on). Reuses CHART_TOOLTIP / CHART_LEGEND
// from the financials chart pack so visual treatment matches the rest of
// the app.
//
// Layout: small bold caption (title) → 240px chart canvas → optional
// xLabel/yLabel under the canvas. Banker Blue (#003366) for the primary
// series. Waterfall renders as a bar chart with per-bar colors: positive
// bars in Banker Blue, negative bars in amber.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  ArcElement,
  PieController,
  DoughnutController,
  Filler,
  Tooltip,
  Legend,
  Title,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { Chart } from "react-chartjs-2";

import {
  CHART_TOOLTIP,
  CHART_LEGEND,
} from "./deal-financials-charts-shared";
import type { ChartSpec, ChartSeries, ChartUnit } from "@/lib/dealchat-skills/chart-spec";
import { formatChartAxisValue } from "@/lib/formatters";

// Register the primitives we need for chat-embedded charts. Chart.js
// dedupes registration, so calling this here is safe even though the
// financials pack also registers Category/Linear/Bar/Line elements.
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  ArcElement,
  PieController,
  DoughnutController,
  Filler,
  Tooltip,
  Legend,
  Title,
);

// ---------------------------------------------------------------------------
// Palette — Banker Blue primary, accent rotation for multi-series charts.
// Waterfall uses BANKER_BLUE for positive bars, AMBER for negatives.
// ---------------------------------------------------------------------------

const BANKER_BLUE = "#003366";
const BANKER_BLUE_SOFT = "rgba(0,51,102,0.72)";
const AMBER = "rgba(217,119,6,0.85)";
const AMBER_BORDER = "rgba(217,119,6,1)";

const SERIES_PALETTE: ReadonlyArray<{ fill: string; border: string }> = [
  { fill: "rgba(0,51,102,0.72)", border: BANKER_BLUE },
  { fill: "rgba(13,148,136,0.65)", border: "rgba(13,148,136,1)" },
  { fill: "rgba(124,58,237,0.60)", border: "rgba(124,58,237,1)" },
  { fill: "rgba(217,119,6,0.65)", border: "rgba(217,119,6,1)" },
  { fill: "rgba(220,38,38,0.55)", border: "rgba(220,38,38,1)" },
];

const PIE_PALETTE: ReadonlyArray<string> = [
  BANKER_BLUE,
  "rgba(13,148,136,0.85)",
  "rgba(124,58,237,0.80)",
  "rgba(217,119,6,0.85)",
  "rgba(220,38,38,0.75)",
  "rgba(5,150,105,0.80)",
  "rgba(37,99,235,0.80)",
  "rgba(107,114,128,0.80)",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unified label list across all series, preserving first-seen order. */
function unionLabels(series: ChartSeries[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const s of series) {
    for (const p of s.data) {
      const key = String(p.x);
      if (!seen.has(key)) {
        seen.add(key);
        labels.push(key);
      }
    }
  }
  return labels;
}

/** Look up the y-value for a given label, or `null` if the series skips it. */
function valueAt(series: ChartSeries, label: string): number | null {
  for (const p of series.data) {
    if (String(p.x) === label) return p.y;
  }
  return null;
}

/**
 * Resolve the display unit for a chart's y-axis ticks.
 *
 * Precedence:
 *   1. Explicit `spec.unit` from the producer — always wins. This is the
 *      path the backend `generate_chart` tool uses now that financial
 *      values can land in K / M / B.
 *   2. Default to "M" — matches the legacy display assumption that every
 *      pre-unit spec was implicitly millions of the currency unit. We do
 *      NOT guess from magnitude here because a y-value of `6.9` could
 *      legitimately mean $6.9M (legacy producers) or $6.9 (raw counts),
 *      and the wrong guess silently mislabels the axis. Explicit unit is
 *      the only safe path.
 *
 * NOTE: this is for AXIS / TICK formatting only. The raw y-values in the
 * spec stay untouched — Chart.js still plots them at face value.
 */
function resolveChartUnit(spec: ChartSpec): ChartUnit {
  return spec.unit ?? "M";
}

// ---------------------------------------------------------------------------
// Variant builders — each returns { data, options } for `<Chart type=... />`.
// ---------------------------------------------------------------------------

function buildLine(
  spec: ChartSpec,
): { data: ChartData<"line", (number | null)[], string>; options: ChartOptions<"line"> } {
  const labels = unionLabels(spec.series);
  const unit = resolveChartUnit(spec);
  const datasets = spec.series.map((s, idx) => {
    const c = SERIES_PALETTE[idx % SERIES_PALETTE.length];
    return {
      label: s.name,
      data: labels.map((l) => valueAt(s, l)),
      borderColor: c.border,
      backgroundColor: c.fill,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.25,
      fill: false,
    };
  });
  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: spec.series.length > 1 ? CHART_LEGEND : { display: false },
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: {
          label: (ctx) => {
            const v = ctx.raw as number | null;
            if (v === null || v === undefined) return "";
            return ` ${ctx.dataset.label}: ${formatChartAxisValue(Number(v), unit)}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: spec.xLabel ? { display: true, text: spec.xLabel, color: "#6b7280" } : { display: false },
        grid: { display: false },
        ticks: { color: "#6b7280", font: { size: 10 } },
      },
      y: {
        title: spec.yLabel ? { display: true, text: spec.yLabel, color: "#6b7280" } : { display: false },
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          callback: (v) => formatChartAxisValue(Number(v), unit),
        },
      },
    },
  };
  return { data: { labels, datasets }, options };
}

function buildBar(
  spec: ChartSpec,
): { data: ChartData<"bar", (number | null)[], string>; options: ChartOptions<"bar"> } {
  const labels = unionLabels(spec.series);
  const unit = resolveChartUnit(spec);
  const datasets = spec.series.map((s, idx) => {
    const c = SERIES_PALETTE[idx % SERIES_PALETTE.length];
    return {
      label: s.name,
      data: labels.map((l) => valueAt(s, l)),
      backgroundColor: c.fill,
      borderColor: c.border,
      borderWidth: 1,
      borderRadius: 4,
      borderSkipped: false as const,
    };
  });
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: spec.series.length > 1 ? CHART_LEGEND : { display: false },
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: {
          label: (ctx) => {
            const v = ctx.raw as number | null;
            if (v === null || v === undefined) return "";
            return ` ${ctx.dataset.label}: ${formatChartAxisValue(Number(v), unit)}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: spec.xLabel ? { display: true, text: spec.xLabel, color: "#6b7280" } : { display: false },
        grid: { display: false },
        ticks: { color: "#6b7280", font: { size: 10 } },
      },
      y: {
        title: spec.yLabel ? { display: true, text: spec.yLabel, color: "#6b7280" } : { display: false },
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          callback: (v) => formatChartAxisValue(Number(v), unit),
        },
      },
    },
  };
  return { data: { labels, datasets }, options };
}

/**
 * Waterfall: bar chart variant where positive values are Banker Blue and
 * negatives are amber. We keep the y-values as the raw point data (no
 * running total) — the LLM is responsible for shaping a meaningful spec.
 */
function buildWaterfall(
  spec: ChartSpec,
): { data: ChartData<"bar", (number | null)[], string>; options: ChartOptions<"bar"> } {
  const series = spec.series[0];
  const labels = series.data.map((p) => String(p.x));
  const values = series.data.map((p) => p.y);
  const bg = values.map((v) => (v < 0 ? AMBER : BANKER_BLUE_SOFT));
  const border = values.map((v) => (v < 0 ? AMBER_BORDER : BANKER_BLUE));
  const unit = resolveChartUnit(spec);
  const options: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...CHART_TOOLTIP,
        callbacks: {
          label: (ctx) => {
            const v = ctx.raw as number | null;
            if (v === null || v === undefined) return "";
            return ` ${ctx.dataset.label}: ${formatChartAxisValue(Number(v), unit)}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: spec.xLabel ? { display: true, text: spec.xLabel, color: "#6b7280" } : { display: false },
        grid: { display: false },
        ticks: { color: "#6b7280", font: { size: 10 } },
      },
      y: {
        title: spec.yLabel ? { display: true, text: spec.yLabel, color: "#6b7280" } : { display: false },
        grid: { color: "rgba(0,0,0,0.05)" },
        ticks: {
          color: "#6b7280",
          font: { size: 10 },
          callback: (v) => formatChartAxisValue(Number(v), unit),
        },
      },
    },
  };
  return {
    data: {
      labels,
      datasets: [
        {
          label: series.name,
          data: values,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: false as const,
        },
      ],
    },
    options,
  };
}

function buildPie(
  spec: ChartSpec,
): { data: ChartData<"pie", number[], string>; options: ChartOptions<"pie"> } {
  const series = spec.series[0];
  const labels = series.data.map((p) => String(p.x));
  const values = series.data.map((p) => p.y);
  const bg = values.map((_, idx) => PIE_PALETTE[idx % PIE_PALETTE.length]);
  const options: ChartOptions<"pie"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: CHART_LEGEND,
      tooltip: CHART_TOOLTIP,
    },
  };
  return {
    data: {
      labels,
      datasets: [
        {
          label: series.name,
          data: values,
          backgroundColor: bg,
          borderColor: "#ffffff",
          borderWidth: 1,
        },
      ],
    },
    options,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DealChatChartArtifact({ spec }: { spec: ChartSpec }) {
  // useMemo so we don't rebuild datasets on every re-render of the surrounding
  // chat bubble (e.g. when typing into the textarea).
  const built = useMemo(() => {
    try {
      switch (spec.type) {
        case "line":
          return { kind: "line" as const, ...buildLine(spec) };
        case "bar":
          return { kind: "bar" as const, ...buildBar(spec) };
        case "waterfall":
          return { kind: "bar" as const, ...buildWaterfall(spec) };
        case "pie":
          return { kind: "pie" as const, ...buildPie(spec) };
        default:
          return null;
      }
    } catch (err) {
      // Defensive — buildX should never throw given a parseChartSpec'd spec.
      // If chart.js itself rejects the config, log and fall back to the
      // error state below.
      console.warn("[deal-chat-chart-artifact] build failed:", err);
      return null;
    }
  }, [spec]);

  if (!built) {
    return (
      <div className="rounded-lg border border-border-subtle bg-white p-3 my-2">
        <p className="text-xs text-text-muted">Couldn&apos;t render chart.</p>
        <details className="mt-1">
          <summary className="text-[10px] text-text-muted cursor-pointer">Raw spec</summary>
          <pre className="text-[10px] text-text-secondary mt-1 overflow-x-auto">
            {JSON.stringify(spec, null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-white p-3 my-2">
      <div className="text-xs font-bold text-text-main mb-1.5">{spec.title}</div>
      <div style={{ height: 240 }}>
        {/* Casting through unknown because react-chartjs-2's Chart accepts a
            discriminated union we can't express across the four variants with
            a single generic call. The buildX helpers already type-check the
            data + options pair together, so the cast is safe at runtime. */}
        <Chart
          type={built.kind}
          data={built.data as unknown as ChartData}
          options={built.options as unknown as ChartOptions}
        />
      </div>
    </div>
  );
}
