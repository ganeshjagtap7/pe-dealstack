import type { ChartType, Graph, MetricDef } from "./types";

export const CURRENCY_LABEL = "₹ Cr";

export const METRIC_CATALOG: MetricDef[] = [
  { key: "revenue",      label: "Revenue",            kind: "absolute", source: "P&L" },
  { key: "cogs",         label: "COGS",               kind: "absolute", source: "P&L" },
  { key: "grossProfit",  label: "Gross Profit",       kind: "absolute", source: "P&L" },
  { key: "opex",         label: "Operating Expenses", kind: "absolute", source: "P&L" },
  { key: "ebitda",       label: "EBITDA",             kind: "absolute", source: "P&L" },
  { key: "netIncome",    label: "Net Income",         kind: "absolute", source: "P&L" },
  { key: "grossMargin",  label: "Gross Margin %",     kind: "percent",  source: "Analysis" },
  { key: "ebitdaMargin", label: "EBITDA Margin %",    kind: "percent",  source: "Analysis" },
  { key: "netMargin",    label: "Net Margin %",       kind: "percent",  source: "Analysis" },
];

export const PALETTE = [
  "#1e3a8a", "#0d9488", "#ea580c", "#7c3aed",
  "#dc2626", "#0891b2", "#ca8a04", "#475569",
];

export const CHART_TYPES: { key: ChartType; label: string }[] = [
  { key: "bar",   label: "Bar" },
  { key: "line",  label: "Line" },
  { key: "area",  label: "Area" },
  { key: "combo", label: "Combo" },
];

export const SEED_GRAPHS: Graph[] = [
  {
    id: "g-001",
    title: "Revenue vs Bottom Line + EBITDA Margin",
    chartType: "combo",
    series: [
      { metricKey: "revenue",      seriesType: "bar",  color: "#1e3a8a" },
      { metricKey: "netIncome",    seriesType: "bar",  color: "#0d9488" },
      { metricKey: "ebitdaMargin", seriesType: "line", color: "#ea580c" },
    ],
  },
  {
    id: "g-002",
    title: "Quarterly Revenue Trend",
    chartType: "area",
    series: [
      { metricKey: "revenue", seriesType: "area", color: "#1e3a8a" },
    ],
  },
  {
    id: "g-003",
    title: "Margin Profile",
    chartType: "line",
    series: [
      { metricKey: "grossMargin",  seriesType: "line", color: "#1e3a8a" },
      { metricKey: "ebitdaMargin", seriesType: "line", color: "#0d9488" },
      { metricKey: "netMargin",    seriesType: "line", color: "#ea580c" },
    ],
  },
];
