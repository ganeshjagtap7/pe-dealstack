import { supabase } from '../supabase.js';
import { extractDealDataFromText, ExtractedDealData } from './aiExtractor.js';
import { classifyFinancials, ClassificationResult, ClassifiedStatement } from './financialClassifier.js';
import { log } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────

export interface OrchestrationInput {
  text: string;
  dealId: string;
  documentId?: string;
  /** Pre-computed classification from vision extraction — skips classifyFinancials() when provided */
  classification?: ClassificationResult;
  /** Source label written to DB rows ('gpt4o' | 'gpt4o-vision') */
  extractionSource?: string;
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
  hasConflicts: boolean;
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
  // Use pre-computed classification (vision path) or run text classifier
  const classification = input.classification ?? await classifyFinancials(input.text);
  const source = input.extractionSource ?? 'gpt4o';

  if (!classification || classification.statements.length === 0) {
    log.warn('Deep pass: no financial statements found', { dealId: input.dealId });
    return {
      statementsStored: 0,
      periodsStored: 0,
      overallConfidence: 0,
      statementIds: [],
      warnings: classification?.warnings ?? ['No financial data found in document'],
      hasConflicts: false,
    };
  }

  const statementIds: string[] = [];
  let periodsStored = 0;
  let hasConflicts = false;
  const now = new Date().toISOString();

  for (const stmt of classification.statements) {
    for (const periodData of stmt.periods) {
      try {
        // Check for existing active row from a DIFFERENT document
        const { data: existing } = await supabase
          .from('FinancialStatement')
          .select('id, documentId, isActive')
          .eq('dealId', input.dealId)
          .eq('statementType', stmt.statementType)
          .eq('period', periodData.period)
          .eq('isActive', true)
          .maybeSingle();

        const isConflict = existing && existing.documentId !== (input.documentId ?? null);

        if (isConflict) {
          // CONFLICT: different document already has active data for this period
          log.info('Deep pass: conflict detected', {
            dealId: input.dealId, statementType: stmt.statementType,
            period: periodData.period, existingDocId: existing.documentId,
            newDocId: input.documentId,
          });

          // Mark existing row as needs_review (keep it active)
          await supabase
            .from('FinancialStatement')
            .update({ mergeStatus: 'needs_review' })
            .eq('id', existing.id);

          // Insert new row as inactive + needs_review
          const { data, error } = await supabase
            .from('FinancialStatement')
            .insert({
              dealId: input.dealId,
              documentId: input.documentId ?? null,
              statementType: stmt.statementType,
              period: periodData.period,
              periodType: periodData.periodType,
              lineItems: periodData.lineItems,
              currency: stmt.currency,
              unitScale: stmt.unitScale,
              extractionConfidence: periodData.confidence,
              extractionSource: source,
              extractedAt: now,
              isActive: false,
              mergeStatus: 'needs_review',
            })
            .select('id')
            .single();

          if (error) {
            log.error('Deep pass: conflict insert failed', {
              dealId: input.dealId, statementType: stmt.statementType,
              period: periodData.period, error,
            });
            continue;
          }
          if (data?.id) statementIds.push(data.id);
          periodsStored++;
          hasConflicts = true;
        } else {
          // NO CONFLICT: same doc re-extraction or first extraction for this period
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
                extractionSource: source,
                extractedAt: now,
                isActive: true,
                mergeStatus: 'auto',
              },
              { onConflict: 'dealId,statementType,period,documentId' },
            )
            .select('id')
            .single();

          if (error) {
            log.error('Deep pass: failed to upsert period', {
              dealId: input.dealId, statementType: stmt.statementType,
              period: periodData.period, error,
            });
            continue;
          }
          if (data?.id) statementIds.push(data.id);
          periodsStored++;
        }
      } catch (err) {
        log.error('Deep pass: unexpected error upserting period', {
          dealId: input.dealId, statementType: stmt.statementType,
          period: periodData.period, error: err,
        });
      }
    }
  }

  log.info('Deep pass completed', {
    dealId: input.dealId,
    statementsFound: classification.statements.length,
    periodsStored,
    hasConflicts,
    overallConfidence: classification.overallConfidence,
  });

  return {
    statementsStored: classification.statements.length,
    periodsStored,
    overallConfidence: classification.overallConfidence,
    statementIds,
    warnings: classification.warnings,
    hasConflicts,
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
