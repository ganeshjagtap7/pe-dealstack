/**
 * excelToMarkdown.ts
 *
 * Converts an Excel workbook into LLM-optimized Markdown tables.
 * Reuses sheet-scoring logic from excelFinancialExtractor.ts.
 * Output is stored in Document.extractedText for RAG + AI chat context.
 */

import XLSX from 'xlsx';
import { log } from '../utils/logger.js';
import { scoreSheet, detectUnitScale, SKIP_PATTERNS } from './excelFinancialExtractor.js';

/**
 * Convert an Excel buffer to Markdown tables.
 * Each relevant sheet becomes a ## heading with a Markdown table.
 * Returns null if no meaningful content found.
 */
export function excelToMarkdown(buffer: Buffer): string | null {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: true,
    });

    if (!workbook.SheetNames.length) {
      log.warn('excelToMarkdown: workbook has no sheets');
      return null;
    }

    // Score and sort sheets by financial relevance
    const scoredSheets = workbook.SheetNames
      .map(name => ({ name, score: scoreSheet(name) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    // Fallback: if no sheets scored, use all non-junk sheets
    const sheetsToProcess = scoredSheets.length > 0
      ? scoredSheets
      : workbook.SheetNames
          .filter(name => !SKIP_PATTERNS.some(re => re.test(name.trim())))
          .map(name => ({ name, score: 10 }));

    const sections: string[] = [];

    for (const { name } of sheetsToProcess) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;

      const md = sheetToMarkdownTable(sheet, name);
      if (md) sections.push(md);
    }

    if (sections.length === 0) {
      log.warn('excelToMarkdown: no meaningful content found');
      return null;
    }

    const combined = sections.join('\n\n');
    log.info('excelToMarkdown: converted', {
      sheets: sections.length,
      chars: combined.length,
    });

    return combined;
  } catch (err) {
    log.error('excelToMarkdown: failed to parse workbook', err);
    return null;
  }
}

/**
 * Convert a single sheet to a Markdown table with a heading.
 * Returns null if the sheet has no meaningful data.
 */
function sheetToMarkdownTable(sheet: XLSX.WorkSheet, sheetName: string): string | null {
  // Get rows as arrays (header: 1 = array-of-arrays mode)
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  // Filter out empty/formatting rows
  const cleanRows = rows.filter(row => {
    const joined = row.map(String).join('').trim();
    if (joined.length < 2) return false;
    if (/^[-_=\s]+$/.test(joined)) return false;
    return true;
  });

  if (cleanRows.length < 2) return null; // need header + at least 1 data row

  // Detect unit scale
  const unitHint = detectUnitScale(sheet);

  // Find max column count for consistent table width
  const maxCols = Math.max(...cleanRows.map(r => r.length));

  // First non-empty row = header
  const headerRow = cleanRows[0];
  const dataRows = cleanRows.slice(1);

  // Pad rows to maxCols and escape pipe characters
  const escapeCell = (val: any): string => {
    if (val === null || val === undefined || val === '') return '—';
    return String(val).replace(/\|/g, '\\|').trim();
  };

  const padRow = (row: any[]): string[] => {
    const padded = Array(maxCols).fill('');
    for (let i = 0; i < Math.min(row.length, maxCols); i++) {
      padded[i] = escapeCell(row[i]);
    }
    return padded;
  };

  const header = `| ${padRow(headerRow).join(' | ')} |`;
  const divider = `|${padRow(headerRow).map(() => '---').join('|')}|`;
  const body = dataRows
    .map(row => `| ${padRow(row).join(' | ')} |`)
    .join('\n');

  let section = `## Sheet: ${sheetName}`;
  if (unitHint) section += `\n${unitHint}`;
  section += `\n\n${header}\n${divider}\n${body}`;

  return section;
}
