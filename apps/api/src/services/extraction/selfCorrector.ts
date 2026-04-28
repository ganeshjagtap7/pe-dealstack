/**
 * selfCorrector.ts — Targeted LLM self-correction loop.
 *
 * Works on top of the existing selfCorrectNode logic:
 *   - Accepts flagged items from validateExtraction()
 *   - Finds the minimal relevant text snippet for each issue
 *   - Makes a targeted GPT-4o call per issue (not a full re-extraction)
 *   - Guards against null/non-numeric LLM responses before overwriting
 *   - Tracks oldValue / newValue for every correction
 *   - Max 2 retries, updates confidence after each attempt
 *   - Sets needsManualReview when validation still fails after max retries
 *
 * Token usage is aggregated across all per-item calls and returned
 * to the pipeline for accurate cost calculation.
 */

import { openai, isAIEnabled } from '../../openai.js';
import { validateExtraction } from './validator.js';
import { log } from '../../utils/logger.js';
import type { ClassifiedStatement } from '../financialClassifier.js';
import type { FlaggedItem, PipelineValidationResult } from './validator.js';
import type { TokenUsage } from './financialClassifier.js';

// ─── Types ────────────────────────────────────────────────────

export interface CorrectionRecord {
  lineItem: string;
  statementType: string;
  period: string;
  oldValue: number | null;
  newValue: number;
}

export interface CorrectionAttempt {
  attempt: number;
  itemsCorrected: CorrectionRecord[];
  validationAfter: PipelineValidationResult;
}

export interface SelfCorrectionResult {
  correctedStatements: ClassifiedStatement[];
  corrections: CorrectionAttempt[];
  finalValidation: PipelineValidationResult;
  needsManualReview: boolean;
  usage: TokenUsage;
}

// ─── Constants ────────────────────────────────────────────────

const MAX_RETRIES = 2;
const SNIPPET_WINDOW_LINES = 20;

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Find the most relevant snippet of source text for a flagged line item.
 *
 * Algorithm:
 *  1. Find the line containing the keyword (case-insensitive).
 *  2. Expand to the nearest blank-line boundaries (logical paragraph).
 *  3. Ensure at least SNIPPET_WINDOW_LINES above and below the hit.
 *  4. Fall back to the first 2 000 chars if no match is found.
 */
function findRelevantSnippet(text: string, lineItem: string): string {
  if (!text || text.trim().length === 0) return '';

  const lines = text.split('\n');
  const keyword = lineItem.replace(/_/g, ' ');
  const hitIdx = lines.findIndex(l => l.toLowerCase().includes(keyword.toLowerCase()));

  if (hitIdx === -1) return text.substring(0, 2000);

  // Expand to blank-line paragraph boundaries
  let start = hitIdx;
  let end = hitIdx;

  while (start > 0 && lines[start - 1].trim() !== '') start--;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;

  // Ensure minimum window
  start = Math.max(0, Math.min(start, hitIdx - SNIPPET_WINDOW_LINES));
  end = Math.min(lines.length - 1, Math.max(end, hitIdx + SNIPPET_WINDOW_LINES));

  return lines.slice(start, end + 1).join('\n');
}

/**
 * Deep-clone statements so corrections don't mutate the originals.
 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Apply a corrected value to the matching statement period.
 * Returns a CorrectionRecord if a change was made, null otherwise.
 */
function applyCorrection(
  statements: ClassifiedStatement[],
  item: FlaggedItem,
  newValue: number,
): CorrectionRecord | null {
  const stmt = statements.find(s => s.statementType === item.statementType);
  if (!stmt) return null;

  const period = stmt.periods.find(p => p.period === item.period);
  if (!period) return null;

  const lineItemObj = period.lineItems.find(l => l.name === item.lineItem);
  const oldValue = lineItemObj?.value ?? null;
  if (oldValue === newValue) return null; // No actual change

  if (lineItemObj) {
    lineItemObj.value = newValue;
  } else {
    period.lineItems.push({ name: item.lineItem, value: newValue });
  }

  return {
    lineItem: item.lineItem,
    statementType: item.statementType,
    period: item.period,
    oldValue,
    newValue,
  };
}

/**
 * Adjust confidence scores based on whether corrections improved validation.
 * Increases confidence by 0.15 (capped at 100) when errors decrease,
 * decreases by 0.05 (floor 10) when the loop is stuck.
 */
