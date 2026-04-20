/**
 * excelFinancialExtractor.ts
 *
 * Converts an Excel workbook (.xlsx / .xls / .xlsm) into structured text
 * that can be fed directly into classifyFinancials() (AI classifier).
 *
 * Strategy:
 *   1. Score each sheet by name relevance (financial vs non-financial)
 *   2. Detect unit scale from sheet headers ("$000s", "in millions", etc.)
 *   3. Extract only meaningful rows (skip empty/formatting rows)
 *   4. Prefix each sheet with name + detected unit context
 *   5. Send scored sheets first, skip junk sheets entirely
 */

import XLSX from 'xlsx';
import { log } from '../utils/logger.js';

// ─── Sheet Scoring ────────────────────────────────────────────

/** High-value sheet names — definitely financial */
const HIGH_SCORE_PATTERNS: [RegExp, number][] = [
  [/income\s*statement/i, 100],
  [/profit\s*(&|and)\s*loss/i, 100],
  [/p\s*[&+]\s*l\b/i, 95],
  [/balance\s*sheet/i, 100],
  [/cash\s*flow/i, 100],
  [/consolidated/i, 80],
  [/\bfinancial\s*(summary|statements?|model|data)\b/i, 90],
  [/\bebitda\b/i, 85],
  [/\brevenue\b/i, 80],
  [/\blbo\b/i, 75],
  [/\bprojection/i, 75],
  [/\bforecast/i, 75],
  [/\bkpi\b/i, 60],
  [/\bsummary\b/i, 50],
  [/\bmodel\b/i, 50],
  [/\bearnings/i, 70],
];

/** Junk sheets to always skip */
const SKIP_PATTERNS = [
  /^(cover|title|toc|table\s*of\s*contents|disclaimer|glossary|appendix|notes\s*to|footnote)$/i,
  /^(assumptions|inputs|drivers|scenarios|sensitivity|instructions|template|blank|sheet\d+)$/i,
  /^(formatting|print|macro|hidden|chart\d*|graph|pivot|dashboard)$/i,
];

function scoreSheet(name: string): number {
  const trimmed = name.trim();

  // Skip junk
  if (SKIP_PATTERNS.some(re => re.test(trimmed))) return -1;

  // Score by patterns
  let maxScore = 0;
  for (const [pattern, score] of HIGH_SCORE_PATTERNS) {
    if (pattern.test(trimmed)) {
      maxScore = Math.max(maxScore, score);
    }
  }

  // Short generic names like "BS", "CF", "PL", "IS" — moderate score
  if (/^(bs|cf|pl|is|cfs)$/i.test(trimmed)) maxScore = Math.max(maxScore, 70);

  // Fallback: sheets with numbers in content might still be useful (scored low)
  if (maxScore === 0) maxScore = 10;

  return maxScore;
}

// ─── Unit Scale Detection ────────────────────────────────────

/**
 * Scan the first few rows of a sheet for unit indicators.
 * Returns a human-readable string like "Units: $000s (thousands)" or null.
 */
function detectUnitScale(sheet: XLSX.WorkSheet): string | null {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const maxRow = Math.min(range.e.r, 8); // check first 8 rows only

  for (let r = range.s.r; r <= maxRow; r++) {
    for (let c = range.s.c; c <= Math.min(range.e.c, 10); c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || !cell.v) continue;
      const val = String(cell.v).toLowerCase();

      if (/\$\s*in\s*millions|\(\$m\)|\$\s*mm|\(millions\)|in\s*millions?\s*usd/i.test(val)) {
        return 'IMPORTANT: Values in this sheet are in MILLIONS USD ($M)';
      }
      if (/\$\s*in\s*thousands|\(\$000s?\)|\$\s*000|\(thousands\)|in\s*thousands/i.test(val)) {
        return 'IMPORTANT: Values in this sheet are in THOUSANDS USD ($000s) — divide by 1,000 to get millions';
      }
      if (/\$\s*in\s*billions|\(\$b\)|\(billions\)/i.test(val)) {
        return 'IMPORTANT: Values in this sheet are in BILLIONS USD ($B) — multiply by 1,000 to get millions';
      }
      if (/in\s*actual|in\s*dollars|\(\$\)$/i.test(val)) {
        return 'IMPORTANT: Values in this sheet are in ACTUAL DOLLARS — divide by 1,000,000 to get millions';
      }
    }
  }
  return null;
}

// ─── Row Filtering ───────────────────────────────────────────

/**
 * Convert sheet to CSV but skip mostly-empty rows and formatting-only rows.
 * Returns cleaner text that's more token-efficient for AI classifier.
 */
function sheetToCleanCSV(sheet: XLSX.WorkSheet): string {
  const csv = XLSX.utils.sheet_to_csv(sheet, {
    blankrows: false,
    strip: true,
  });

  const lines = csv.split('\n');
  const cleanLines: string[] = [];

  for (const line of lines) {
    // Skip lines that are just commas (empty rows)
    const stripped = line.replace(/,/g, '').trim();
    if (stripped.length < 2) continue;

    // Skip lines that are only dashes/underscores/equals (formatting separators)
    if (/^[-_=\s,]+$/.test(line)) continue;

    cleanLines.push(line);
  }

  return cleanLines.join('\n');
}

// ─── Main Extractor ──────────────────────────────────────────

/**
 * Extract text from an Excel workbook buffer.
 * Returns a text blob suitable for classifyFinancials().
 *
 * Improvements over v1:
 *   - Scores sheets by financial relevance (not just pattern match)
 *   - Skips junk sheets (Assumptions, Notes, Cover, etc.)
 *   - Detects unit scale from headers and passes to AI classifier
 *   - Filters empty/formatting rows for cleaner input
 *   - Processes sheets in relevance order (highest score first)
 */
export function extractTextFromExcel(buffer: Buffer): string | null {
  try {
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellText: true,
    });

    if (!workbook.SheetNames.length) {
      log.warn('Excel extractor: workbook has no sheets');
      return null;
    }

    // Score and sort sheets by financial relevance
    const scoredSheets = workbook.SheetNames
      .map(name => ({ name, score: scoreSheet(name) }))
      .filter(s => s.score > 0) // skip junk (score = -1)
      .sort((a, b) => b.score - a.score); // highest score first

    // If no sheets scored above junk threshold, try all non-junk sheets
    const sheetsToProcess = scoredSheets.length > 0
      ? scoredSheets
      : workbook.SheetNames
          .filter(name => !SKIP_PATTERNS.some(re => re.test(name.trim())))
          .map(name => ({ name, score: 10 }));

    log.info('Excel extractor: sheet analysis', {
      totalSheets: workbook.SheetNames.length,
      scoredSheets: scoredSheets.map(s => `${s.name} (${s.score})`),
      processing: sheetsToProcess.map(s => s.name),
      skipped: workbook.SheetNames.filter(name => scoreSheet(name) === -1),
    });

    const textParts: string[] = [];

    for (const { name, score } of sheetsToProcess) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;

      const csv = sheetToCleanCSV(sheet);
      if (csv.length < 20) continue; // empty sheet after cleaning

      // Detect unit scale from sheet headers
      const unitHint = detectUnitScale(sheet);

      // Build sheet header with context
      let header = `[Sheet: ${name}]`;
      if (score >= 70) header += ` (financial statement detected)`;
      if (unitHint) header += `\n${unitHint}`;

      textParts.push(`${header}\n${csv}`);
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
