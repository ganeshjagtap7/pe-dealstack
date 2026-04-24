// ---------------------------------------------------------------------------
// Types for the AI Financial Analysis section
// ---------------------------------------------------------------------------

export interface QoEFlag {
  severity: "critical" | "warning" | "positive" | "info";
  title: string;
  detail: string;
  metric?: string;
  category?: string;
  icon?: string;
}

export interface QoEScore {
  score: number;
  summary: string;
  flags: QoEFlag[];
}

export interface KeyMetric {
  label: string;
  value: string;
  color: string;
}

export interface InsightsData {
  qoe?: QoEScore;
  revenueQuality?: {
    revenueCAGR?: number;
    consistencyScore?: number;
    organicGrowthRates?: { period: string; rate: number | null }[];
  };
  cashFlowAnalysis?: { avgConversion?: number };
  debtCapacity?: { currentLeverage?: number };
  lboScreen?: { passesScreen?: boolean };
  redFlags?: QoEFlag[];
  analyzedAt?: string;
  hasData?: boolean;
}

export interface ValuationScenario {
  entryMultiple: number;
  exitMultiple: number;
  growthRate?: number;
  moic?: number;
  irr?: number;
}

export interface CrossDocConflict {
  period: string;
  field: string;
  discrepancyPct: number;
  values: { documentName: string; value: number; isActive?: boolean }[];
}

export interface CrossDocData {
  hasData: boolean;
  documents?: { name: string }[];
  conflicts?: CrossDocConflict[];
}

export interface BenchmarkItem {
  metric: string;
  dealValue: number;
  percentile: number;
  peerMin: number;
  peerMax: number;
  unit?: string;
}

export interface BenchmarkData {
  hasData: boolean;
  peerCount: number;
  benchmarks: BenchmarkItem[];
}

export interface RiskFactor {
  category: string;
  score: number;
  label: string;
  detail: string;
  severity: "critical" | "warning" | "positive" | "info";
}

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
