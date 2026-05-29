export type ChartType = "bar" | "line" | "area" | "combo";

export type SeriesType = "bar" | "line" | "area";

export type MetricKind = "absolute" | "percent";

export type MetricSource = "P&L" | "Analysis";

export interface MetricDef {
  key: string;
  label: string;
  kind: MetricKind;
  source: MetricSource;
}

export interface GraphSeries {
  metricKey: string;
  seriesType: SeriesType;
  color: string;
}

export interface Graph {
  id: string;
  title: string;
  chartType: ChartType;
  series: GraphSeries[];
}

export interface GraphDraft {
  title: string;
  chartType: ChartType;
  series: GraphSeries[];
}

export interface FinancialRow {
  period: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  netIncome: number;
  grossMargin: number;
  ebitdaMargin: number;
  netMargin: number;
  [key: string]: string | number;
}
