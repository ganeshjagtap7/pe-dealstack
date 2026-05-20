/**
 * Self-Correct Node — LangGraph node for the financial extraction agent.
 *
 * THE KILLER FEATURE: When validation fails, this node:
 *   1. Reads the failedChecks (math errors, low confidence periods)
 *   2. Builds a targeted AI prompt explaining exactly what's wrong
 *   3. Asks the model to re-extract only the failing statement/periods
 *   4. Merges corrected data back into the statements array
 *   5. Increments retryCount so the graph loops back to Validate
 *
 * If rawText is empty (vision path), falls back to Vision re-extraction.
 * Max retries controlled by state.maxRetries (default 3).
 */

import { openai, isAIEnabled, trackedChatCompletion } from '../../../../openai.js';
import { MODEL_CLASSIFICATION } from '../../../../utils/aiModels.js';
import { classifyFinancialsVision } from '../../../visionExtractor.js';
import { log } from '../../../../utils/logger.js';
import { getTodayIso } from '../../../../utils/dates.js';
import type { ClassifiedStatement, ClassificationResult } from '../../../financialClassifier.js';
import {
  applyExplicitUnitOverride,
  applySmallDollarActualsOverride,
  detectExplicitUnitInText,
  hasExplicitSmallDollarAmounts,
} from '../../../financialClassifier.js';
import type { FinancialAgentStateType } from '../state.js';
import type { AgentStep, FailedCheck } from '../state.js';

/** Create a timestamped agent step */
function step(node: string, message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node, message, detail };
}

/**
 * Build a targeted correction prompt that tells the model exactly what went wrong.
 */
function buildCorrectionPrompt(failedChecks: FailedCheck[], rawText: string, today: string): string {
  const issueDescriptions = failedChecks.map((fc, i) => {
    if (fc.check === 'low_confidence') {
      return `${i + 1}. ${fc.statementType} for period ${fc.period ?? 'unknown'}: ${fc.message}. Please re-extract this data more carefully.`;
    }
    return `${i + 1}. ${fc.statementType} for period ${fc.period ?? 'all'}: ${fc.message}. Please find the correct values.`;
  }).join('\n');

  const targetStatements = [...new Set(failedChecks.map(fc => fc.statementType))];
  const targetPeriods = [...new Set(failedChecks.map(fc => fc.period).filter(Boolean))];

  return `You are a senior financial analyst re-checking extracted financial data. Today's date is ${today}. Use this for any relative period inference (FY, LTM, "current quarter", "last N days"). The previous extraction had validation errors that need correction.

ISSUES FOUND:
${issueDescriptions}

TASK: Re-extract ONLY the following from the document text below:
- Statement types: ${targetStatements.join(', ')}
${targetPeriods.length > 0 ? `- Periods: ${targetPeriods.join(', ')}` : '- All periods for the affected statements'}

RULES:
1. Focus specifically on the issues listed above
2. Double-check your math: Revenue - COGS must equal Gross Profit, Assets must equal Liabilities + Equity, etc.
3. If a value truly cannot be determined from the text, use null — do not guess
4. Preserve the source's unit scale. Set unitScale to whatever the source uses: MILLIONS, THOUSANDS, ACTUALS, or BILLIONS. Do NOT convert values — store them at the source's scale (e.g., a startup spreadsheet showing "$6,700" in actual dollars stays as 6700 with unitScale "ACTUALS", NOT 0.0067 with "MILLIONS").
5. confidence: only use 90+ if you are certain the value is correct

INCOME STATEMENT line item keys:
revenue, cogs, gross_profit, gross_margin_pct, sga, rd, other_opex, total_opex,
ebitda, ebitda_margin_pct, da, ebit, interest_expense, ebt, tax, net_income, sde

BALANCE SHEET line item keys:
cash, accounts_receivable, inventory, other_current_assets, total_current_assets,
ppe_net, goodwill, intangibles, total_assets,
accounts_payable, short_term_debt, other_current_liabilities, total_current_liabilities,
long_term_debt, total_liabilities, total_equity

CASH FLOW line item keys:
operating_cf, capex, fcf, acquisitions, debt_repayment, dividends, net_change_cash

Return ONLY valid JSON. Set unitScale to whatever matches the source: "MILLIONS" | "THOUSANDS" | "ACTUALS" | "BILLIONS". Example below uses THOUSANDS — do NOT default to MILLIONS, mirror the source:
{
  "statements": [
    {
      "statementType": "BALANCE_SHEET",
      "unitScale": "<MILLIONS|THOUSANDS|ACTUALS|BILLIONS — match the source>",
      "currency": "USD",
      "periods": [
        {
          "period": "2023",
          "periodType": "HISTORICAL",
          "confidence": 92,
          "lineItems": { ... }
        }
      ]
    }
  ],
  "overallConfidence": 88,
  "warnings": []
}

DOCUMENT TEXT:
${rawText.slice(0, 30000)}`;
}

