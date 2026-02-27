import { supabase } from '../supabase.js';
import { extractDealDataFromText, ExtractedDealData } from './aiExtractor.js';
import { classifyFinancials, ClassificationResult, ClassifiedStatement } from './financialClassifier.js';
import { log } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────

export interface OrchestrationInput {
  text: string;
  dealId: string;
  documentId?: string;
}

export interface FastPassResult {
  companyName: string | null;
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  revenueGrowth: number | null;
  overallConfidence: number;
  needsReview: boolean;
  rawData: ExtractedDealData;
}

export interface DeepPassResult {
  statementsStored: number;
  periodsStored: number;
  overallConfidence: number;
  statementIds: string[];
  warnings: string[];
}

export interface OrchestrationResult {
  fastPass: FastPassResult | null;
  deepPass: DeepPassResult | null;
  errors: string[];
}

// ─── Fast Pass ────────────────────────────────────────────────

/**
 * Fast pass: uses existing aiExtractor to pull top-line metrics
 * (revenue, EBITDA, margins for the most recent period).
 * Returns in < 10s — shown to user immediately.
 */
export async function runFastPass(text: string): Promise<FastPassResult | null> {
  const extracted = await extractDealDataFromText(text);
  if (!extracted) return null;

  return {
    companyName: extracted.companyName.value,
    revenue: extracted.revenue.value,
    ebitda: extracted.ebitda.value,
    ebitdaMargin: extracted.ebitdaMargin.value,
    revenueGrowth: extracted.revenueGrowth.value,
    overallConfidence: extracted.overallConfidence,
    needsReview: extracted.needsReview,
    rawData: extracted,
  };
}

// ─── Deep Pass ────────────────────────────────────────────────

/**
 * Deep pass: full 3-statement extraction via GPT-4o classifier.
 * Upserts one FinancialStatement row per (dealId, statementType, period).
 * Designed so the extraction layer can be swapped for Azure later —
 * only this function and classifyFinancials() need to change.
 */
export async function runDeepPass(input: OrchestrationInput): Promise<DeepPassResult | null> {
  const classification = await classifyFinancials(input.text);

  if (!classification || classification.statements.length === 0) {
    log.warn('Deep pass: no financial statements found', { dealId: input.dealId });
    return {
      statementsStored: 0,
      periodsStored: 0,
      overallConfidence: 0,
      statementIds: [],
      warnings: classification?.warnings ?? ['No financial data found in document'],
    };
  }

  const statementIds: string[] = [];
  let periodsStored = 0;
  const now = new Date().toISOString();

  for (const stmt of classification.statements) {
    for (const periodData of stmt.periods) {
      try {
        const { data, error } = await supabase
          .from('FinancialStatement')
          .upsert(
            {
              dealId: input.dealId,
              documentId: input.documentId ?? null,
              statementType: stmt.statementType,
              period: periodData.period,
              periodType: periodData.periodType,
              lineItems: periodData.lineItems,
              currency: stmt.currency,
              unitScale: stmt.unitScale,
              extractionConfidence: periodData.confidence,
              extractionSource: 'gpt4o',
              extractedAt: now,
            },
            { onConflict: 'dealId,statementType,period' },
          )
          .select('id')
          .single();

        if (error) {
          log.error('Deep pass: failed to upsert period', {
            dealId: input.dealId,
            statementType: stmt.statementType,
            period: periodData.period,
            error,
          });
          continue;
        }

        if (data?.id) statementIds.push(data.id);
        periodsStored++;
      } catch (err) {
        log.error('Deep pass: unexpected error upserting period', {
          dealId: input.dealId,
          statementType: stmt.statementType,
          period: periodData.period,
          error: err,
        });
      }
    }
  }

  log.info('Deep pass completed', {
    dealId: input.dealId,
    statementsFound: classification.statements.length,
    periodsStored,
    overallConfidence: classification.overallConfidence,
  });

  return {
    statementsStored: classification.statements.length,
    periodsStored,
    overallConfidence: classification.overallConfidence,
    statementIds,
    warnings: classification.warnings,
  };
}

// ─── Combined Orchestrator ────────────────────────────────────

/**
 * Run both fast and deep pass.
 * In practice the API routes call these separately so the user sees
 * top-line data immediately, then deep data when ready.
 * This combined function is useful for re-extraction and testing.
 */
export async function runFullExtraction(
  input: OrchestrationInput,
): Promise<OrchestrationResult> {
  const errors: string[] = [];

  const [fastPass, deepPass] = await Promise.allSettled([
    runFastPass(input.text),
    runDeepPass(input),
  ]);

  return {
    fastPass: fastPass.status === 'fulfilled' ? fastPass.value : (errors.push('Fast pass failed'), null),
    deepPass: deepPass.status === 'fulfilled' ? deepPass.value : (errors.push('Deep pass failed'), null),
    errors,
  };
}
