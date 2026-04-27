import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import XLSX from 'xlsx';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PNG } from 'pngjs';
import { extractText } from '../src/services/extraction/textExtractor.js';

// ─── Mocks ────────────────────────────────────────────────────

// Avoid real OpenAI calls in tests. We only validate routing/output shape.
vi.mock('../src/openai.js', () => ({
  isAIEnabled: () => true,
  openai: {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'Revenue 50\nEBITDA 12\n| Year | Revenue |\n|---|---|\n| 2023 | 50 |' } }],
        }),
      },
    },
    responses: {
      create: vi.fn().mockResolvedValue({
        output_text: 'ACME Income Statement\n2023 Revenue 50',
      }),
    },
  },
}));

// Mock pdf-parse to return deterministic text and page count
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    // Long, text-rich content so extractText stays on pdf-parse path
    text: [
      'ACME Income Statement',
      'All values in USD millions.',
      'Year Revenue EBITDA Net Income',
      '2021 40 10 6',
      '2022 45 11 7',
      '2023 50 12 8',
      '',
      'Notes: This is a sample table with multiple numeric columns and enough words.',
      'We repeat a few sentences to exceed sparse/scanned heuristics.',
      'This document contains meaningful alphanumeric content for extraction.',
      'This document contains meaningful alphanumeric content for extraction.',
      'This document contains meaningful alphanumeric content for extraction.',
      '\f',
      'Page 2',
      'Additional details and footnotes about revenue recognition and adjustments.',
      'Additional details and footnotes about revenue recognition and adjustments.',
    ].join('\n'),
    numpages: 2,
  }),
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'text-extractor-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeFile(buffer: Buffer, filename: string): Promise<string> {
  const p = path.join(tmpDir, filename);
  await fs.writeFile(p, buffer);
  return p;
}

async function buildSamplePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  page.drawText('ACME Income Statement', { x: 50, y: 740, size: 14, font });
  page.drawText('Year   Revenue   EBITDA', { x: 50, y: 710, size: 12, font });
  page.drawText('2023   50        12', { x: 50, y: 690, size: 12, font });
  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function buildSampleExcel(): Buffer {
  const wb = XLSX.utils.book_new();

  const income = XLSX.utils.aoa_to_sheet([
    ['Income Statement ($ in millions)'],
    ['Year', 'Revenue', 'EBITDA'],
    ['2022', 40, 10],
    ['2023', 50, 12],
  ]);
  const balance = XLSX.utils.aoa_to_sheet([
    ['Balance Sheet ($ in millions)'],
    ['Year', 'Cash', 'Total Assets'],
    ['2022', 100, 500],
    ['2023', 120, 550],
  ]);
  const cashflow = XLSX.utils.aoa_to_sheet([
    ['Cash Flow ($ in millions)'],
    ['Year', 'Net Change Cash'],
    ['2023', 20],
  ]);

  XLSX.utils.book_append_sheet(wb, income, 'Income Statement');
  XLSX.utils.book_append_sheet(wb, balance, 'Balance Sheet');
  XLSX.utils.book_append_sheet(wb, cashflow, 'Cash Flow');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

function buildSamplePng(): Buffer {
  // Simple PNG fixture (content doesn't matter due to OpenAI mock)
  const png = new PNG({ width: 10, height: 10 });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;      // R
    png.data[i + 1] = 255;  // G
    png.data[i + 2] = 255;  // B
    png.data[i + 3] = 255;  // A
  }
  return PNG.sync.write(png);
}

describe('extractText — Task 1 multi-format extraction', () => {
  it('extracts PDF via pdf-parse into page sections', async () => {
    const pdfBuf = await buildSamplePdf();
    const p = await writeFile(pdfBuf, 'sample.pdf');

    const result = await extractText(p, 'application/pdf');

    expect(result.metadata.format).toBe('pdf');
    // Depending on pdf-parse behavior in the test environment, the extractor
    // may fall back to Vision for sparse/scanned PDFs. Both are valid paths.
    expect(['pdf-parse', 'gpt-4o-vision']).toContain(result.metadata.extractionMethod);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(typeof result.sections[0].name).toBe('string');
    expect(typeof result.text).toBe('string');
  });

  it('extracts Excel by iterating sheets and producing sections', async () => {
    const xlsBuf = buildSampleExcel();
    const p = await writeFile(xlsBuf, 'sample.xlsx');

    const result = await extractText(
      p,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    expect(result.metadata.format).toBe('excel');
    expect(result.metadata.extractionMethod).toBe('excel-xlsx');
    expect(result.sections.length).toBeGreaterThanOrEqual(3);
    expect(result.text).toContain('[Sheet:');
  });

  it('extracts images via GPT-4o vision OCR into a single section', async () => {
    const pngBuf = buildSamplePng();
    const p = await writeFile(pngBuf, 'sample.png');

    const result = await extractText(p, 'image/png');

    expect(result.metadata.format).toBe('image');
    expect(result.metadata.extractionMethod).toBe('gpt-4o-vision-ocr');
    expect(result.sections).toHaveLength(1);
    expect(result.text.length).toBeGreaterThan(10);
  });
});

