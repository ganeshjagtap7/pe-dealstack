/**
 * Excel Financial Extractor — Structured Row/Column Ingestion Tests
 * =================================================================
 *
 * Validates the merge-aware, structured-text representation that the
 * extractor ships to the LLM classifier. The previous flat
 * `sheet_to_csv` path lost merged-cell content (year banners, quarter
 * bands rendered as ",,,FY 2024,,,,,,,,") and only scanned the top
 * 8 × 10 cells for unit declarations, missing footnote-row declarations
 * which produced 1000× over-/under-stated EBITDA values.
 *
 * Coverage:
 *   - expandMerges spreads merged values across the entire merge range.
 *   - extractTextFromExcel emits aligned, tab-separated rows.
 *   - Year banners survive merge expansion (fixes "what year is this
 *     month under?" bug).
 *   - detectUnitScale finds declarations in row 14 / column N (beyond
 *     the 8 × 10 cap of the previous implementation).
 *   - detectUnitScale finds declarations in the sheet name.
 */

import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import {
  expandMerges,
  detectUnitScale,
  extractTextFromExcel,
} from '../src/services/excelFinancialExtractor.js';

/** Build an in-memory worksheet from a 2-D string array. Merge ranges
 *  passed via `merges` follow xlsx's {s:{r,c}, e:{r,c}} convention. */
function makeSheet(
  rows: (string | number | null)[][],
  merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [],
): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (merges.length > 0) sheet['!merges'] = merges;
  return sheet;
}

function makeWorkbook(sheets: { name: string; sheet: XLSX.WorkSheet }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const { name, sheet } of sheets) {
    XLSX.utils.book_append_sheet(wb, sheet, name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('expandMerges', () => {
  it('spreads a year banner across every column it visually spans', () => {
    // Row 0: blank | "FY 2024" merged across B-D | "FY 2025" across E-G
    // Row 1: month labels under each year
    const sheet = makeSheet(
      [
        ['', 'FY 2024', '', '', 'FY 2025', '', ''],
        ['', 'Jan-24', 'Feb-24', 'Mar-24', 'Jan-25', 'Feb-25', 'Mar-25'],
        ['Revenue', 100, 110, 120, 130, 140, 150],
      ],
      [
        { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } }, // FY 2024 across B-D
        { s: { r: 0, c: 4 }, e: { r: 0, c: 6 } }, // FY 2025 across E-G
      ],
    );

    expandMerges(sheet);

    // Every cell in the FY 2024 merge range should now carry the value.
    expect(sheet['B1']?.v).toBe('FY 2024');
    expect(sheet['C1']?.v).toBe('FY 2024');
    expect(sheet['D1']?.v).toBe('FY 2024');
    // FY 2025 likewise.
    expect(sheet['E1']?.v).toBe('FY 2025');
    expect(sheet['F1']?.v).toBe('FY 2025');
    expect(sheet['G1']?.v).toBe('FY 2025');
    // Pre-existing non-merge cells are untouched.
    expect(sheet['B2']?.v).toBe('Jan-24');
    expect(sheet['A3']?.v).toBe('Revenue');
  });

  it('is a no-op when the sheet has no merges', () => {
    const sheet = makeSheet([
      ['', 'Jan-24', 'Feb-24'],
      ['Revenue', 100, 110],
    ]);
    expandMerges(sheet);
    expect(sheet['A1']?.v).toBe('');
    expect(sheet['B1']?.v).toBe('Jan-24');
    expect(sheet['A2']?.v).toBe('Revenue');
    expect(sheet['B2']?.v).toBe(100);
  });

  it('does not overwrite already-populated cells inside a merge range', () => {
    // This is defensive — xlsx's own writer never produces cells inside
    // a merge range, but pathological files in the wild sometimes do.
    const sheet = makeSheet(
      [['Banner', 'should-stay', 'also-stay']],
      [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }],
    );
    expandMerges(sheet);
    expect(sheet['A1']?.v).toBe('Banner');
    expect(sheet['B1']?.v).toBe('should-stay');
    expect(sheet['C1']?.v).toBe('also-stay');
  });
});

