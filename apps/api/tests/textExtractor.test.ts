/**
 * textExtractor.test.ts — Subtask 1: Multi-format text extraction
 */

import { describe, it, expect, vi } from 'vitest';
import { extractTextFromExcel, isExcelFile } from '../src/services/excelFinancialExtractor.js';

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    text: 'INCOME STATEMENT ($ in millions)\nRevenue 2022: 12.5 EBITDA 2022: 3.1',
    numpages: 1,
  }),
}));

vi.mock('../src/openai.js', () => ({
  isAIEnabled: vi.fn().mockReturnValue(true),
  openai: {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({ statements: [{ statementType: 'INCOME_STATEMENT', unitScale: 'MILLIONS', currency: 'USD', periods: [{ period: '2022', periodType: 'HISTORICAL', confidence: 90, lineItems: { revenue: 12.5, ebitda: 3.1 } }] }], overallConfidence: 90, warnings: [] }) } }],
        }),
      },
    },
  },
}));

describe('Subtask 1 — Multi-format text extraction', () => {
  it('isExcelFile() detects excel files', () => {
    expect(isExcelFile('application/vnd.ms-excel', 'test.xls')).toBe(true);
    expect(isExcelFile('application/pdf', 'test.pdf')).toBe(false);
  });

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
  });
});
