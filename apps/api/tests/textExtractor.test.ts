import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractText } from '../src/services/extraction/textExtractor.js';
import { extractTextFromExcel, isExcelFile, scoreSheet } from '../src/services/excelFinancialExtractor.js';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── isExcelFile detection ──────────────────────────────────────────────────
describe('isExcelFile', () => {
  it('detects .xlsx by mime', () => {
    expect(isExcelFile('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null)).toBe(true);
  });

  it('detects .xlsx by filename', () => {
    expect(isExcelFile(null, 'model.xlsx')).toBe(true);
  });

  it('detects .xls by filename', () => {
    expect(isExcelFile(null, 'financials.xls')).toBe(true);
  });

  it('rejects .pdf', () => {
    expect(isExcelFile('application/pdf', 'report.pdf')).toBe(false);
  });

  it('rejects .txt', () => {
    expect(isExcelFile('text/plain', 'notes.txt')).toBe(false);
  });
});

// ── extractTextFromExcel — synthetic workbook ──────────────────────────────
function makeTmpExcel(sheets: Record<string, Record<string, any>>): string {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.json_to_sheet(Object.entries(data).map(([k, v]) => ({ Label: k, Value: v })));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const tmpPath = path.join(os.tmpdir(), `test-${Date.now()}.xlsx`);
  XLSX.writeFile(wb, tmpPath);
  return tmpPath;
}

describe('extractTextFromExcel (real xlsx, no mocking)', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = makeTmpExcel({
      'Income Statement': { Revenue: 100, COGS: 60, 'Gross Profit': 40, EBITDA: 25 },
      'Balance Sheet': { 'Total Assets': 500, 'Total Liabilities': 300, Equity: 200 },
      'Cash Flow': { 'Operating CF': 30, CapEx: 10, FCF: 20 },
    });
  });

  it('returns non-null text', () => {
    const buf = fs.readFileSync(tmpFile);
    const text = extractTextFromExcel(buf);
    expect(text).toBeTruthy();
    expect(typeof text).toBe('string');
  });

  it('contains Income Statement header', () => {
    const buf = fs.readFileSync(tmpFile);
    const text = extractTextFromExcel(buf)!;
    expect(text).toContain('Income Statement');
  });

  it('all 3 sheet names appear in output', () => {
    const buf = fs.readFileSync(tmpFile);
    const text = extractTextFromExcel(buf)!;
    expect(text).toContain('Income Statement');
    expect(text).toContain('Balance Sheet');
    expect(text).toContain('Cash Flow');
  });
});

// ── textExtractor.extractText — mock pdf-parse and openai ─────────────────
vi.mock('pdf-parse', () => {
  const mod = vi.fn().mockResolvedValue({ text: 'Revenue 100 EBITDA 25', numpages: 2 });
  return { default: mod };
});

vi.mock('../../src/openai.js', () => ({
  openai: null,
  openaiDirect: null,
  isAIEnabled: vi.fn().mockReturnValue(false),
}));

describe('extractText (PDF path, mocked pdf-parse)', () => {
  it('returns extracted text for a real temp pdf placeholder', async () => {
    const tmpPdf = path.join(os.tmpdir(), `test-${Date.now()}.pdf`);
    fs.writeFileSync(tmpPdf, Buffer.from('%PDF-1.4 placeholder'));

    const result = await extractText(tmpPdf, 'application/pdf');
    expect(result.text).toBeTruthy();
    expect(result.metadata.format).toBe('pdf');
    fs.unlinkSync(tmpPdf);
  });
});
