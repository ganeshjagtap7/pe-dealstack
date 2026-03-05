/**
 * Financial Analysis Types
 * All interfaces and type aliases for the PE analysis suite.
 */

// ─── Internal Types ─────────────────────────────────────────

export interface LineItems {
  [key: string]: number | null;
}

export interface PeriodData {
  period: string;
  periodType: string;
  lineItems: LineItems;
  statementType: string;
}

export interface PreparedData {
  income: Map<string, LineItems>;   // period → lineItems
  balance: Map<string, LineItems>;
  cashflow: Map<string, LineItems>;
  periods: string[];                // sorted historical periods
}

// ─── QoE Types ──────────────────────────────────────────────

export type Severity = 'critical' | 'warning' | 'positive' | 'info';

export interface QoEFlag {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  metric?: string;
  icon: string;
}

// ─── Ratio Types ────────────────────────────────────────────

export interface RatioGroup {
  category: string;
  icon: string;
  ratios: Ratio[];
}

export interface Ratio {
  name: string;
  key: string;
  periods: { period: string; value: number | null }[];
  benchmark?: { low: number; mid: number; high: number };
  unit: '%' | 'x' | '$M' | 'days' | 'number';
  trend: 'improving' | 'declining' | 'stable' | 'insufficient';
  description: string;
}

// ─── Module Types (B-L + Phase 3) ───────────────────────────

export interface EBITDABridge {
  periods: {
    period: string;
    reportedEbitda: number | null;
    addbacks: { label: string; amount: number | null }[];
    adjustedEbitda: number | null;
    adjustmentPct: number | null;
  }[];
}

export interface RevenueQuality {
  revenueCAGR: number | null;
  organicGrowthRates: { period: string; rate: number | null }[];
  revenuePerEmployee?: number | null;
  consistencyScore: number;
}

export interface CashFlowAnalysis {
  periods: {
    period: string;
    ebitda: number | null;
    capex: number | null;
    wcChange: number | null;
    fcf: number | null;
    ebitdaToFcfConversion: number | null;
  }[];
  avgConversion: number | null;
  fcfTrend: 'improving' | 'declining' | 'stable' | 'insufficient';
}

export interface WorkingCapital {
  periods: {
    period: string;
    ar: number | null;
    inventory: number | null;
    ap: number | null;
    nwc: number | null;
    nwcPctRevenue: number | null;
  }[];
  normalizedNwc: number | null;
  nwcTrend: 'improving' | 'declining' | 'stable' | 'insufficient';
}

export interface CostStructure {
  periods: {
    period: string;
    cogsPct: number | null;
    sgaPct: number | null;
    rdPct: number | null;
    opexPct: number | null;
  }[];
  breakEvenRevenue: number | null;
  operatingLeverage: 'high' | 'moderate' | 'low' | 'unknown';
}

export interface DebtCapacity {
  currentLeverage: number | null;
  maxDebt3x: number | null;
  maxDebt4x: number | null;
  maxDebt5x: number | null;
  dscr: number | null;
  interestCoverage: number | null;
  debtHeadroom: number | null;
}

export interface LBOScreen {
  entryEbitda: number | null;
  scenarios: {
    entryMultiple: number;
    exitMultiple: number;
    growthRate: number;
    equityRequired: number | null;
    exitEbitda: number | null;
    exitTEV: number | null;
    moic: number | null;
    irr: number | null;
  }[];
  passesScreen: boolean;
}

export interface RedFlag {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  detail: string;
  evidence: string;
  icon: string;
}

export interface WorkforceMetrics {
  revenuePerEmployee: { period: string; value: number | null }[];
  trend: 'improving' | 'declining' | 'stable' | 'insufficient';
}

export interface DuPontDecomposition {
  periods: {
    period: string;
    netProfitMargin: number | null;
    assetTurnover: number | null;
    equityMultiplier: number | null;
    roe: number | null;
  }[];
}

export interface AnalysisResult {
  qoe: {
    score: number;
    flags: QoEFlag[];
    summary: string;
  };
  ratios: RatioGroup[];
  duPont?: DuPontDecomposition;
  ebitdaBridge?: EBITDABridge;
  revenueQuality?: RevenueQuality;
  cashFlowAnalysis?: CashFlowAnalysis;
  workingCapital?: WorkingCapital;
  costStructure?: CostStructure;
  debtCapacity?: DebtCapacity;
  lboScreen?: LBOScreen;
  redFlags?: RedFlag[];
  workforceMetrics?: WorkforceMetrics;
  periods: string[];
  analyzedAt: string;
}
