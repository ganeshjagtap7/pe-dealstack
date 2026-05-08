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
export const SKIP_PATTERNS = [
  /^(cover|title|toc|table\s*of\s*contents|disclaimer|glossary|appendix|notes\s*to|footnote)$/i,
  /^(assumptions|inputs|drivers|scenarios|sensitivity|instructions|template|blank|sheet\d+)$/i,
  /^(formatting|print|macro|hidden|chart\d*|graph|pivot|dashboard)$/i,
];

export function scoreSheet(name: string): number {
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

// ─── Merge Expansion ─────────────────────────────────────────

/**
 * Spread merged-cell values into every cell of each merge range.
 *
 * Why: the xlsx library only stores the merge value in the top-left cell
 * of a merge range. The other cells are absent from the sheet object,
 * so `sheet_to_csv` renders them as empty commas. A year banner row
 * "FY 2024" merged across columns B–M becomes ",,,,FY 2024,,,,,,,,,," in
 * CSV — the LLM has to guess that the empty cells belong to "FY 2024",
 * which fails on wide grids and produces the absurd-magnitude / missing-
 * line-item bugs we've shipped.
 *
 * After this pass: every cell in a merge range carries the same value as
 * the top-left, so column alignment is preserved and the LLM can read
 * the year banner and the month label below it as a coherent (year,
 * month) pair.
 *
 * Mutates the sheet in place. Safe because `extractTextFromExcel` owns
 * the workbook for the duration of the call (the markdown extractor
 * runs on its own `XLSX.read` of the buffer).
 */
export function expandMerges(sheet: XLSX.WorkSheet): void {
  const merges = sheet['!merges'];
  if (!merges || merges.length === 0) return;

  for (const m of merges) {
    const srcAddr = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
    const srcCell = sheet[srcAddr];
    if (!srcCell || srcCell.v == null || srcCell.v === '') continue;
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        const addr = XLSX.utils.encode_cell({ r, c });
        // After XLSX round-trip, cells inside a merge range come back
        // as empty-string placeholders ({t:'s', v:''}) rather than
        // `undefined`. Treat any cell with a null/empty value as
        // overwritable so the merge value broadcasts correctly.
        const existing = sheet[addr];
        if (existing && existing.v != null && existing.v !== '') continue;
        sheet[addr] = { ...srcCell };
      }
    }
  }
}

// ─── Unit Scale Detection ────────────────────────────────────

/** Caps for the unit-scale scan — wide enough to catch declarations
 *  buried in a footnote row (row 14, "Note: All figures in $000s") or
 *  a far-right disclaimer column, narrow enough that a 1000-row data
 *  sheet doesn't waste milliseconds on cells that are obviously numeric. */
const UNIT_SCAN_MAX_ROWS = 25;
const UNIT_SCAN_MAX_COLS = 25;

/**
 * Scan the sheet for unit indicators (millions / thousands / billions /
 * actuals). Looks at:
 *   1. Up to UNIT_SCAN_MAX_ROWS × UNIT_SCAN_MAX_COLS cells in the grid
 *      (vs the previous 8×10 cap which missed footnote-row declarations).
 *   2. The sheet name itself ("P&L (in $M)" or "Revenue ($000s)").
 *
 * Returns the strongest signal as a prompt-ready hint string, or null.
 */
export function detectUnitScale(
  sheet: XLSX.WorkSheet,
  sheetName?: string,
): string | null {
  const candidates: string[] = [];
  if (sheetName) candidates.push(sheetName);

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
  const maxRow = Math.min(range.e.r, range.s.r + UNIT_SCAN_MAX_ROWS - 1);
  const maxCol = Math.min(range.e.c, range.s.c + UNIT_SCAN_MAX_COLS - 1);
  for (let r = range.s.r; r <= maxRow; r++) {
    for (let c = range.s.c; c <= maxCol; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell || cell.v == null) continue;
      const val = String(cell.v);
      // Cheap pre-filter: only look at strings that mention dollars, a
      // scale word, or a parenthesised marker. Avoids regex-testing every
      // numeric cell in a wide grid.
      if (!/\$|\(|\bin\b|thousand|million|billion|actual/i.test(val)) continue;
      candidates.push(val);
    }
  }

  for (const raw of candidates) {
    const val = raw.toLowerCase();
    if (/\$\s*in\s*millions|\(\$m\)|\$\s*mm|\(millions\)|in\s*millions?\s*usd|\(in\s*\$?m\)/i.test(val)) {
      return 'IMPORTANT: Values in this sheet are in MILLIONS USD ($M). Store values as written; set unitScale to "MILLIONS". Do NOT convert.';
    }
    if (/\$\s*in\s*thousands|\(\$000s?\)|\$\s*000|\(thousands\)|in\s*thousands|\(in\s*\$?k\)/i.test(val)) {
      return 'IMPORTANT: Values in this sheet are in THOUSANDS USD ($000s). Store values as written; set unitScale to "THOUSANDS". Do NOT convert.';
    }
    if (/\$\s*in\s*billions|\(\$b\)|\(billions\)|\(in\s*\$?b\)/i.test(val)) {
      return 'IMPORTANT: Values in this sheet are in BILLIONS USD ($B). Store values as written; set unitScale to "BILLIONS". Do NOT convert.';
    }
    if (/in\s*actual|in\s*dollars|\(\$\)$/i.test(val)) {
      return 'IMPORTANT: Values in this sheet are in ACTUAL DOLLARS. Store values as written; set unitScale to "ACTUALS". Do NOT convert.';
    }
  }
  return null;
}

