/**
 * pipeline.ts — End-to-end financial extraction pipeline.
 *
 * Orchestrates the four extraction stages:
 *   1. textExtractor   — parse file into text + sections
 *   2. financialClassifier — LLM classification with token tracking
 *   3. validator       — 7-rule validation engine
 *   4. selfCorrector   — targeted LLM self-correction (only if needed)
 *
 * Produces the canonical API output shape:
 * {
 *   status: 'success' | 'partial' | 'failed',
 *   statements: [],
 *   validation: {},
 *   corrections: {},
 *   metadata: { processingTime, tokensUsed, estimatedCost }
 * }
 *
 * Partial failure handling:
 *   - If text extraction fails → status:'failed', empty statements
 *   - If classification returns 0 statements → status:'failed'
 *   - If validation fails but self-correction can't fix it → status:'partial'
 *   - If all passes → status:'success'
 *
 * Cost model (gpt-4o as of 2024):
 *   Input:  $5.00 / 1M tokens
 *   Output: $15.00 / 1M tokens
 */

import { extractText } from './textExtractor.js';
import { classifyExtraction } from './financialClassifier.js';
import { validateExtraction } from './validator.js';
import { runSelfCorrection } from './selfCorrector.js';
import { log } from '../../utils/logger.js';
import type { ClassifiedStatement } from '../financialClassifier.js';
import type { PipelineValidationResult } from './validator.js';
import type { SelfCorrectionResult } from './selfCorrector.js';

// ─── Types ────────────────────────────────────────────────────

export type PipelineStatus = 'success' | 'partial' | 'failed';

export interface ProcessingTimes {
  textExtractionMs: number;
  classificationMs: number;
  validationMs: number;
  selfCorrectionMs: number;
  totalMs: number;
}

export interface PipelineMetadata {
  fileName: string;
  format: string;
  extractionMethod: string;
  processingTime: ProcessingTimes;
  tokensUsed: number;
  estimatedCost: number;
  error?: string;
}

export interface PipelineResult {
  status: PipelineStatus;
  statements: ClassifiedStatement[];
  validation: PipelineValidationResult;
  corrections: SelfCorrectionResult | null;
  metadata: PipelineMetadata;
}

// ─── Constants ────────────────────────────────────────────────

/** GPT-4o pricing per token (USD) */
const GPT4O_INPUT_COST_PER_TOKEN = 5.0 / 1_000_000;   // $5 / 1M
const GPT4O_OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000;  // $15 / 1M

// ─── Empty validation helper ──────────────────────────────────

function emptyValidation(): PipelineValidationResult {
  return {
    checks: [],
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    overallPassed: true,
    flaggedItems: [],
    overallConfidence: 0,
  };
}

// ─── Main Export ─────────────────────────────────────────────

/**
 * Run the complete extraction pipeline for a single file.
 *
 * @param filePath   Absolute path to the uploaded file (will be read from disk)
 * @param mimeType   MIME type of the file
 * @param fileName   Original filename (used for metadata / logging)
 */
