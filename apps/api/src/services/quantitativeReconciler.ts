// ─── Quantitative Reconciler — Phase 1 entry point ────────────────
//
// Composes the four deterministic Phase-1 modules into a single audit
// payload per deal. Designed to run cheaply (pure TS over already-stored
// FinancialStatement rows, no LLM) so the user can re-run it any time
// they want to gut-check what the AI extraction produced vs what the
// raw line-item data actually says.
//
// Phase 1 covers: aggregated ground truth (annual sums, TTM, MRR,
// margins, valuation context), channel concentration + HHI, asking-price
// vs micro-SaaS comp bands, and the OpEx step-up detector — the four
// findings the user verified manually against the Website Speedy file.
//
// Phase 2 will add the LLM-augmented blocks (CIM-claim variance,
// cross-doc material findings, extraction-quality feedback). Those
// layer on top and consume Phase 1 output as their ground truth — so
// any bug in Phase 1 propagates, which is why this module ships first
// with the deterministic pieces only.

import type { UnitScale } from './financialClassifier.js';
import {
  computeGroundTruth,
} from './reconciler/groundTruth.js';
import { computeChannelConcentration } from './reconciler/channels.js';
import { computeValuationFraming } from './reconciler/valuation.js';
import { detectOpExStepUp } from './reconciler/opexStepUp.js';
import {
  type QuantitativeReconciliationPhase1,
  type ReconcilerStatementInput,
  type ReconcilerContext,
  type MaterialFinding,
} from './reconciler/shared.js';

// ─── DB-row → reconciler input adapter ─────────────────────────────
//
// Kept here (not in shared.ts) so the shared types stay free of
// Supabase row assumptions. Callers fetch `FinancialStatement` rows
// however they want and feed the slim view to this function.

export interface FinancialStatementRow {
  id: string;
  documentId: string | null;
  statementType: string;
  period: string;
  periodType: string;
  unitScale: string;
  currency: string;
  lineItems: unknown;
  extractionConfidence: number | null;
  isActive: boolean;
}

export function rowsToReconcilerInput(
  rows: FinancialStatementRow[],
): ReconcilerStatementInput[] {
  return rows
    .filter((r) =>
      r.statementType === 'INCOME_STATEMENT' ||
      r.statementType === 'BALANCE_SHEET' ||
      r.statementType === 'CASH_FLOW',
    )
    .map((r) => ({
      id: r.id,
      documentId: r.documentId,
      statementType: r.statementType as 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'CASH_FLOW',
      period: r.period,
      periodType: (r.periodType === 'PROJECTED' || r.periodType === 'LTM'
        ? r.periodType
        : 'HISTORICAL') as 'HISTORICAL' | 'PROJECTED' | 'LTM',
      unitScale: (r.unitScale ?? 'ACTUALS') as UnitScale,
      currency: r.currency ?? 'USD',
      // lineItems is jsonb — Supabase returns parsed JSON. Coerce to the
      // expected shape; non-numeric values are dropped at the
      // getLineItemDollars layer.
      lineItems: (r.lineItems && typeof r.lineItems === 'object'
        ? (r.lineItems as Record<string, number | null>)
        : {}),
      extractionConfidence: r.extractionConfidence,
      isActive: r.isActive,
    }));
}

// ─── Phase 1 composition ───────────────────────────────────────────

export interface ReconcilerInput {
  statements: ReconcilerStatementInput[];
  ctx?: ReconcilerContext;
}

export function runQuantitativeReconciliationPhase1(
  input: ReconcilerInput,
): QuantitativeReconciliationPhase1 {
  const { statements, ctx } = input;
  const warnings: string[] = [];

  const computedGroundTruth = computeGroundTruth(statements, ctx);
  const channelConcentrationAnalysis = computeChannelConcentration(statements);

  // Valuation framing only runs when both an asking price and at least
  // one numerator are available. Otherwise the block is null and the
  // route caller can decide whether to surface "asking price not set"
  // as user-facing guidance.
  const askingPriceUsd = ctx?.askingPriceUsd ?? null;
  const valuationFraming =
    askingPriceUsd && askingPriceUsd > 0
      ? computeValuationFraming({
          askingPriceUsd,
          ttmGrossRevenueUsd: computedGroundTruth.TTM_revenue,
          ttmNetIncomeUsd: computedGroundTruth.TTM_netIncome,
          threeMoAnnualizedRevenueUsd: computedGroundTruth.impliedARR_3MoAvg,
        })
      : null;

  // Phase-1 material findings — currently just the OpEx step-up
  // detector. Phase 2 appends LLM-derived findings to this array.
  const materialFindings: MaterialFinding[] = [];
  const opexFinding = detectOpExStepUp(statements);
  if (opexFinding) materialFindings.push(opexFinding);

  // Surface input gaps so the UI can explain why a block is missing
  // instead of silently rendering empty.
  if (statements.length === 0) {
    warnings.push('No FinancialStatement rows found for this deal. Run extraction first.');
  } else if (computedGroundTruth.TTM_revenue == null) {
    warnings.push(
      'No monthly revenue data found — TTM, MRR, and 3-month-ARR figures are unavailable. ' +
      'Annual aggregates may still be present.',
    );
  }
  if (askingPriceUsd == null || askingPriceUsd <= 0) {
    warnings.push(
      'Deal asking price not set — valuation framing block omitted. ' +
      'Set Deal.dealSize on the deal record to enable.',
    );
  }
  if (channelConcentrationAnalysis == null) {
    warnings.push(
      'No channel-tagged revenue line items detected (e.g. revenue_stripe, revenue_wix). ' +
      'Channel concentration block omitted.',
    );
  }

  return {
    computedGroundTruth,
    channelConcentrationAnalysis,
    valuationFraming,
    materialFindings,
    warnings,
  };
}

// ─── Re-exports for route callers ──────────────────────────────────

export type {
  QuantitativeReconciliationPhase1,
  ReconcilerStatementInput,
  ReconcilerContext,
  MaterialFinding,
} from './reconciler/shared.js';
