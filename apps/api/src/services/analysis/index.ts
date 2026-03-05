/**
 * Financial Analysis Service — Entry Point
 * Re-exports all types and provides the main analyzeFinancials function.
 */

import { log } from '../../utils/logger.js';
import { AnalysisResult } from './types.js';
import { prepareData } from './helpers.js';
import { computeQoEFlags, computeQoEScore, generateQoESummary } from './qoeAnalysis.js';
import { computeRatios, computeDuPont } from './ratioAnalysis.js';
import {
  computeEBITDABridge, computeRevenueQuality, computeCashFlowAnalysis,
  computeWorkingCapital, computeCostStructure, computeWorkforceMetrics,
} from './operationalAnalysis.js';
import { computeDebtCapacity, computeLBOScreen } from './debtAndLBO.js';
import { computeRedFlags } from './redFlags.js';

// Re-export all types
export type {
  QoEFlag, RatioGroup, Ratio, EBITDABridge, RevenueQuality,
  CashFlowAnalysis, WorkingCapital, CostStructure, DebtCapacity,
  LBOScreen, RedFlag, WorkforceMetrics, AnalysisResult, DuPontDecomposition,
} from './types.js';

export async function analyzeFinancials(dealId: string, rows: any[]): Promise<AnalysisResult> {
  if (!rows || rows.length === 0) {
    return { hasData: false, dealId, periods: [], qoe: { score: 0, flags: [], summary: 'No financial data available.' }, ratios: [], analyzedAt: new Date().toISOString() } as any;
  }
  log.info('Starting financial analysis', { dealId, rowCount: rows.length });

  const data = prepareData(rows);

  // Phase 2: QoE
  const flags = computeQoEFlags(data);
  const score = computeQoEScore(flags);
  const summary = generateQoESummary(score, flags);

  // Phase 2.5A: Ratios + DuPont
  const ratios = computeRatios(data);
  const duPont = computeDuPont(data);

  // Phase 2.5B-F: Operational analysis
  const ebitdaBridge = computeEBITDABridge(data);
  const revenueQuality = computeRevenueQuality(data);
  const cashFlowAnalysis = computeCashFlowAnalysis(data);
  const workingCapital = computeWorkingCapital(data);
  const costStructure = computeCostStructure(data);

  // Phase 2.5G-H: Debt & LBO
  const debtCapacity = computeDebtCapacity(data);
  const lboScreen = computeLBOScreen(data);

  // Phase 2.5L: Workforce
  const workforceMetrics = computeWorkforceMetrics(data);

  // Phase 3: Red Flags
  const redFlags = computeRedFlags(data);

  log.info('Financial analysis complete', {
    dealId,
    periodsAnalyzed: data.periods.length,
    qoeFlagCount: flags.length,
    redFlagCount: redFlags.length,
    qoeScore: score,
    lboPasses: lboScreen?.passesScreen,
  });

  return {
    qoe: { score, flags, summary },
    ratios,
    duPont,
    ebitdaBridge,
    revenueQuality,
    cashFlowAnalysis,
    workingCapital,
    costStructure,
    debtCapacity,
    lboScreen,
    redFlags,
    workforceMetrics,
    periods: data.periods,
    analyzedAt: new Date().toISOString(),
  };
}
