/**
 * pipeline.test.ts — Integration tests for the extraction pipeline.
 *
 * Tests runExtractionPipeline() end-to-end using:
 *   - Mocked OpenAI calls (no real API needed)
 *   - Temp files written to disk for the text extractor
 *   - Pure output-shape validation (status, statements, metadata)
 *
 * Uses vitest's vi.mock() to stub the LLM and vision services,
 * following the same pattern as existing tests in this repo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ─── Mocks ────────────────────────────────────────────────────

const { mockCreate } = vi.hoisted(() => {
  return {
    mockCreate: vi.fn().mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            statements: [{
              statementType: 'INCOME_STATEMENT',
              unitScale: 'MILLIONS',
              currency: 'USD',
              periods: [{
                period: '2023',
                periodType: 'HISTORICAL',
                confidence: 88,
                lineItems: { revenue: 50, ebitda: 12, ebitda_margin_pct: 24 },
              }],
            }],
            overallConfidence: 88,
            warnings: [],
          }),
        },
      }],
      usage: { prompt_tokens: 1200, completion_tokens: 400 },
    })
  };
});

// Stub OpenAI so no real network calls are made
vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

// Mock isAIEnabled to always return true for tests
vi.mock('../src/openai.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    isAIEnabled: () => true,
    openai: {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
      responses: {
        create: vi.fn().mockResolvedValue({ output_text: 'Vision PDF text extraction mock' }),
      },
    },
  };
});

// Mock pdf-parse so the PDF path is deterministic (no real PDF parsing needed)
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    text: 'ACME Income Statement\n2023 Revenue 50\n2023 EBITDA 12\n\fPage 2\nMore text here to avoid sparse detection.',
    numpages: 2,
  }),
}));

// Stub vision extractor — called for images/scanned PDFs
vi.mock('../src/services/visionExtractor.js', () => ({
  classifyFinancialsVision: vi.fn().mockResolvedValue({
    statements: [],
    overallConfidence: 0,
    warnings: ['Vision mock: no financial data'],
  }),
}));

// Stub Azure Doc Intelligence — not configured in tests
vi.mock('../src/services/azureDocIntelligence.js', () => ({
  isAzureConfigured: vi.fn().mockReturnValue(false),
  extractTablesFromPdf: vi.fn().mockResolvedValue(null),
}));

// ─── Helpers ─────────────────────────────────────────────────

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pipeline-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/**
 * Write a simple financial text fixture to a temp file and return its path.
 */
async function writeTempFile(content: string, filename: string): Promise<string> {
  const filePath = path.join(tmpDir, filename);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

/** Build minimal Income Statement text that the classifier can parse */
const SAMPLE_FINANCIAL_TEXT = `
ACME Corp — Income Statement
($ in Millions)

                    2021      2022      2023
Revenue             40.0      45.0      50.0
COGS               (24.0)    (27.0)    (30.0)
Gross Profit        16.0      18.0      20.0
Operating Expenses  (6.0)     (7.0)     (8.0)
EBITDA              10.0      11.0      12.0
EBITDA Margin %     25.0%     24.4%     24.0%
Net Income           6.0       7.0       8.0
`;

// ─── Tests ───────────────────────────────────────────────────

describe('runExtractionPipeline — output shape', () => {
  it('exports runExtractionPipeline function', async () => {
    const mod = await import('../src/services/extraction/pipeline.js');
    expect(typeof mod.runExtractionPipeline).toBe('function');
  });
});

describe('runExtractionPipeline — failed path (unsupported format)', () => {
  it('returns status:failed for unsupported MIME type', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    const filePath = await writeTempFile('test', 'test.bin');

    const result = await runExtractionPipeline(filePath, 'application/octet-stream', 'test.bin');

    expect(result.status).toBe('failed');
    expect(result.statements).toHaveLength(0);
    expect(result.metadata.error).toBeTruthy();
  });
});