export async function runExtractionPipeline(
  filePath: string,
  mimeType: string,
  fileName: string,
): Promise<PipelineResult> {
  const times: ProcessingTimes = {
    textExtractionMs: 0,
    classificationMs: 0,
    validationMs: 0,
    selfCorrectionMs: 0,
    totalMs: 0,
  };
  const pipelineStart = performance.now();

  log.info('pipeline: starting', { fileName, mimeType });

  // ── Stage 1: Text Extraction ───────────────────────────────
  let textResult: Awaited<ReturnType<typeof extractText>>;
  const t1 = performance.now();
  try {
    textResult = await extractText(filePath, mimeType);
    times.textExtractionMs = performance.now() - t1;
    log.info('pipeline: text extraction done', {
      format: textResult.metadata.format,
      sections: textResult.sections.length,
      chars: textResult.text.length,
      ms: times.textExtractionMs.toFixed(0),
    });
  } catch (err: any) {
    times.textExtractionMs = performance.now() - t1;
    times.totalMs = performance.now() - pipelineStart;
    log.error('pipeline: text extraction failed', err);
    return {
      status: 'failed',
      statements: [],
      validation: emptyValidation(),
      corrections: null,
      metadata: {
        fileName,
        format: 'unknown',
        extractionMethod: 'unknown',
        processingTime: times,
        tokensUsed: 0,
        estimatedCost: 0,
        error: err.message,
      },
    };
  }

  // ── Stage 2: Financial Classification ─────────────────────
  const t2 = performance.now();
  let classifyResult: Awaited<ReturnType<typeof classifyExtraction>>;
  try {
    classifyResult = await classifyExtraction(textResult.text);
    times.classificationMs = performance.now() - t2;
    log.info('pipeline: classification done', {
      statements: classifyResult.statements.length,
      promptTokens: classifyResult.usage.promptTokens,
      completionTokens: classifyResult.usage.completionTokens,
      ms: times.classificationMs.toFixed(0),
    });
  } catch (err: any) {
    times.classificationMs = performance.now() - t2;
    times.totalMs = performance.now() - pipelineStart;
    log.error('pipeline: classification failed', err);
    return {
      status: 'failed',
      statements: [],
      validation: emptyValidation(),
      corrections: null,
      metadata: {
        fileName,
        format: textResult.metadata.format,
        extractionMethod: textResult.metadata.extractionMethod,
        processingTime: times,
        tokensUsed: 0,
        estimatedCost: 0,
        error: err.message,
      },
    };
  }

  if (classifyResult.statements.length === 0) {
    times.totalMs = performance.now() - pipelineStart;
    return {
      status: 'failed',
      statements: [],
      validation: emptyValidation(),
      corrections: null,
      metadata: {
        fileName,
        format: textResult.metadata.format,
        extractionMethod: textResult.metadata.extractionMethod,
        processingTime: times,
        tokensUsed: classifyResult.usage.promptTokens + classifyResult.usage.completionTokens,
        estimatedCost: (classifyResult.usage.promptTokens * GPT4O_INPUT_COST_PER_TOKEN)
          + (classifyResult.usage.completionTokens * GPT4O_OUTPUT_COST_PER_TOKEN),
        error: 'No financial statements found in document',
      },
    };
  }

  // ── Stage 3: Validation ────────────────────────────────────
  const t3 = performance.now();
  let validation: PipelineValidationResult;
  try {
    validation = validateExtraction(classifyResult.statements);
    times.validationMs = performance.now() - t3;
    log.info('pipeline: validation done', {
      passed: validation.overallPassed,
      errors: validation.errorCount,
      warnings: validation.warningCount,
      ms: times.validationMs.toFixed(0),
    });
  } catch (err: any) {
    // Validation crash is non-fatal — proceed with no flags
    times.validationMs = performance.now() - t3;
    log.error('pipeline: validation crashed (non-fatal)', err);
    validation = emptyValidation();
  }

  // ── Stage 4: Self-Correction (only when validation has errors) ──
  let correctionResult: SelfCorrectionResult | null = null;
  let finalStatements = classifyResult.statements;
  let finalValidation = validation;
  let correctionUsage = { promptTokens: 0, completionTokens: 0 };

  if (!validation.overallPassed && validation.flaggedItems.length > 0) {
    const t4 = performance.now();
    try {
      correctionResult = await runSelfCorrection(
        textResult.text,
        classifyResult.statements,
        validation,
      );
      finalStatements = correctionResult.correctedStatements;
      finalValidation = correctionResult.finalValidation;
      correctionUsage = correctionResult.usage;
      times.selfCorrectionMs = performance.now() - t4;
      log.info('pipeline: self-correction done', {
        attempts: correctionResult.corrections.length,
        needsManualReview: correctionResult.needsManualReview,
        promptTokens: correctionUsage.promptTokens,
        ms: times.selfCorrectionMs.toFixed(0),
      });
    } catch (err: any) {
      times.selfCorrectionMs = performance.now() - t4;
      log.error('pipeline: self-correction crashed (non-fatal)', err);
      // Keep original statements + validation if correction crashes
    }
  }

  times.totalMs = performance.now() - pipelineStart;

  // ── Token Accounting ───────────────────────────────────────
  const totalPromptTokens = classifyResult.usage.promptTokens + correctionUsage.promptTokens;
  const totalCompletionTokens = classifyResult.usage.completionTokens + correctionUsage.completionTokens;
  const totalTokens = totalPromptTokens + totalCompletionTokens;
  const estimatedCost = (totalPromptTokens * GPT4O_INPUT_COST_PER_TOKEN)
    + (totalCompletionTokens * GPT4O_OUTPUT_COST_PER_TOKEN);

  // ── Final Status ───────────────────────────────────────────
  let status: PipelineStatus;
  if (finalStatements.length === 0) {
    status = 'failed';
  } else if (finalValidation.overallPassed) {
    status = 'success';
  } else {
    status = 'partial'; // statements found but validation issues remain
  }

  log.info('pipeline: complete', {
    fileName,
    status,
    statementsFound: finalStatements.length,
    totalMs: times.totalMs.toFixed(0),
    totalTokens,
    estimatedCostUsd: estimatedCost.toFixed(4),
  });

  return {
    status,
    statements: finalStatements,
    validation: finalValidation,
    corrections: correctionResult,
    metadata: {
      fileName,
      format: textResult.metadata.format,
      extractionMethod: textResult.metadata.extractionMethod,
      processingTime: times,
      tokensUsed: totalTokens,
      estimatedCost,
    },
  };
}