// ─── Structured Row/Column Ingestion ─────────────────────────

/**
 * Render a sheet as structured row/column text suitable for the LLM
 * classifier.
 *
 * Approach (replaces the prior flat sheet_to_csv path):
 *   1. Caller has already expanded merges, so year banners / quarter
 *      bands fill every column they visually span.
 *   2. Build a 2-D grid via sheet_to_json({ header: 1 }) — preserves
 *      column alignment across rows of mixed length, which is
 *      essential for spreadsheet semantics (period headers in row N,
 *      line items in column A, values in B+ form a 2-D structure).
 *   3. Pad short rows to maxCols so columns stay aligned in the
 *      rendered output even when later rows have fewer cells.
 *   4. Drop rows that are purely empty / formatting separators
 *      (---, ===) but keep rows that have a label and zero values
 *      (those carry section structure: "EBITDA Build", subheadings).
 *   5. Emit a small grid header noting dimensions + the column-A
 *      label preview, so the LLM has anchors to reason against
 *      ("col A row 28 is 'EBITDA'") instead of inferring from the
 *      raw blob.
 *
 * Returns a tab-separated grid (tab = column boundary) prefixed with
 * a lightweight metadata block. Tab-separated rather than comma so we
 * don't conflict with commas inside numbers like "1,250".
 */
function sheetToStructuredText(sheet: XLSX.WorkSheet): string {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false, // use formatted text (cell.w) so dates render as "Apr-23"
  });

  if (grid.length === 0) return '';

  // Pad short rows so the grid is a true rectangle. xlsx returns ragged
  // rows when later columns are empty; pad with '' to keep column
  // indices stable.
  const maxCols = grid.reduce((m, r) => Math.max(m, r.length), 0);

  const cleanRows: string[] = [];
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    const padded: string[] = [];
    for (let c = 0; c < maxCols; c++) {
      const v = row[c];
      // Render every cell as its string form. Tabs and newlines inside
      // cells get squashed so they don't break the grid layout.
      const s = v == null ? '' : String(v).replace(/[\t\n\r]+/g, ' ').trim();
      padded.push(s);
    }
    const joined = padded.join('\t');

    // Skip purely-empty rows (all cells empty after merge expansion).
    if (padded.every((cell) => cell === '')) continue;
    // Skip pure formatting separators (------ or ====== rows).
    if (/^[-_=\s\t]+$/.test(joined)) continue;

    cleanRows.push(joined);
  }

  if (cleanRows.length === 0) return '';

  // Lightweight per-sheet metadata. Helps the LLM anchor its reasoning
  // to specific (row, col) coordinates instead of treating the blob as
  // unstructured text. Column letters use spreadsheet convention
  // (A=col 0, B=col 1, …) so the LLM's "column A is the label" prior
  // matches what it sees.
  const colLetters = Array.from({ length: maxCols }, (_, c) =>
    XLSX.utils.encode_col(c),
  ).join('\t');

  const header = `[Grid: ${cleanRows.length} non-empty rows × ${maxCols} cols]\nCOL\t${colLetters}`;

  return `${header}\n${cleanRows.join('\n')}`;
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

      // Spread merged values (year banners, quarter bands) into every
      // cell of their merge range BEFORE the structured walk; otherwise
      // the LLM sees ",,,FY 2024,,,,,,,,," and has to guess which months
      // belong to which year.
      expandMerges(sheet);

      const body = sheetToStructuredText(sheet);
      if (body.length < 20) continue; // empty sheet after cleaning

      // Detect unit scale across the whole sheet header zone (and the
      // sheet name) — covers footnote-row declarations the old 8×10
      // window missed.
      const unitHint = detectUnitScale(sheet, name);

      // Build sheet header with context
      let header = `[Sheet: ${name}]`;
      if (score >= 70) header += ` (financial statement detected)`;
      if (unitHint) header += `\n${unitHint}`;

      textParts.push(`${header}\n${body}`);
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

/** Returns true if the MIME type or filename looks like an Excel-family file
 *  (XLSX/XLS/XLSM/XLSB or CSV — XLSX.read parses CSV from a buffer too, so we
 *  funnel both through the same extractor). The frontend file picker exposes
 *  .csv to users; without this match the non-bulk ingest path falls into the
 *  "Unsupported file type" branch. */
export function isExcelFile(mimeType?: string | null, filename?: string | null): boolean {
  if (mimeType) {
    if (
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType.includes('csv') ||
      mimeType === 'application/vnd.ms-excel' ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return true;
    }
  }
  if (filename) {
    return /\.(xlsx|xls|xlsm|xlsb|csv)$/i.test(filename);
  }
  return false;
}