describe('detectUnitScale', () => {
  it('finds a $M declaration in row 1 (top-left zone)', () => {
    const sheet = makeSheet([
      ['Income Statement (in $M)'],
      ['Revenue', 50],
    ]);
    expect(detectUnitScale(sheet)).toContain('MILLIONS');
  });

  it('finds a $000s declaration in row 14 (beyond the legacy 8-row cap)', () => {
    // Old implementation would have missed this — 1000× under/over-stated
    // EBITDA depending on which way the LLM's magnitude guess went.
    const rows: (string | number | null)[][] = [];
    for (let i = 0; i < 13; i++) rows.push(['Revenue', i * 100]);
    rows.push(['Note: All figures in $000s']);
    const sheet = makeSheet(rows);
    expect(detectUnitScale(sheet)).toContain('THOUSANDS');
  });

  it('finds a $B declaration in a far-right column (beyond the legacy 10-col cap)', () => {
    const row: (string | number | null)[] = ['Revenue'];
    for (let c = 1; c <= 14; c++) row.push(0);
    row.push('(in $B)'); // column index 15 → spreadsheet col P
    const sheet = makeSheet([row]);
    expect(detectUnitScale(sheet)).toContain('BILLIONS');
  });

  it('falls back to the sheet name when grid-cell scan finds nothing', () => {
    const sheet = makeSheet([
      ['Revenue', 50, 100],
      ['EBITDA', 10, 22],
    ]);
    expect(detectUnitScale(sheet, 'P&L (in $M)')).toContain('MILLIONS');
  });

  it('returns null when no unit declaration is present anywhere', () => {
    const sheet = makeSheet([
      ['Revenue', 50, 100],
      ['EBITDA', 10, 22],
    ]);
    expect(detectUnitScale(sheet, 'Income Statement')).toBeNull();
  });
});

