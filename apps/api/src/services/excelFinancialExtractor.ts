/**
 * excelFinancialExtractor.ts
 *
 * Converts an Excel workbook (.xlsx / .xls / .xlsm) into structured text
 * that can be fed directly into classifyFinancials() (GPT-4o classifier).
 *
 * Strategy: convert each sheet to CSV — GPT-4o reads tabular text well.
 * Sheets are prefixed with their name so the classifier can identify
 * "Income Statement", "P&L", "Balance Sheet", etc. by sheet name.
 */

import XLSX from 'xlsx';
import { log } from '../utils/logger.js';

// Recognised financial sheet name patterns (case-insensitive)
const FINANCIAL_SHEET_PATTERNS = [
  /income/i,
  /p\s*[&+]\s*l/i,
  /profit/i,
  /revenue/i,
  /earnings/i,
  /ebitda/i,
  /balance\s*sheet/i,
  /bs/i,
  /cash\s*flow/i,
  /cfs/i,
  /financial/i,
  /summary/i,
  /model/i,
  /projections?/i,
  /forecast/i,
  /lbo/i,
  /kpi/i,
];

function isFinancialSheet(name: string): boolean {
  return FINANCIAL_SHEET_PATTERNS.some(re => re.test(name));
}

/**
 * Extract text from an Excel workbook buffer.
 * Returns a text blob suitable for classifyFinancials().
 * Prioritises sheets whose names look financial; falls back to all sheets.
 */
export function extractTextFromExcel(buffer: Buffer): string | null {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,   // parse date cells
      cellNF: false,
      cellText: true,    // include formatted text
    });

    if (!workbook.SheetNames.length) {
      log.warn('Excel extractor: workbook has no sheets');
      return null;
    }

    // Prefer financial-looking sheets; fall back to all if none match
    const financialSheets = workbook.SheetNames.filter(isFinancialSheet);
    const sheetsToProcess = financialSheets.length > 0
      ? financialSheets
      : workbook.SheetNames;

    log.info('Excel extractor: processing sheets', {
      total: workbook.SheetNames.length,
      financial: financialSheets.length,
      processing: sheetsToProcess,
    });

    const textParts: string[] = [];

    for (const sheetName of sheetsToProcess) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;

      // Convert to CSV — preserves grid structure for GPT-4o
      const csv = XLSX.utils.sheet_to_csv(sheet, {
        blankrows: false,
        strip: true,   // strip trailing whitespace
      });

      const meaningful = csv.replace(/,+/g, '').trim();
      if (meaningful.length < 20) continue; // empty sheet

      textParts.push(`[Sheet: ${sheetName}]\n${csv}`);
    }

    if (textParts.length === 0) {
      log.warn('Excel extractor: no meaningful content found');
      return null;
    }

    const combined = textParts.join('\n\n');

    log.info('Excel extractor: text extracted', {
      sheets: textParts.length,
      chars: combined.length,
    });

    return combined;
  } catch (err) {
    log.error('Excel extractor: failed to parse workbook', err);
    return null;
  }
}

/** Returns true if the MIME type or filename looks like an Excel file */
export function isExcelFile(mimeType?: string | null, filename?: string | null): boolean {
  if (mimeType) {
    if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return true;
    }
  }
  if (filename) {
    return /\.(xlsx|xls|xlsm|xlsb)$/i.test(filename);
  }
  return false;
}
