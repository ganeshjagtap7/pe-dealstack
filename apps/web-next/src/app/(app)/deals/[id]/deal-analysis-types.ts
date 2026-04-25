// ---------------------------------------------------------------------------
// Types for the AI Financial Analysis section
// ---------------------------------------------------------------------------

// ── QoE (Quality of Earnings) ──────────────────────────────────────────────

export interface QoEFlag {
  id?: string;
  severity: "critical" | "warning" | "positive" | "info";
  title: string;
  detail: string;
  metric?: string;
  category?: string;
  icon?: string;
  evidence?: string;
}

export interface QoEScore {
  score: number;
  summary: string;
  flags: QoEFlag[];
}

// ── Key Metric (UI helper) ─────────────────────────────────────────────────

export interface KeyMetric {
  label: string;
  value: string;
  color: string;
}

// ── Analysis Data — response from GET /deals/:id/financials/analysis ──────
// This is the PRIMARY data source (all quantitative analysis). The legacy
// code calls this first, then enriches with supplementary endpoints.

export interface EBITDABridgePeriod {
  period: string;
  reportedEbitda: number | null;
  addbacks: { label: string; amount: number | null }[];
  adjustedEbitda: number | null;
  adjustmentPct: number | null;
}

export interface EBITDABridge {
  periods: EBITDABridgePeriod[];
}

export interface RevenueQuality {
  revenueCAGR: number | null;
  organicGrowthRates: { period: string; rate: number | null }[];
  revenuePerEmployee?: number | null;
  consistencyScore: number;
}

export interface CashFlowPeriod {
  period: string;
  ebitda: number | null;
  capex: number | null;
  wcChange: number | null;
  fcf: number | null;
  ebitdaToFcfConversion: number | null;
}

export interface CashFlowAnalysis {
  periods: CashFlowPeriod[];
  avgConversion: number | null;
  fcfTrend: "improving" | "declining" | "stable" | "insufficient";
}

export interface WorkingCapitalPeriod {
  period: string;
  ar: number | null;
  inventory: number | null;
  ap: number | null;
  nwc: number | null;
  nwcPctRevenue: number | null;
}

export interface WorkingCapital {
  periods: WorkingCapitalPeriod[];
  normalizedNwc: number | null;
  nwcTrend: "improving" | "declining" | "stable" | "insufficient";
}

export interface CostStructurePeriod {
  period: string;
  cogsPct: number | null;
  sgaPct: number | null;
  rdPct: number | null;
  opexPct: number | null;
}

export interface CostStructure {
  periods: CostStructurePeriod[];
  breakEvenRevenue: number | null;
  operatingLeverage: "high" | "moderate" | "low" | "unknown";
}

export interface DebtCapacity {
  currentLeverage: number | null;
  maxDebt3x: number | null;
  maxDebt4x: number | null;
  maxDebt5x?: number | null;
  dscr: number | null;
  interestCoverage: number | null;
  debtHeadroom: number | null;
}

export interface LBOScenario {
  entryMultiple: number;
  exitMultiple: number;
  growthRate: number;
  equityRequired?: number | null;
  exitEbitda?: number | null;
  exitTEV?: number | null;
  moic: number | null;
  irr: number | null;
}

export interface LBOScreen {
  entryEbitda: number | null;
  scenarios: LBOScenario[];
  passesScreen: boolean;
}

export interface RatioValue {
  period: string;
  value: number | null;
}

export interface Ratio {
  name: string;
  key: string;
  periods: RatioValue[];
  benchmark?: { low: number; mid: number; high: number };
  unit: "%" | "x" | "$M" | "days" | "number";
  trend: "improving" | "declining" | "stable" | "insufficient";
  description: string;
}

export interface RatioGroup {
  category: string;
  icon: string;
  ratios: Ratio[];
}

export interface DuPontPeriod {
  period: string;
  netProfitMargin: number | null;
  assetTurnover: number | null;
  equityMultiplier: number | null;
  roe: number | null;
}

