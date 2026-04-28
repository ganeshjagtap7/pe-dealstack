/**
 * Self-Correct Node — LangGraph node for the financial extraction agent.
 *
 * THE KILLER FEATURE: When validation fails, this node:
 *   1. Reads the failedChecks (math errors, low confidence periods)
 *   2. Builds a targeted GPT-4o prompt explaining exactly what's wrong
 *   3. Asks GPT-4o to re-extract only the failing statement/periods
 *   4. Merges corrected data back into the statements array
 *   5. Increments retryCount so the graph loops back to Validate
 *
 * If rawText is empty (vision path), falls back to Vision re-extraction.
 * Max retries controlled by state.maxRetries (default 3).
 */

import { classifyFinancialsVision } from '../../../visionExtractor.js';
import { runSelfCorrection } from '../../../extraction/selfCorrector.js';
import { validateExtraction } from '../../../extraction/validator.js';
import { log } from '../../../../utils/logger.js';
import { estimateOpenAICostUsd } from '../../../../utils/constants.js';
import type { ClassifiedStatement, ClassificationResult } from '../../../financialClassifier.js';
import type { FinancialAgentStateType } from '../state.js';
import type { AgentStep, FailedCheck } from '../state.js';

/** Create a timestamped agent step */
function step(node: string, message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node, message, detail };
}

/**
 * Merge corrected statements back into the original statements array.
 * Only replaces periods that were re-extracted — keeps everything else intact.
 */
function mergeStatements(
  original: ClassifiedStatement[],
  corrections: ClassifiedStatement[],
): ClassifiedStatement[] {
  const merged = [...original];

  for (const correction of corrections) {
    const existingIdx = merged.findIndex(s => s.statementType === correction.statementType);

    if (existingIdx === -1) {
      // New statement type from correction — add it
      merged.push(correction);
      continue;
    }

    // Replace matching periods, keep the rest
    const existing = merged[existingIdx];
    for (const correctedPeriod of correction.periods) {
      const periodIdx = existing.periods.findIndex(p => p.period === correctedPeriod.period);
      if (periodIdx !== -1) {
        // Only replace if correction has higher confidence
        if (correctedPeriod.confidence >= existing.periods[periodIdx].confidence) {
          existing.periods[periodIdx] = correctedPeriod;
        }
      } else {
        existing.periods.push(correctedPeriod);
      }
    }
  }

  return merged;
}

/**
 * LangGraph Self-Correct Node
 *
 * Reads: failedChecks, rawText, fileBuffer, fileName, statements, retryCount
 * Writes: statements, overallConfidence, retryCount, status, steps
 */
export async function selfCorrectNode(
  state: FinancialAgentStateType,
): Promise<Partial<FinancialAgentStateType>> {
  const steps: AgentStep[] = [];
  const { failedChecks, rawText, fileBuffer, fileName, statements, retryCount } = state;

  if (!failedChecks || failedChecks.length === 0) {
    steps.push(step('self_correct', 'No failed checks — nothing to correct'));
    return { status: 'storing', steps };
  }

  const targetTypes = [...new Set(failedChecks.map(fc => fc.statementType))];
  const targetPeriods = [...new Set(failedChecks.map(fc => fc.period).filter(Boolean))];

  steps.push(step(
    'self_correct',
    `Attempting correction (retry ${retryCount + 1}): ${failedChecks.length} issue(s) in ${targetTypes.join(', ')}`,
    targetPeriods.length > 0 ? `Periods: ${targetPeriods.join(', ')}` : undefined,
  ));

  try {
    let correctedClassification: ClassificationResult | null = null;
    let usedTargetedCorrection = false;

    // ── Text path: shared snippet-based self-correction ──
    let correctionTokens = 0;
    let correctionCost = 0;
    if (rawText && rawText.trim().length >= 200) {
      steps.push(step('self_correct', 'Running targeted snippet self-correction'));

      const initialValidation = validateExtraction(statements);
      const correctionResult = await runSelfCorrection(rawText, statements, initialValidation);
      const promptTok = correctionResult.usage.promptTokens;
      const completionTok = correctionResult.usage.completionTokens;
      correctionTokens = promptTok + completionTok;
      correctionCost = estimateOpenAICostUsd('gpt-4o', promptTok, completionTok);

      const correctedCount = correctionResult.corrections.reduce(
        (sum, attempt) => sum + attempt.itemsCorrected.length,
        0,
      );

      if (correctedCount > 0) {
        correctedClassification = {
          statements: correctionResult.correctedStatements,
          overallConfidence: correctionResult.finalValidation.overallConfidence,
          warnings: correctionResult.needsManualReview ? ['Self-correction still needs manual review'] : [],
        };
        usedTargetedCorrection = true;
        steps.push(step('self_correct', `Applied ${correctedCount} targeted correction(s)`));
      } else {
        steps.push(step('self_correct', 'No targeted corrections found'));
      }
    }

    // ── Vision fallback: re-run full Vision extraction ──
    if (!correctedClassification && fileBuffer && fileBuffer.length > 0) {
      steps.push(step('self_correct', 'Text unavailable — re-extracting with GPT-4o Vision'));
      correctedClassification = await classifyFinancialsVision(fileBuffer, fileName || 'document.pdf');

      if (correctedClassification) {
        steps.push(step(
          'self_correct',
          `Vision returned ${correctedClassification.statements?.length ?? 0} statement(s)`,
        ));
      }
    }

    // ── No correction possible ──
    if (!correctedClassification || !correctedClassification.statements?.length) {
      steps.push(step('self_correct', 'Could not obtain corrected data — proceeding with original'));
      return {
        retryCount: retryCount + 1,
        status: 'validating',
        steps,
      };
    }

    // ── Merge corrections into original statements ──
    const mergedStatements = usedTargetedCorrection
      ? correctedClassification.statements
      : mergeStatements(statements, correctedClassification.statements);

    // Recalculate overall confidence from merged data
    const allConfidences: number[] = [];
    for (const stmt of mergedStatements) {
      for (const p of stmt.periods) {
        allConfidences.push(p.confidence);
      }
    }
    const newConfidence = allConfidences.length > 0
      ? Math.round(allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length)
      : 0;

    const improvementMsg = newConfidence > state.overallConfidence
      ? `Confidence improved: ${state.overallConfidence}% → ${newConfidence}%`
      : `Confidence unchanged: ${newConfidence}%`;
    steps.push(step('self_correct', `Merged corrections into statements. ${improvementMsg}`));

    return {
      statements: mergedStatements,
      overallConfidence: newConfidence,
      retryCount: retryCount + 1,
      status: 'validating',
      tokensUsed: correctionTokens,
      estimatedCostUsd: correctionCost,
      warnings: [
        ...state.warnings,
        ...(correctedClassification.warnings ?? []),
      ],
      steps,
    };
  } catch (err) {
    log.error('Self-correct node: error during correction', err);
    steps.push(step('self_correct', 'Correction attempt failed', String(err)));

    return {
      retryCount: retryCount + 1,
      status: 'validating',
      steps,
    };
  }
}
