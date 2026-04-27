/**
 * Extract Node — LangGraph node for the financial extraction agent.
 *
 * Routes the file to the best extraction layer:
 *   Excel → xlsx parser → CSV text → GPT-4o classifier
 *   PDF Layer 1 → Azure Document Intelligence (if configured)
 *   PDF Layer 2 → pdf-parse text → GPT-4o classifier (text-rich)
 *   PDF Layer 3 → GPT-4o Vision (scanned/image PDFs)
 *
 * Wraps existing service functions — no extraction logic is duplicated.
 */

import { createRequire } from 'module';
import { classifyFinancials } from '../../../financialClassifier.js';
import { classifyFinancialsVision } from '../../../visionExtractor.js';
import { extractTextFromExcel, isExcelFile } from '../../../excelFinancialExtractor.js';
import { extractTablesFromPdf, isAzureConfigured } from '../../../azureDocIntelligence.js';
import { classifyExtraction } from '../../../extraction/financialClassifier.js';
import { log } from '../../../../utils/logger.js';
import type { FinancialAgentStateType } from '../state.js';
import type { ExtractionSource, AgentStep } from '../state.js';
import type { ClassifiedStatement } from '../../../financialClassifier.js';


const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/** Minimum chars of extracted text to consider "text-rich" */
const MIN_TEXT_LENGTH = 200;

/** Create a timestamped agent step */
function step(node: string, message: string, detail?: string): AgentStep {
  return { timestamp: new Date().toISOString(), node, message, detail };
}

/**
 * LangGraph Extract Node
 *
 * Reads: fileBuffer, fileName, fileType
 * Writes: rawText, extractionSource, classification, statements,
 *         overallConfidence, warnings, status, steps
 */
