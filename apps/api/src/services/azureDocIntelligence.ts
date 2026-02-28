/**
 * azureDocIntelligence.ts — Layer 1: Azure Document Intelligence table extraction.
 *
 * Sends a PDF buffer to Azure's prebuilt-layout model, which excels at extracting
 * structured tables from complex financial PDFs (dense multi-column CIM layouts,
 * page-spanning tables, scanned-but-OCR'd documents).
 *
 * Output: table data as CSV-like text ready for classifyFinancials() (GPT-4o Layer 2).
 * Same interface as extractTextFromExcel() — the pipeline is uniform regardless of source.
 *
 * Activated when AZURE_DOC_INTEL_ENDPOINT + AZURE_DOC_INTEL_KEY are set in env.
 * Falls back gracefully (returns null) when unconfigured or on error.
 */

import { createRequire } from 'module';
import { log } from '../utils/logger.js';

const require = createRequire(import.meta.url);

// ─── Types ────────────────────────────────────────────────────

export interface AzureExtractionResult {
  /** Formatted table text ready for GPT-4o classification */
  text: string;
  /** Number of tables extracted */
  tableCount: number;
  /** Number of pages analysed */
  pageCount: number;
}

// ─── Client singleton ─────────────────────────────────────────

let _client: any = null;

function getClient(): any {
  if (_client) return _client;

  const endpoint = process.env.AZURE_DOC_INTEL_ENDPOINT;
  const key = process.env.AZURE_DOC_INTEL_KEY;

  if (!endpoint || !key) return null;

  try {
    const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
    _client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
    log.info('Azure Doc Intelligence: client initialised', { endpoint });
    return _client;
  } catch (err: any) {
    log.error('Azure Doc Intelligence: failed to initialise client', err?.message);
    return null;
  }
}

// ─── Public helpers ───────────────────────────────────────────

/** True when AZURE_DOC_INTEL_ENDPOINT and AZURE_DOC_INTEL_KEY are both set */
export function isAzureConfigured(): boolean {
  return !!(process.env.AZURE_DOC_INTEL_ENDPOINT && process.env.AZURE_DOC_INTEL_KEY);
}

// ─── Main export ──────────────────────────────────────────────

/**
 * Extract financial tables from a PDF buffer using Azure prebuilt-layout.
 *
 * The prebuilt-layout model:
 * - Identifies table boundaries across page breaks
 * - Returns row/column cell structure with content + bounding boxes
 * - Handles scanned PDFs (built-in OCR layer)
 *
 * @returns Structured text (one CSV block per table) or null on failure.
 */
export async function extractTablesFromPdf(buffer: Buffer): Promise<AzureExtractionResult | null> {
  if (!isAzureConfigured()) return null;

  const client = getClient();
  if (!client) return null;

  log.info('Azure Doc Intelligence: starting table extraction', {
    bufferSizeKB: Math.round(buffer.length / 1024),
  });

  try {
    // Kick off analysis
    const poller = await client.beginAnalyzeDocument('prebuilt-layout', buffer, {
      contentType: 'application/pdf',
    });

    // Poll until done (Azure typically takes 5-30s for a CIM)
    const result = await poller.pollUntilDone();

    if (!result) {
      log.warn('Azure Doc Intelligence: no result returned');
      return null;
    }

    const tables = result.tables ?? [];
    const pageCount = (result.pages ?? []).length;

    log.info('Azure Doc Intelligence: analysis complete', {
      tableCount: tables.length,
      pageCount,
    });

    if (tables.length === 0) {
      log.warn('Azure Doc Intelligence: no tables found in document');
      return null;
    }

    // ── Convert each table to CSV ──────────────────────────────
    const textParts: string[] = [];

    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const rowCount = table.rowCount ?? 0;
      const colCount = table.columnCount ?? 0;

      if (rowCount === 0 || colCount === 0) continue;

      // Build 2-D grid (cells may be merged — fill each spanned position)
      const grid: string[][] = Array.from(
        { length: rowCount },
        () => Array<string>(colCount).fill(''),
      );

      for (const cell of table.cells ?? []) {
        const r = cell.rowIndex ?? 0;
        const c = cell.columnIndex ?? 0;
        const content = (cell.content ?? '').trim().replace(/\n/g, ' ');

        // Fill primary cell
        if (r < rowCount && c < colCount) {
          grid[r][c] = content;
        }

        // Fill column-spanned cells with the same content (helps GPT-4o align headers)
        const rowSpan = cell.rowSpan ?? 1;
        const colSpan = cell.columnSpan ?? 1;
        for (let dr = 0; dr < rowSpan; dr++) {
          for (let dc = 0; dc < colSpan; dc++) {
            if (dr === 0 && dc === 0) continue;
            const tr = r + dr;
            const tc = c + dc;
            if (tr < rowCount && tc < colCount && grid[tr][tc] === '') {
              grid[tr][tc] = content;
            }
          }
        }
      }

      // Render grid to CSV
      const csv = grid
        .map(row => row.map(cell => {
          // Quote cells that contain commas or quotes
          if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(','))
        .filter(line => line.replace(/,/g, '').trim().length > 0)
        .join('\n');

      if (csv.trim().length > 10) {
        textParts.push(`[Table ${i + 1}]\n${csv}`);
      }
    }

    if (textParts.length === 0) {
      log.warn('Azure Doc Intelligence: all tables were empty after conversion');
      return null;
    }

    const text = textParts.join('\n\n');

    log.info('Azure Doc Intelligence: text assembled', {
      tablesConverted: textParts.length,
      totalChars: text.length,
    });

    return {
      text,
      tableCount: textParts.length,
      pageCount,
    };
  } catch (err: any) {
    log.error('Azure Doc Intelligence: extraction failed', {
      message: err?.message,
      code: err?.code,
      statusCode: err?.statusCode,
    });
    return null;
  }
}