function adjustConfidence(
  statements: ClassifiedStatement[],
  priorErrorCount: number,
  newErrorCount: number,
): void {
  const improved = newErrorCount < priorErrorCount;
  for (const stmt of statements) {
    for (const period of stmt.periods) {
      if (improved) {
        period.confidence = Math.min(period.confidence + 15, 100);
      } else {
        period.confidence = Math.max(period.confidence - 5, 10);
      }
    }
  }
}

// ─── Main Export ─────────────────────────────────────────────

/**
 * Run the self-correction loop on statements that failed validation.
 *
 * @param originalText   Raw extracted text (used for targeted snippet lookup)
 * @param statements     Statements from classifyExtraction()
 * @param initialValidation  Result from validateExtraction()
 */
export async function runSelfCorrection(
  originalText: string,
  statements: ClassifiedStatement[],
  initialValidation: PipelineValidationResult,
): Promise<SelfCorrectionResult> {
  const usageTracker: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  const corrections: CorrectionAttempt[] = [];

  // Work on a deep clone so the caller's originals are never mutated
  let currentStatements = deepClone(statements);
  let currentValidation = initialValidation;
  let attempts = 0;

  if (!isAIEnabled() || !openai) {
    log.warn('selfCorrector: OpenAI not configured — skipping self-correction');
    return {
      correctedStatements: currentStatements,
      corrections: [],
      finalValidation: currentValidation,
      needsManualReview: !currentValidation.isValid,
      usage: usageTracker,
    };
  }

  while (!currentValidation.isValid && attempts < MAX_RETRIES) {
    attempts++;
    const itemsCorrected: CorrectionRecord[] = [];
    const priorErrorCount = currentValidation.errorCount;

    log.info('selfCorrector: starting attempt', {
      attempt: attempts,
      flaggedItems: currentValidation.flaggedItems.length,
      errorCount: priorErrorCount,
    });

    for (const item of currentValidation.flaggedItems) {
      // Skip items where value is 0 and issue is non-numeric — nothing to correct
      if (item.value === 0 && item.suggestedAction !== 'likely_wrong') continue;

      const snippet = findRelevantSnippet(originalText, item.lineItem);

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'You are a financial analyst correcting an extraction error. ' +
                'Return ONLY a JSON object with a single key "newValue" containing the corrected number in MILLIONS. ' +
                'If you cannot determine the correct value from the text, return an empty object {}. ' +
                'Never guess or fabricate values.',
            },
            {
              role: 'user',
              content: [
                `Line item: ${item.lineItem}`,
                `Statement: ${item.statementType}`,
                `Period: ${item.period}`,
                `Extracted value: ${item.value}M`,
                `Issue: ${item.reason}`,
                '',
                'Relevant document excerpt:',
                snippet,
              ].join('\n'),
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.05,
          max_tokens: 256,
        }, { timeout: 30000 });

        usageTracker.promptTokens += response.usage?.prompt_tokens ?? 0;
        usageTracker.completionTokens += response.usage?.completion_tokens ?? 0;

        const raw = JSON.parse(response.choices[0]?.message?.content ?? '{}');

        // ── Strict null-guard: only apply if response is a valid finite number ──
        if (
          raw.newValue !== undefined &&
          raw.newValue !== null &&
          typeof raw.newValue === 'number' &&
          Number.isFinite(raw.newValue)
        ) {
          const record = applyCorrection(currentStatements, item, raw.newValue);
          if (record) {
            itemsCorrected.push(record);
            log.info('selfCorrector: applied correction', record);
          }
        }
      } catch (err: any) {
        log.warn('selfCorrector: item correction failed', {
          lineItem: item.lineItem,
          period: item.period,
          error: err.message,
        });
        // Continue with next item — partial failure is acceptable
      }
    }

    // Re-validate with corrected statements
    currentValidation = validateExtraction(currentStatements);

    // Adjust confidence scores based on whether we improved
    adjustConfidence(currentStatements, priorErrorCount, currentValidation.errorCount);

    corrections.push({
      attempt: attempts,
      itemsCorrected,
      validationAfter: currentValidation,
    });

    log.info('selfCorrector: attempt complete', {
      attempt: attempts,
      itemsCorrected: itemsCorrected.length,
      errorCountAfter: currentValidation.errorCount,
      overallPassed: currentValidation.isValid,
    });

    // Early exit if LLM found no corrections — further attempts are futile
    if (itemsCorrected.length === 0) {
      log.info('selfCorrector: no corrections made — breaking early');
      break;
    }
  }

  return {
    correctedStatements: currentStatements,
    corrections,
    finalValidation: currentValidation,
    needsManualReview: !currentValidation.isValid,
    usage: usageTracker,
  };
}
