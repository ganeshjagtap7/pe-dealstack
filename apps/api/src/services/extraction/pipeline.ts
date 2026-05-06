import { performance } from 'perf_hooks';
import { extractText } from './textExtractor.js';
import { classifyExtraction } from './financialClassifier.js';
import { validateExtraction } from './validator.js';
import { runSelfCorrection } from './selfCorrector.js';
import { estimateOpenAICostUsd } from '../../utils/constants.js';
import type { ClassifiedStatement } from './financialClassifier.js';
import type { PipelineValidationResult } from './validator.js';
import type { SelfCorrectionResult } from './selfCorrector.js';
import { log } from '../../utils/logger.js';

interface ProcessingTime {
  textExtraction: number;
  classification: number;
  validation: number;
  selfCorrection: number;
  total: number;
}

export interface PipelineResult {
  status: 'success' | 'partial' | 'failed';
  statements: ClassifiedStatement[];
  validation: PipelineValidationResult;
  corrections: SelfCorrectionResult | null;
  metadata: {
    fileName: string;
    format: string;
    extractionMethod: string;
    processingTime: ProcessingTime;
    tokensUsed: number;
    estimatedCost: number;
    error?: string;
  };
}

const EMPTY_VALIDATION: PipelineValidationResult = {
  checks: [],
  errorCount: 0,
  warningCount: 0,
  infoCount: 0,
  isValid: true,
  flaggedItems: [],
  overallConfidence: 0,
};

export async function runExtractionPipeline(
  filePath: string,
  mimeType: string,
  fileName: string,
): Promise<PipelineResult> {
  const totalStart = performance.now();
  const timing: ProcessingTime = { textExtraction: 0, classification: 0, validation: 0, selfCorrection: 0, total: 0 };

  let format = 'unknown';
  let extractionMethod = 'unknown';

  // Stage 1: Text Extraction
  const t1Start = performance.now();
  let extractionResult: Awaited<ReturnType<typeof extractText>>;
  try {
    extractionResult = await extractText(filePath, mimeType);
    timing.textExtraction = performance.now() - t1Start;
    format = extractionResult.metadata.format;
    extractionMethod = extractionResult.metadata.extractionMethod;
  } catch (err: any) {
    timing.textExtraction = performance.now() - t1Start;
    timing.total = performance.now() - totalStart;
    log.error('Pipeline: text extraction threw', err);
    throw err;
  }

  // Stage 2: Classification
  const t2Start = performance.now();
  const classifyResult = await classifyExtraction(extractionResult.text);
  timing.classification = performance.now() - t2Start;

  if (!classifyResult.statements || classifyResult.statements.length === 0) {
    timing.total = performance.now() - totalStart;
    return {
      status: 'failed',
      statements: [],
      validation: EMPTY_VALIDATION,
      corrections: null,
      metadata: {
        fileName,
        format,
        extractionMethod,
        processingTime: timing,
        tokensUsed: classifyResult.usage.promptTokens + classifyResult.usage.completionTokens,
        estimatedCost: estimateOpenAICostUsd('gpt-4o', classifyResult.usage.promptTokens, classifyResult.usage.completionTokens),
        error: 'No financial statements found',
      },
    };
  }

  // Stage 3: Validation
  const t3Start = performance.now();
  let validation = validateExtraction(classifyResult.statements);
  timing.validation = performance.now() - t3Start;

  // Stage 4: Self-correction (only if validation has flagged items and confidence is low)
  let corrections: SelfCorrectionResult | null = null;
  const t4Start = performance.now();

  const needsCorrection = !validation.isValid || (validation.overallConfidence < 95 && validation.warningCount > 0);

  if (needsCorrection) {
    corrections = await runSelfCorrection(extractionResult.text, classifyResult.statements, validation);
    validation = corrections.finalValidation;
  }
  timing.selfCorrection = performance.now() - t4Start;
  timing.total = performance.now() - totalStart;

  const classifyTokens = classifyResult.usage.promptTokens + classifyResult.usage.completionTokens;
  const correctionTokens = corrections?.usage
    ? corrections.usage.promptTokens + corrections.usage.completionTokens
    : 0;
  const tokensUsed = classifyTokens + correctionTokens;

  const estimatedCost = estimateOpenAICostUsd('gpt-4o',
    classifyResult.usage.promptTokens + (corrections?.usage.promptTokens ?? 0),
    classifyResult.usage.completionTokens + (corrections?.usage.completionTokens ?? 0),
  );

  const finalStatements = corrections?.correctedStatements ?? classifyResult.statements;
  const status = validation.isValid ? 'success' : 'partial';

  return {
    status,
    statements: finalStatements,
    validation,
    corrections,
    metadata: {
      fileName,
      format,
      extractionMethod,
      processingTime: timing,
      tokensUsed,
      estimatedCost,
    },
  };
}

/**
 * Save pipeline results to Supabase
 */
export async function savePipelineResults(
  supabase: any,
  dealId: string,
  documentId: string,
  result: PipelineResult,
): Promise<{ statementIds: string[] }> {
  const statementIds: string[] = [];

  // 1. Delete old statements for this document if any to avoid unique constraint violations
  await supabase
    .from('FinancialStatement')
    .delete()
    .eq('dealId', dealId)
    .eq('documentId', documentId);

  // 2. Insert new statements
  for (const stmt of result.statements) {
    for (const period of stmt.periods) {
      // Flatten lineItems array into a key-value record for DB compatibility
      const flatLineItems: Record<string, number | null> = {};
      if (Array.isArray(period.lineItems)) {
        for (const item of period.lineItems) {
          if (item && typeof item === 'object' && 'name' in item) {
            flatLineItems[item.name] = item.value;
          }
        }
      }

      const { data, error } = await supabase
        .from('FinancialStatement')
        .insert({
          dealId,
          documentId,
          statementType: stmt.statementType,
          period: period.period,
          periodType: period.periodType,
          lineItems: flatLineItems,
          currency: stmt.currency,
          unitScale: stmt.unitScale,
          extractionConfidence: period.confidence,
          extractionSource: result.metadata.extractionMethod,
          isActive: true,
          extractedAt: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        log.error('Pipeline: failed to save statement', error);
      } else if (data) {
        statementIds.push(data.id);
      }
    }
  }

  // 3. Update document metadata
  const summary = result.statements.map(s =>
    `${s.statementType}: ${s.periods.length} periods (${s.currency})`
  ).join(', ');

  await supabase
    .from('Document')
    .update({
      extractedData: {
        statements: result.statements,
        validation: result.validation,
        metadata: result.metadata,
      },
      confidence: result.validation.overallConfidence / 100,
      aiSummary: summary,
      aiAnalyzedAt: new Date().toISOString(),
      extractionStatus: result.status === 'success' ? 'completed' : 'partial',
    })
    .eq('id', documentId);

  return { statementIds };
}