export async function extractNode(
  state: FinancialAgentStateType,
): Promise<Partial<FinancialAgentStateType>> {
  const steps: AgentStep[] = [];
  const { fileBuffer, fileName, fileType } = state;

  if (!fileBuffer || fileBuffer.length === 0) {
    return {
      status: 'failed',
      error: 'No file buffer provided',
      steps: [step('extract', 'Failed: no file buffer provided')],
    };
  }

  steps.push(step('extract', `Received ${fileName} (${fileType}, ${(fileBuffer.length / 1024).toFixed(0)}KB)`));

  try {
    // ── Excel Path ─────────────────────────────────────────────
    if (fileType === 'excel' || isExcelFile(null, fileName)) {
      steps.push(step('extract', 'Detected Excel file — parsing with xlsx'));
      const excelText = extractTextFromExcel(fileBuffer);

      if (!excelText || excelText.trim().length < 50) {
        return {
          status: 'failed',
          error: 'Excel file appears empty or has no readable financial data',
          steps: [...steps, step('extract', 'Failed: Excel file has no readable data')],
        };
      }

      steps.push(step('extract', `Extracted ${excelText.length} chars from Excel, classifying with GPT-4o`));
      const classifyResult = await classifyExtraction(excelText);
      const classification = classifyResult.statements.length > 0
        ? { statements: classifyResult.statements, overallConfidence: classifyResult.overallConfidence, warnings: classifyResult.warnings }
        : null;
      const extractTokens = classifyResult.usage.promptTokens + classifyResult.usage.completionTokens;
      const extractCost = (classifyResult.usage.promptTokens * 5e-6) + (classifyResult.usage.completionTokens * 15e-6);

      if (!classification || classification.statements.length === 0) {
        return {
          rawText: excelText,
          extractionSource: 'gpt4o',
          classification,
          statements: [],
          overallConfidence: 0,
          warnings: classification?.warnings ?? ['No financial data found in Excel file'],
          status: 'validating',
          tokensUsed: extractTokens,
          estimatedCostUsd: extractCost,
          steps: [...steps, step('extract', 'No financial statements found in Excel')],
        };
      }

      const stmtTypes = classification.statements.map((s: ClassifiedStatement) => s.statementType).join(', ');
      const totalPeriods = classification.statements.reduce((sum: number, s: ClassifiedStatement) => sum + s.periods.length, 0);
      steps.push(step('extract', `Found: ${stmtTypes} (${totalPeriods} periods, confidence ${classification.overallConfidence}%)`));

      return {
        rawText: excelText,
        extractionSource: 'gpt4o',
        classification,
        statements: classification.statements,
        overallConfidence: classification.overallConfidence,
        warnings: classification.warnings,
        status: 'validating',
        tokensUsed: extractTokens,
        estimatedCostUsd: extractCost,
        steps,
      };
    }

    // ── PDF Paths ──────────────────────────────────────────────

    // Layer 1: Azure Document Intelligence
    if (isAzureConfigured()) {
      steps.push(step('extract', 'Trying Azure Document Intelligence (Layer 1)'));
      try {
        const azureResult = await extractTablesFromPdf(fileBuffer);
        if (azureResult && azureResult.text.trim().length > 50) {
          steps.push(step('extract', `Azure extracted ${azureResult.tableCount} tables from ${azureResult.pageCount} pages`));
          steps.push(step('extract', 'Classifying Azure output with GPT-4o'));

          const classification = await classifyFinancials(azureResult.text);
          if (classification && classification.statements.length > 0) {
            const stmtTypes = classification.statements.map(s => s.statementType).join(', ');
            const totalPeriods = classification.statements.reduce((sum, s) => sum + s.periods.length, 0);
            steps.push(step('extract', `Found: ${stmtTypes} (${totalPeriods} periods, confidence ${classification.overallConfidence}%)`));

            return {
              rawText: azureResult.text,
              extractionSource: 'azure',
              classification,
              statements: classification.statements,
              overallConfidence: classification.overallConfidence,
              warnings: classification.warnings,
              status: 'validating',
              steps,
            };
          }
          steps.push(step('extract', 'Azure returned tables but classifier found no financials — falling through'));
        } else {
          steps.push(step('extract', 'Azure returned no tables — falling through'));
        }
      } catch (err) {
        steps.push(step('extract', 'Azure failed — falling through to text extraction', String(err)));
      }
    }

    // Layer 2: pdf-parse text → GPT-4o
    steps.push(step('extract', 'Extracting text with pdf-parse (Layer 2)'));
    let pdfText: string | null = null;
    try {
      const parsed = await pdfParse(fileBuffer);
      pdfText = parsed.text || null;
    } catch (err) {
      steps.push(step('extract', 'pdf-parse failed', String(err)));
    }

    if (pdfText && pdfText.trim().length >= MIN_TEXT_LENGTH) {
      steps.push(step('extract', `Extracted ${pdfText.length} chars — classifying with GPT-4o`));
      const pdfClassifyResult = await classifyExtraction(pdfText);
      const classification = pdfClassifyResult.statements.length > 0
        ? { statements: pdfClassifyResult.statements, overallConfidence: pdfClassifyResult.overallConfidence, warnings: pdfClassifyResult.warnings }
        : null;
      const pdfTokens = pdfClassifyResult.usage.promptTokens + pdfClassifyResult.usage.completionTokens;
      const pdfCost = (pdfClassifyResult.usage.promptTokens * 5e-6) + (pdfClassifyResult.usage.completionTokens * 15e-6);

      if (classification && classification.statements.length > 0) {
        const stmtTypes = classification.statements.map((s: ClassifiedStatement) => s.statementType).join(', ');
        const totalPeriods = classification.statements.reduce((sum: number, s: ClassifiedStatement) => sum + s.periods.length, 0);
        steps.push(step('extract', `Found: ${stmtTypes} (${totalPeriods} periods, confidence ${classification.overallConfidence}%)`));

        return {
          rawText: pdfText,
          extractionSource: 'gpt4o',
          classification,
          statements: classification.statements,
          overallConfidence: classification.overallConfidence,
          warnings: classification.warnings,
          status: 'validating',
          tokensUsed: pdfTokens,
          estimatedCostUsd: pdfCost,
          steps,
        };
      }

      steps.push(step('extract', 'Text extracted but no financial statements found — trying Vision'));
    } else {
      steps.push(step('extract', `Text too sparse (${pdfText?.trim().length ?? 0} chars) — trying Vision`));
    }

    // Layer 3: GPT-4o Vision (scanned / image-only PDFs)
    steps.push(step('extract', 'Switching to GPT-4o Vision (Layer 3)'));
    const visionClassification = await classifyFinancialsVision(fileBuffer, fileName || 'document.pdf');

    if (!visionClassification || visionClassification.statements.length === 0) {
      return {
        rawText: pdfText ?? '',
        extractionSource: 'vision',
        classification: visionClassification,
        statements: [],
        overallConfidence: 0,
        warnings: visionClassification?.warnings ?? ['Could not extract financial data — document may be encrypted or unsupported'],
        status: 'validating',
        steps: [...steps, step('extract', 'Vision extraction found no financial statements')],
      };
    }

    const stmtTypes = visionClassification.statements.map(s => s.statementType).join(', ');
    const totalPeriods = visionClassification.statements.reduce((sum, s) => sum + s.periods.length, 0);
    steps.push(step('extract', `Vision found: ${stmtTypes} (${totalPeriods} periods, confidence ${visionClassification.overallConfidence}%)`));

    return {
      rawText: '',
      extractionSource: 'vision',
      classification: visionClassification,
      statements: visionClassification.statements,
      overallConfidence: visionClassification.overallConfidence,
      warnings: visionClassification.warnings,
      status: 'validating',
      steps,
    };
  } catch (err) {
    log.error('Extract node: unexpected error', err);
    return {
      status: 'failed',
      error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      steps: [...steps, step('extract', 'Unexpected error', String(err))],
    };
  }
}
