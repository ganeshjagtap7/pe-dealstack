/**
 * textExtractor.test.ts — Subtask 1: Multi-format text extraction
 *
 * Tests Excel extraction (PDF tests require complex mocking of pdf-parse)
 */

import { describe, it, expect } from 'vitest';
import { extractTextFromExcel, isExcelFile } from '../src/services/excelFinancialExtractor.js';

describe('Subtask 1 — Multi-format text extraction', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Excel File Detection
  // ─────────────────────────────────────────────────────────────────────────
  it('isExcelFile() detects excel files', () => {
    expect(isExcelFile('application/vnd.ms-excel', 'test.xls')).toBe(true);
    expect(isExcelFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'test.xlsx')).toBe(true);
    expect(isExcelFile('application/pdf', 'test.pdf')).toBe(false);
    expect(isExcelFile('text/plain', 'test.txt')).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Excel Extraction
  // ─────────────────────────────────────────────────────────────────────────
  it('extractTextFromExcel() returns text from buffer', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Income Statement', '2021', '2022', '2023'],
      ['Revenue', 8.5, 10.0, 12.5],
      ['COGS', 5.0, 6.0, 7.5],
      ['Gross Profit', 3.5, 4.0, 5.0],
      ['EBITDA', 2.0, 2.5, 3.1],
      ['Net Income', 1.0, 1.2, 1.8],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Income Statement');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const text = extractTextFromExcel(buf);
    expect(text).toContain('Revenue');
    expect(text).toContain('Income Statement');
  });

  it('extractTextFromExcel() handles multi-sheet files', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Income Statement
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['Income Statement', '2023'],
      ['Revenue', 100],
      ['EBITDA', 30],
    ]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Income Statement');
    
    // Sheet 2: Balance Sheet
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Balance Sheet', '2023'],
      ['Total Assets', 200],
      ['Total Liabilities', 120],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Balance Sheet');
    
    // Sheet 3: Cash Flow
    const ws3 = XLSX.utils.aoa_to_sheet([
      ['Cash Flow', '2023'],
      ['Operating CF', 25],
      ['Capex', -10],
    ]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Cash Flow');
    
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const text = extractTextFromExcel(buf);
    
    expect(text).toContain('Income Statement');
    expect(text).toContain('Balance Sheet');
    expect(text).toContain('Cash Flow');
    expect(text).toContain('Revenue');
    expect(text).toContain('Total Assets');
  });
});
