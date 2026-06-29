/**
 * Extract Node — LangGraph node for the financial extraction agent.
 *
 * Routes the file to the best extraction layer:
 *   Excel → xlsx parser → CSV text → AI classifier (MODEL_CLASSIFICATION)
 *   PDF Layer 1 → LlamaParse structured markdown (if configured)
 *   PDF Layer 2 → pdf-parse text → AI classifier (MODEL_CLASSIFICATION)
 *   PDF Layer 3 → GPT-4.1 Vision (scanned/image PDFs)
 *
 * Wraps existing service functions — no extraction logic is duplicated.
 */

import { createRequire } from 'module';
import { classifyFinancialsCrossVerified as classifyFinancials } from '../../../financialCrossVerify.js';
import { classifyFinancialsVision } from '../../../visionExtractor.js';
import { chunkDocument, mergeExtractionResults } from '../../../documentChunker.js';
import type { ClassificationResult } from '../../../documentChunker.js';
import {
  extractSheetsFromExcel,
  isExcelFile,
} from '../../../excelFinancialExtractor.js';
import { parseWithLlama, isLlamaParseEnabled } from '../../../llamaParse.js';
import { log } from '../../../../utils/logger.js';
import type { FinancialAgentStateType } from '../state.js';
import type { ExtractionSource, AgentStep } from '../state.js';
import { CHUNK_THRESHOLD, MAX_CHUNK_SIZE, MAX_CHUNKS, MAX_TEXT_LENGTH, MIN_TEXT_LENGTH } from '../config.js';
import { mapWithConcurrencyLimit } from '../../../../utils/limitConcurrency.js';

/** Bounded fan-out for per-sheet classifyFinancials() calls. Three is the
 *  same cap the multi-doc loop enforces (commit b9aea92) — keeps the
 *  total in-flight LLM requests under the OpenAI / Anthropic per-key
 *  rate limits whether one workbook with three sheets or three docs each
 *  with one sheet end up firing simultaneously. */