describe('extractTextFromExcel — structured row/column ingestion', () => {
  it('preserves column alignment via tab separators', () => {
    const sheet = makeSheet([
      ['', 'Jan-24', 'Feb-24', 'Mar-24'],
      ['Revenue', 100, 110, 120],
      ['EBITDA', 10, 12, 14],
    ]);
    const buffer = makeWorkbook([{ name: 'Income Statement', sheet }]);
    const text = extractTextFromExcel(buffer);

    expect(text).not.toBeNull();
    // Tab-separated grid (commas inside numbers don't conflict).
    expect(text).toContain('\tJan-24\tFeb-24\tMar-24');
    expect(text).toContain('Revenue\t100\t110\t120');
    expect(text).toContain('EBITDA\t10\t12\t14');
    // Column-letter header anchors row references.
    expect(text).toContain('COL\tA\tB\tC\tD');
    // Per-sheet metadata block.
    expect(text).toMatch(/\[Grid: \d+ non-empty rows × \d+ cols\]/);
    expect(text).toContain('[Sheet: Income Statement] (financial statement detected)');
  });

  it('expands a merged year banner so months under FY 2024 show "FY 2024" in every column', () => {
    // The pre-fix bug: this row would render as ",FY 2024,,,FY 2025,,," and
    // the LLM had to guess which months belonged to which year — failing
    // on wide grids and producing absurd-magnitude EBITDA values.
    const sheet = makeSheet(
      [
        ['', 'FY 2024', '', '', 'FY 2025', '', ''],
        ['', 'Jan-24', 'Feb-24', 'Mar-24', 'Jan-25', 'Feb-25', 'Mar-25'],
        ['Revenue', 100, 110, 120, 130, 140, 150],
        ['EBITDA', 10, 12, 14, 16, 18, 20],
      ],
      [
        { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },
        { s: { r: 0, c: 4 }, e: { r: 0, c: 6 } },
      ],
    );
    const buffer = makeWorkbook([{ name: 'P&L', sheet }]);
    const text = extractTextFromExcel(buffer);

    expect(text).not.toBeNull();
    // Every month column under FY 2024 carries the year banner explicitly.
    expect(text).toContain('FY 2024\tFY 2024\tFY 2024\tFY 2025\tFY 2025\tFY 2025');
    // Month row sits directly below the now-aligned year banner.
    expect(text).toContain('Jan-24\tFeb-24\tMar-24\tJan-25\tFeb-25\tMar-25');
  });

  it('emits the unit-scale hint when a footnote row declares $000s (row 14)', () => {
    const rows: (string | number | null)[][] = [
      ['', 'Jan-24', 'Feb-24'],
      ['Revenue', 1000, 1100],
    ];
    // Pad so the footnote sits at row 14, beyond the legacy 8-row cap.
    while (rows.length < 13) rows.push(['', '', '']);
    rows.push(['Note: All figures in $000s', '', '']);
    const sheet = makeSheet(rows);
    const buffer = makeWorkbook([{ name: 'Financials', sheet }]);
    const text = extractTextFromExcel(buffer);

    expect(text).not.toBeNull();
    expect(text).toContain('THOUSANDS');
  });

  it('renders multiple sheets in score order, separated by blank line', () => {
    const ifs = makeSheet([
      ['', 'Jan-24'],
      ['Revenue', 100],
    ]);
    const bs = makeSheet([
      ['', 'Jan-24'],
      ['Total Assets', 500],
    ]);
    const buffer = makeWorkbook([
      { name: 'Cover', sheet: makeSheet([['Just a cover page']]) },
      { name: 'Income Statement', sheet: ifs },
      { name: 'Balance Sheet', sheet: bs },
    ]);
    const text = extractTextFromExcel(buffer);

    expect(text).not.toBeNull();
    // Cover sheet is in SKIP_PATTERNS → must not appear.
    expect(text).not.toContain('Just a cover page');
    // Both real statements appear.
    expect(text).toContain('[Sheet: Income Statement]');
    expect(text).toContain('[Sheet: Balance Sheet]');
    // Sheets are separated by a blank line.
    const sections = text!.split(/\n\n\[Sheet:/);
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves empty cells so column indices stay aligned across rows', () => {
    // Real spreadsheets often have rows with values only in some columns.
    // The structured walk pads short rows so column N always means the
    // same period across every line item.
    const sheet = makeSheet([
      ['', 'Jan-24', 'Feb-24', 'Mar-24'],
      ['Revenue', 100, 110, 120],
      ['EBITDA', null, 12, 14], // null/empty Jan-24 cell
    ]);
    const buffer = makeWorkbook([{ name: 'P&L', sheet }]);
    const text = extractTextFromExcel(buffer);

    expect(text).not.toBeNull();
    // EBITDA row has empty first value cell, then 12, then 14 — column
    // alignment preserved (the empty cell is a tab between two tabs).
    expect(text).toContain('EBITDA\t\t12\t14');
  });

  it('skips formatting separator rows (------ / ======) but keeps real content', () => {
    const sheet = makeSheet([
      ['', 'Jan-24', 'Feb-24'],
      ['------', '------', '------'],
      ['Revenue', 100, 110],
      ['======', '======', '======'],
      ['EBITDA', 10, 12],
    ]);
    const buffer = makeWorkbook([{ name: 'Income Statement', sheet }]);
    const text = extractTextFromExcel(buffer);

    expect(text).not.toBeNull();
    expect(text).toContain('Revenue\t100\t110');
    expect(text).toContain('EBITDA\t10\t12');
    // Separator rows are dropped — they carry no data and just bloat the
    // payload.
    expect(text).not.toContain('------');
    expect(text).not.toContain('======');
  });
});