export interface DuPontDecomposition {
  periods: DuPontPeriod[];
}

/** Full response from GET /deals/:id/financials/analysis */
export interface AnalysisData {
  hasData: boolean;
  qoe: QoEScore;
  ratios: RatioGroup[];
  duPont?: DuPontDecomposition;
  ebitdaBridge?: EBITDABridge;
  revenueQuality?: RevenueQuality;
  cashFlowAnalysis?: CashFlowAnalysis;
  workingCapital?: WorkingCapital;
  costStructure?: CostStructure;
  debtCapacity?: DebtCapacity;
  lboScreen?: LBOScreen;
  redFlags?: QoEFlag[];
  periods: string[];
  analyzedAt: string;
}

// ── Insights Data — response from GET /deals/:id/financials/insights ──────
// This is the AI-generated narrative. Separate from the quantitative analysis.

export interface NarrativeInsights {
  executiveSummary?: string;
  topThreeRisks?: string[];
  topThreeStrengths?: string[];
  diligencePriorities?: string[];
  modules?: Record<string, { title?: string; narrative?: string }>;
  // Legacy keys (used by older legacy code)
  keyStrengths?: string[];
  keyRisks?: string[];
  investmentThesis?: string;
  dueDiligencePriorities?: string[];
  generatedAt?: string;
}

export interface InsightsResponse {
  hasData: boolean;
  insights: NarrativeInsights | null;
  fromCache?: boolean;
}

// ── Cross-Doc — response from GET /deals/:id/financials/cross-doc ─────────

export interface CrossDocConflict {
  period: string;
  field: string;
  discrepancyPct: number;
  values: { documentName: string; value: number; isActive?: boolean }[];
}

export interface CrossDocData {
  hasData: boolean;
  documents?: string[];
  conflicts?: CrossDocConflict[];
  totalComparisons?: number;
}

// ── Benchmark — response from GET /deals/:id/financials/benchmark ─────────

export interface BenchmarkItem {
  metric: string;
  dealValue: number;
  percentile: number;
  peerMedian?: number | null;
  peerMin: number;
  peerMax: number;
  unit?: string;
}

export interface BenchmarkData {
  hasData: boolean;
  peerCount: number;
  benchmarks: BenchmarkItem[];
}

// ── Risk Factor (UI-derived) ──────────────────────────────────────────────

export interface RiskFactor {
  category: string;
  score: number;
  label: string;
  detail: string;
  severity: "critical" | "warning" | "positive" | "info";
}

// ── Tabs ──────────────────────────────────────────────────────────────────

export type AnalysisTab = "overview" | "valuation" | "risk" | "benchmarks";

// ---------------------------------------------------------------------------
// Shared style constants (matching legacy analysis-styles.js)
// ---------------------------------------------------------------------------

export const BANKER_BLUE = "#003366";
export const BANKER_BLUE_LIGHT = "#004488";
export const BANKER_BLUE_MUTED = "#E8EEF4";

export const SEVERITY_STYLES: Record<
  string,
  { bg: string; border: string; text: string; icon: string; badge: string; badgeBg: string }
> = {
  critical: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B", icon: "#dc2626", badge: "#dc2626", badgeBg: "#FEE2E2" },
  warning: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E", icon: "#d97706", badge: "#d97706", badgeBg: "#FEF3C7" },
  positive: { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46", icon: "#059669", badge: "#059669", badgeBg: "#D1FAE5" },
  info: { bg: "#F3F4F6", border: "#D1D5DB", text: "#374151", icon: "#6B7280", badge: "#6B7280", badgeBg: "#E5E7EB" },
};

export const ANALYSIS_TABS: { id: AnalysisTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "valuation", label: "Valuation", icon: "rocket_launch" },
  { id: "risk", label: "Risk Profile", icon: "shield" },
  { id: "benchmarks", label: "Benchmarks", icon: "leaderboard" },
];