const EXCEL_SHEET_CONCURRENCY = 3;

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

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

      // Phase 3 P1: per-sheet chunked classification.
      //
      // BEFORE: extractTextFromExcel concatenated every sheet into one
      // blob; classifyFinancials silently truncated past
      // MAX_TEXT_LENGTH (120K). On real CIM models the second/third
      // sheet (Cash Flow, Balance Sheet) tipped the blob over the cap
      // and the LLM saw only the income statement, returning 1
      // statement type instead of 3.
      //
      // NOW: each financially-scored sheet is its own classifier call,
      // run in parallel with bounded concurrency = 3 (matches the
      // multi-doc cap from commit b9aea92). Per-sheet results merge via
      // the same `mergeExtractionResults` the PDF chunker uses, so
      // downstream nodes can't tell the difference between a small
      // workbook (one call, one sheet) and a deep model (N calls,
      // merged). The Phase-3 P3+P4 structure hints (period headers,
      // line-item rows) travel inline inside each sheet's text — see
      // `extractSheetsFromExcel` — so the classifier prompt still gets
      // the spatial anchors it expects.
      const sheets = extractSheetsFromExcel(fileBuffer);

      if (sheets.length === 0) {
        return {
          status: 'failed',
          error: 'Excel file appears empty or has no readable financial data',
          steps: [...steps, step('extract', 'Failed: Excel file has no readable data')],
        };
      }

      // Reconstruct the legacy combined-text view for state.rawText so
      // downstream verify / cross-verify nodes that read raw source
      // continue to see the full workbook (not just one sheet). Joined
      // with the same blank-line separator extractTextFromExcel uses.
      const excelText = sheets.map(s => s.text).join('\n\n');

      // Sanity check — the per-sheet pipeline guarantees length ≥ 20
      // chars per sheet, but cumulative still needs to clear the same
      // 50-char threshold the old single-blob path enforced.
      if (excelText.trim().length < 50) {
        return {
          status: 'failed',
          error: 'Excel file appears empty or has no readable financial data',
          steps: [...steps, step('extract', 'Failed: Excel file has no readable data')],
        };
      }

      steps.push(step(
        'extract',
        `Extracted ${sheets.length} sheet${sheets.length === 1 ? '' : 's'} (${excelText.length} chars total) — classifying ${sheets.length === 1 ? 'sheet' : `up to ${EXCEL_SHEET_CONCURRENCY} sheets in parallel`}`,
      ));

      // Per-sheet classification with bounded concurrency. Each sheet
      // is independent — its text already carries the unit hint, the
      // structure hints, and the [Sheet:] header. A sheet exceeding
      // MAX_TEXT_LENGTH (rare but possible for deep monthly grids on a
      // single sheet) falls back to documentChunker so we still don't
      // silently truncate.
      const settled = await mapWithConcurrencyLimit(sheets, EXCEL_SHEET_CONCURRENCY, async (sheet, i) => {
        const label = `${sheet.name} (score ${sheet.score})`;

        if (sheet.text.length <= MAX_TEXT_LENGTH) {
          steps.push(step('extract', `Classifying sheet ${i + 1}/${sheets.length}: ${label}`));
          return classifyFinancials(sheet.text);
        }

        // Fallback: a single sheet larger than MAX_TEXT_LENGTH. Use
        // the existing PDF chunker on this sheet's text (it splits at
        // section headers and merges per-chunk results). Caps at
        // MAX_CHUNKS to bound cost — the failure mode here is
        // "classifier sees the top of a deep monthly grid" which is
        // strictly better than the old "truncate after ~120K".
        const chunks = chunkDocument(sheet.text, MAX_CHUNK_SIZE);
        steps.push(step(
          'extract',
          `Sheet ${i + 1}/${sheets.length} ${label} exceeds MAX_TEXT_LENGTH — chunking into ${chunks.length} pieces`,
        ));
        const chunkResults = await Promise.all(
          chunks.slice(0, MAX_CHUNKS).map(async (chunk, ci) => {
            try {
              return await classifyFinancials(chunk.text);
            } catch (err) {
              steps.push(step('extract', `Sheet ${label} chunk ${ci + 1} failed`, String(err)));
              return null;
            }
          }),
        );
        const validChunks = chunkResults.filter((r): r is ClassificationResult => r !== null);
        if (validChunks.length === 0) return null;
        return mergeExtractionResults(validChunks);
      });

      const validResults: ClassificationResult[] = [];
      for (let i = 0; i < settled.length; i++) {
        const r = settled[i];
        const sheetLabel = sheets[i].name;
        if (r.status === 'fulfilled' && r.value && r.value.statements.length > 0) {
          validResults.push(r.value);
        } else if (r.status === 'rejected') {
          steps.push(step('extract', `Sheet ${sheetLabel} extraction threw — skipping`, String(r.reason)));
        } else if (r.status === 'fulfilled' && (!r.value || r.value.statements.length === 0)) {
          steps.push(step('extract', `Sheet ${sheetLabel} returned no financial statements`));
        }
      }

      if (validResults.length === 0) {
        return {
          rawText: excelText,
          extractionSource: 'gpt4o',
          classification: null,
          statements: [],
          overallConfidence: 0,
          warnings: ['No financial data found in Excel file'],
          status: 'validating',
          steps: [...steps, step('extract', 'No financial statements found across any Excel sheet')],
        };
      }

      // Single-sheet shortcut: skip merge overhead. Multi-sheet path
      // collapses overlapping (statementType, period) pairs via the
      // same per-period merge logic the PDF chunker uses.
      const classification = validResults.length === 1
        ? validResults[0]
        : mergeExtractionResults(validResults);

      const stmtTypes = classification.statements.map(s => s.statementType).join(', ');
      const totalPeriods = classification.statements.reduce((sum, s) => sum + s.periods.length, 0);
      steps.push(step(
        'extract',
        `Merged ${validResults.length} sheet result${validResults.length === 1 ? '' : 's'}: ${stmtTypes} (${totalPeriods} periods, confidence ${classification.overallConfidence}%)`,
      ));

      return {
        rawText: excelText,
        extractionSource: 'gpt4o',
        classification,
        statements: classification.statements,
        overallConfidence: classification.overallConfidence,
        warnings: classification.warnings,
        status: 'validating',
        steps,
      };
    }

    // ── PDF Paths ──────────────────────────────────────────────

    // Layer 1: LlamaParse (structured markdown extraction)
    if (isLlamaParseEnabled()) {
      steps.push(step('extract', 'Trying LlamaParse (Layer 1) — structured markdown extraction'));
      try {
        const llamaResult = await parseWithLlama(fileBuffer, fileName || 'document.pdf');
        if (llamaResult && llamaResult.text.trim().length > MIN_TEXT_LENGTH) {
          steps.push(step('extract', `LlamaParse extracted ${llamaResult.text.length} chars from ${llamaResult.pages} pages`));

          // Use the clean markdown text for classification
          let llamaClassification: ClassificationResult | null = null;

          if (llamaResult.text.length > CHUNK_THRESHOLD) {
            const chunks = chunkDocument(llamaResult.text, MAX_CHUNK_SIZE);
            steps.push(step('extract', `LlamaParse text split into ${chunks.length} chunks`));
            const chunkResults = await Promise.all(
              chunks.slice(0, MAX_CHUNKS).map(async (chunk, i) => {
                try {
                  return await classifyFinancials(chunk.text);
                } catch (err) {
                  steps.push(step('extract', `LlamaParse chunk ${i + 1} failed`, String(err)));
                  return null;
                }
              })
            );
            const validResults = chunkResults.filter((r): r is ClassificationResult => r !== null);
            if (validResults.length > 0) {
              llamaClassification = mergeExtractionResults(validResults);
            }
          } else {
            llamaClassification = await classifyFinancials(llamaResult.text);
          }

          if (llamaClassification && llamaClassification.statements.length > 0) {
            const stmtTypes = llamaClassification.statements.map(s => s.statementType).join(', ');
            const totalPeriods = llamaClassification.statements.reduce((sum, s) => sum + s.periods.length, 0);
            steps.push(step('extract', `Found: ${stmtTypes} (${totalPeriods} periods, confidence ${llamaClassification.overallConfidence}%)`));

            return {
              rawText: llamaResult.text,
              extractionSource: 'gpt4o',
              classification: llamaClassification,
              statements: llamaClassification.statements,
              overallConfidence: llamaClassification.overallConfidence,
              warnings: llamaClassification.warnings,
              status: 'validating',
              steps,
            };
          }
          steps.push(step('extract', 'LlamaParse returned text but no financials found — falling through to pdf-parse'));
        } else {
          steps.push(step('extract', 'LlamaParse returned no useful text — falling through'));
        }
      } catch (err) {
        steps.push(step('extract', 'LlamaParse failed — falling through to pdf-parse', String(err)));
      }
    }

    // Layer 2: pdf-parse text → AI classifier
    steps.push(step('extract', 'Extracting text with pdf-parse (Layer 2)'));
    let pdfText: string | null = null;
    let textClassification: ClassificationResult | null = null;
    try {
      const parsed = await pdfParse(fileBuffer);
      pdfText = parsed.text || null;
    } catch (err) {
      steps.push(step('extract', 'pdf-parse failed', String(err)));
    }

    if (pdfText && pdfText.trim().length >= MIN_TEXT_LENGTH) {
      steps.push(step('extract', `Extracted ${pdfText.length} chars — classifying with AI`));

      if (pdfText.length > CHUNK_THRESHOLD) {
        const chunks = chunkDocument(pdfText, MAX_CHUNK_SIZE);
        steps.push(step('extract', `Document is ${pdfText.length} chars — split into ${chunks.length} chunks`));

        const chunkResults = await Promise.all(
          chunks.slice(0, MAX_CHUNKS).map(async (chunk, i) => {
            try {
              steps.push(step('extract', `Extracting from chunk ${i + 1}/${Math.min(chunks.length, MAX_CHUNKS)} (relevance: ${chunk.relevanceScore})`));
              return await classifyFinancials(chunk.text);
            } catch (err) {
              steps.push(step('extract', `Chunk ${i + 1} extraction failed`, String(err)));
              return null;
            }
          })
        );

        const validResults = chunkResults.filter((r): r is ClassificationResult => r !== null);
        if (validResults.length > 0) {
          textClassification = mergeExtractionResults(validResults);
          steps.push(step('extract', `Merged ${validResults.length} chunk results`));
        }
      } else {
        textClassification = await classifyFinancials(pdfText);
      }

      const classification = textClassification;

      if (classification && classification.statements.length > 0) {
        const stmtTypes = classification.statements.map(s => s.statementType).join(', ');
        const totalPeriods = classification.statements.reduce((sum, s) => sum + s.periods.length, 0);
        steps.push(step('extract', `Found: ${stmtTypes} (${totalPeriods} periods, confidence ${classification.overallConfidence}%)`));

        return {
          rawText: pdfText,
          extractionSource: 'gpt4o',
          classification,
          statements: classification.statements,
          overallConfidence: classification.overallConfidence,
          warnings: classification.warnings,
          status: 'validating',
          steps,
        };
      }

      steps.push(step('extract', 'Text extracted but no financial statements found — trying Vision'));
    } else {
      steps.push(step('extract', `Text too sparse (${pdfText?.trim().length ?? 0} chars) — trying Vision`));
    }

    // Layer 3: AI Vision (scanned / image-only PDFs)
    steps.push(step('extract', 'Switching to AI Vision (Layer 3)'));
    const visionClassification = await classifyFinancialsVision(
      fileBuffer,
      fileName || 'document.pdf',
      textClassification?.statements?.[0]?.currency,
    );

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