/**
 * Merge corrected statements back into the original statements array.
 * Only replaces periods that were re-extracted — keeps everything else intact.
 *
 * Importantly, when any period is replaced by a correction whose parent
 * statement carries a different `unitScale`, we propagate the corrected
 * unitScale onto the existing statement. The previous implementation kept the
 * original (often wrong) `unitScale` even when the re-extraction flipped
 * it — every period got the new value but the storage tag stayed wrong,
 * which is exactly the "values right, tag wrong" bug the user reported.
 *
 * If a correction REPLACES at least one period (i.e. higher-confidence
 * correction won), we adopt the correction's `unitScale` + `currency` for
 * the statement. New-period-only additions don't trigger the change (those
 * are appends; we trust the original tag).
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
    let replacedAny = false;
    for (const correctedPeriod of correction.periods) {
      const periodIdx = existing.periods.findIndex(p => p.period === correctedPeriod.period);
      if (periodIdx !== -1) {
        // Only replace if correction has higher confidence
        if (correctedPeriod.confidence >= existing.periods[periodIdx].confidence) {
          existing.periods[periodIdx] = correctedPeriod;
          replacedAny = true;
        }
      } else {
        existing.periods.push(correctedPeriod);
      }
    }

    // Propagate corrected unitScale/currency when the correction actually
    // displaced an existing period. The values inside a period are stored at
    // their parent statement's `unitScale`, so leaving the parent stale would
    // mis-tag every replaced row.
    if (replacedAny) {
      if (correction.unitScale && correction.unitScale !== existing.unitScale) {
        log.info('Self-correct merge: propagating corrected unitScale', {
          statementType: existing.statementType,
          oldScale: existing.unitScale,
          newScale: correction.unitScale,
        });
        existing.unitScale = correction.unitScale;
      }
      if (correction.currency && correction.currency !== existing.currency) {
        existing.currency = correction.currency;
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

    // ── Text path: targeted AI re-extraction ──
    if (rawText && rawText.trim().length >= 200 && isAIEnabled() && openai) {
      steps.push(step('self_correct', 'Re-extracting with targeted AI prompt'));

      // Compute today fresh per call — never cached.
      const prompt = buildCorrectionPrompt(failedChecks, rawText, getTodayIso());

      const response = await trackedChatCompletion('financial_extraction', {
        model: MODEL_CLASSIFICATION, // GPT-4.1 — requires response_format: json_object (incompatible with Claude)
        messages: [
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.05,
        max_tokens: 16000,
      }, { timeout: 90000 });

      const content = response.choices[0]?.message?.content;
      if (content) {
        correctedClassification = JSON.parse(content) as ClassificationResult;
        steps.push(step(
          'self_correct',
          `AI returned ${correctedClassification.statements?.length ?? 0} corrected statement(s)`,
        ));
      }
    }

    // ── Vision fallback: re-run full Vision extraction ──
    if (!correctedClassification && fileBuffer && fileBuffer.length > 0) {
      steps.push(step('self_correct', 'Text unavailable — re-extracting with AI Vision'));
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
    const mergedStatements = mergeStatements(statements, correctedClassification.statements);

    // Re-apply the same deterministic unit-scale guards the main classifier
    // uses (financialClassifier.ts:applyExplicitUnitOverride /
    // applySmallDollarActualsOverride). Without these, a self-correction
    // round can re-emit MILLIONS for a source that the original pass had
    // correctly downgraded to ACTUALS — the user-visible "values right,
    // unit wrong" symptom this whole code path is supposed to prevent.
    //
    // Safe even when rawText is empty (the vision fallback path) — the
    // text-scan helpers tolerate undefined/empty input and return null.
    if (rawText && rawText.length > 0) {
      const truncated = rawText.slice(0, 30_000);
      const explicitUnit = detectExplicitUnitInText(truncated);
      const hasSmallDollars = hasExplicitSmallDollarAmounts(truncated);
      const synth = { statements: mergedStatements, overallConfidence: 0, warnings: [] };
      applyExplicitUnitOverride(synth, explicitUnit);
      applySmallDollarActualsOverride(synth, hasSmallDollars, explicitUnit);
    }

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
