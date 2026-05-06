import { openai, isAIEnabled } from '../../openai.js';
import { log } from '../../utils/logger.js';
import type { ClassifiedStatement } from './financialClassifier.js';
import { validateExtraction, type PipelineValidationResult } from './validator.js';

const MAX_RETRIES = 2;

interface CorrectedItem {
  lineItem: string;
  period: string;
  statementType: string;
  oldValue: number | null;
  newValue: number;
}

interface CorrectionAttempt {
  attempt: number;
  itemsCorrected: CorrectedItem[];
  validationAfter: PipelineValidationResult;
}

export interface SelfCorrectionResult {
  correctedStatements: ClassifiedStatement[];
  corrections: CorrectionAttempt[];
  finalValidation: PipelineValidationResult;
  needsManualReview: boolean;
  usage: { promptTokens: number; completionTokens: number };
}

export function findRelevantSnippet(text: string, lineItemKey: string): string {
  const keyword = lineItemKey.replace(/_/g, ' ').toLowerCase();
  const lines = text.split('\n');

  const matchIdx = lines.findIndex(line => line.toLowerCase().includes(keyword));

  if (matchIdx === -1) {
    return text.slice(0, 2000);
  }

  let start = matchIdx;
  let end = matchIdx;

  while (start > 0 && lines[start - 1].trim() !== '') start--;
  while (end < lines.length - 1 && lines[end + 1].trim() !== '') end++;

  start = Math.min(start, Math.max(0, matchIdx - 20));
  end = Math.max(end, Math.min(lines.length - 1, matchIdx + 20));

  return lines.slice(start, end + 1).join('\n');
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export async function runSelfCorrection(
  originalText: string,
  statements: ClassifiedStatement[],
  initialValidation: PipelineValidationResult,
): Promise<SelfCorrectionResult> {
  if (!isAIEnabled() || !openai) {
    log.warn('selfCorrector: OpenAI not configured, skipping self-correction');
    return {
      correctedStatements: statements,
      corrections: [],
      finalValidation: initialValidation,
      needsManualReview: !initialValidation.isValid,
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }

  let currentStatements = deepClone(statements);
  let currentValidation = initialValidation;
  const corrections: CorrectionAttempt[] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  let attempt = 0;
  while (!currentValidation.isValid && attempt < MAX_RETRIES) {
    attempt++;
    log.info('selfCorrector: attempt', { attempt, flaggedCount: currentValidation.flaggedItems.length });

    const itemsCorrected: CorrectedItem[] = [];
    const flaggedList = currentValidation.flaggedItems.slice(0, 15);
    const snippets = flaggedList.map(item => `Issue: ${item.reason} for ${item.lineItem} in ${item.statementType} (${item.period}). Snippet:\n${findRelevantSnippet(originalText, item.lineItem)}`).join('\n---\n');

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a financial analyst. Fix the reported issues in extracted data. Return JSON {corrections: [{lineItem, period, statementType, newValue}]}. Values MUST be in MILLIONS. Only use values clearly stated in the text. Return null if value cannot be found.',
          },
          {
            role: 'user',
            content: `Please fix these issues:\n\n${snippets}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 1500,
      });

      totalPromptTokens += response.usage?.prompt_tokens ?? 0;
      totalCompletionTokens += response.usage?.completion_tokens ?? 0;

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        const batchCorrections = parsed?.corrections || [];

        for (const corr of batchCorrections) {
          const { lineItem, period, statementType, newValue } = corr;
          if (typeof newValue !== 'number' || !isFinite(newValue)) continue;

          const targetStmt = currentStatements.find(s => s.statementType === statementType);
          if (!targetStmt) continue;

          const targetPeriod = targetStmt.periods.find(p => p.period === period);
          if (!targetPeriod) continue;

          const targetLineItem = targetPeriod.lineItems.find(l => l.name === lineItem);
          const oldValue = targetLineItem?.value ?? null;

          if (targetLineItem) {
            targetLineItem.value = newValue;
          } else {
            targetPeriod.lineItems.push({
              name: lineItem,
              value: newValue,
              category: lineItem,
              isSubtotal: false,
            });
          }

          itemsCorrected.push({ lineItem, period, statementType, oldValue, newValue });
        }
      }
    } catch (err) {
      log.error('selfCorrector: Batched GPT call failed', err);
    }

    if (itemsCorrected.length === 0) {
      log.info('selfCorrector: LLM found nothing to fix, breaking early');
      break;
    }

    const prevErrorCount = currentValidation.errorCount;
    currentValidation = validateExtraction(currentStatements);

    let adjustedConfidence = currentValidation.overallConfidence;
    if (currentValidation.errorCount < prevErrorCount) {
      adjustedConfidence = Math.min(100, adjustedConfidence + 15);
    } else {
      adjustedConfidence = Math.max(10, adjustedConfidence - 5);
    }
    currentValidation = { ...currentValidation, overallConfidence: adjustedConfidence };

    corrections.push({ attempt, itemsCorrected, validationAfter: currentValidation });
  }

  return {
    correctedStatements: currentStatements,
    corrections,
    finalValidation: currentValidation,
    needsManualReview: !currentValidation.isValid,
    usage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens },
  };
}