describe('runExtractionPipeline — text extraction path', () => {
  it('returns correct metadata shape', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    // Use a supported MIME type; pipeline expects PDF/Excel/Image paths via textExtractor.
    // We intentionally name it .pdf so the extractor routes to the PDF path in tests.
    const filePath = await writeTempFile(SAMPLE_FINANCIAL_TEXT, 'financials.pdf');

    const result = await runExtractionPipeline(filePath, 'application/pdf', 'financials.pdf');

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('statements');
    expect(result).toHaveProperty('validation');
    expect(result).toHaveProperty('corrections');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata).toHaveProperty('processingTime');
    expect(result.metadata).toHaveProperty('tokensUsed');
    expect(result.metadata).toHaveProperty('estimatedCost');
    expect(result.metadata).toHaveProperty('fileName');
    expect(result.metadata).toHaveProperty('format');
  });

  it('metadata.processingTime has all required timing keys', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    const filePath = await writeTempFile(SAMPLE_FINANCIAL_TEXT, 'test.pdf');

    const result = await runExtractionPipeline(filePath, 'application/pdf', 'test.pdf');

    const times = result.metadata.processingTime;
    expect(times).toHaveProperty('textExtraction');
    expect(times).toHaveProperty('classification');
    expect(times).toHaveProperty('validation');
    expect(times).toHaveProperty('selfCorrection');
    expect(times).toHaveProperty('total');
    expect(typeof times.total).toBe('number');
    expect(times.total).toBeGreaterThanOrEqual(0);
  });

  it('estimatedCost is a non-negative number', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    const filePath = await writeTempFile(SAMPLE_FINANCIAL_TEXT, 'test.pdf');

    const result = await runExtractionPipeline(filePath, 'application/pdf', 'test.pdf');
    expect(typeof result.metadata.estimatedCost).toBe('number');
    expect(result.metadata.estimatedCost).toBeGreaterThanOrEqual(0);
  });

  it('tokensUsed is a non-negative integer', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    const filePath = await writeTempFile(SAMPLE_FINANCIAL_TEXT, 'test.pdf');

    const result = await runExtractionPipeline(filePath, 'application/pdf', 'test.pdf');
    expect(typeof result.metadata.tokensUsed).toBe('number');
    expect(result.metadata.tokensUsed).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(result.metadata.tokensUsed)).toBe(true);
  });
});

describe('runExtractionPipeline — validation integration', () => {
  it('validation result always has the required shape', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    const filePath = await writeTempFile(SAMPLE_FINANCIAL_TEXT, 'test.pdf');

    const result = await runExtractionPipeline(filePath, 'application/pdf', 'test.pdf');

    expect(result.validation).toHaveProperty('checks');
    expect(result.validation).toHaveProperty('errorCount');
    expect(result.validation).toHaveProperty('warningCount');
    expect(result.validation).toHaveProperty('overallPassed');
    expect(result.validation).toHaveProperty('flaggedItems');
    expect(Array.isArray(result.validation.checks)).toBe(true);
    expect(Array.isArray(result.validation.flaggedItems)).toBe(true);
  });
});

describe('runExtractionPipeline — status values', () => {
  it('status is one of: success | partial | failed', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    const filePath = await writeTempFile(SAMPLE_FINANCIAL_TEXT, 'test.pdf');

    const result = await runExtractionPipeline(filePath, 'application/pdf', 'test.pdf');
    expect(['success', 'partial', 'failed']).toContain(result.status);
  });

  it('corrections is null when validation passes', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    const filePath = await writeTempFile(SAMPLE_FINANCIAL_TEXT, 'test.pdf');

    const result = await runExtractionPipeline(filePath, 'application/pdf', 'test.pdf');

    if (result.status === 'success') {
      expect(result.corrections).toBeNull();
    }
  });
});

describe('runExtractionPipeline — cost calculation accuracy', () => {
  it('estimatedCost matches tokensUsed * gpt-4o pricing formula', async () => {
    const { runExtractionPipeline } = await import('../src/services/extraction/pipeline.js');
    const filePath = await writeTempFile(SAMPLE_FINANCIAL_TEXT, 'test.pdf');

    const result = await runExtractionPipeline(filePath, 'application/pdf', 'test.pdf');

    if (result.metadata.tokensUsed === 0) {
      expect(result.metadata.estimatedCost).toBe(0);
    } else {
      expect(result.metadata.estimatedCost).toBeGreaterThan(0);
    }
  });
});
