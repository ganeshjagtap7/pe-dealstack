import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import express from 'express';

// ── Hoist mock functions before vi.mock ────────────────────────────────────
const {
  mockExtractText,
  mockClassifyExtraction,
  mockValidateExtraction,
  mockRunSelfCorrection,
} = vi.hoisted(() => ({
  mockExtractText: vi.fn(),
  mockClassifyExtraction: vi.fn(),
  mockValidateExtraction: vi.fn(),
  mockRunSelfCorrection: vi.fn(),
}));

vi.mock('../src/services/extraction/textExtractor.js', () => ({ extractText: mockExtractText }));
vi.mock('../src/services/extraction/financialClassifier.js', () => ({ classifyExtraction: mockClassifyExtraction }));
vi.mock('../src/services/extraction/validator.js', () => ({ validateExtraction: mockValidateExtraction }));
vi.mock('../src/services/extraction/selfCorrector.js', () => ({ runSelfCorrection: mockRunSelfCorrection }));
vi.mock('../src/middleware/orgScope.js', () => ({
  getOrgId: () => 'test-org',
  orgMiddleware: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../src/services/auditLog.js', () => ({
  AuditLog: { log: vi.fn().mockResolvedValue(undefined) },
}));

import { runExtractionPipeline } from '../src/services/extraction/pipeline.js';
import financialExtractionRouter from '../src/routes/financial-extraction.js';

const VALID_TEXT_RESULT = {
  text: 'Revenue 100M EBITDA 25M',
  sections: [{ name: 'Page 1', text: 'Revenue 100M', hasTabularData: true }],
  metadata: { format: 'pdf', pageCount: 1, fileSize: 1000, extractionMethod: 'pdf-parse', isScanned: false },
};

const VALID_STATEMENTS = [{
  statementType: 'INCOME_STATEMENT',
  unitScale: 'MILLIONS',
  currency: 'USD',
  periods: [{ period: '2023', periodType: 'HISTORICAL', confidence: 92, lineItems: [{ name: 'revenue', value: 100, category: 'revenue', isSubtotal: false }] }],
}];

const VALID_VALIDATION = {
  checks: [], errorCount: 0, warningCount: 0, infoCount: 0,
  isValid: true, flaggedItems: [], overallConfidence: 92,
};

const INVALID_VALIDATION = {
  checks: [{ rule: 'bs_balances', passed: false, severity: 'error', details: 'Mismatch', period: '2023' }],
  errorCount: 1, warningCount: 0, infoCount: 0,
  isValid: false,
  flaggedItems: [{ lineItem: 'total_assets', statementType: 'BALANCE_SHEET', period: '2023', value: 100, reason: 'Mismatch', suggestedAction: 'review' }],
  overallConfidence: 60,
};

// ── pipeline unit tests ────────────────────────────────────────────────────
describe('runExtractionPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractText.mockResolvedValue(VALID_TEXT_RESULT);
    mockClassifyExtraction.mockResolvedValue({ statements: VALID_STATEMENTS, usage: { promptTokens: 1000, completionTokens: 300 }, warnings: [], overallConfidence: 92 });
    mockValidateExtraction.mockReturnValue(VALID_VALIDATION);
    mockRunSelfCorrection.mockResolvedValue({ correctedStatements: VALID_STATEMENTS, corrections: [], finalValidation: VALID_VALIDATION, needsManualReview: false, usage: { promptTokens: 0, completionTokens: 0 } });
  });

  it('happy path → status success, statements populated', async () => {
    const result = await runExtractionPipeline('/tmp/test.pdf', 'application/pdf', 'test.pdf');
    expect(result.status).toBe('success');
    expect(result.statements).toHaveLength(1);
    expect(result.metadata.fileName).toBe('test.pdf');
  });

  it('classification returns 0 statements → status failed', async () => {
    mockClassifyExtraction.mockResolvedValue({ statements: [], usage: { promptTokens: 0, completionTokens: 0 }, warnings: [], overallConfidence: 0 });
    const result = await runExtractionPipeline('/tmp/test.pdf', 'application/pdf', 'test.pdf');
    expect(result.status).toBe('failed');
    expect(result.metadata.error).toBe('No financial statements found');
  });

  it('validation fails → self-correction runs → status partial if still failing', async () => {
    mockValidateExtraction
      .mockReturnValueOnce(INVALID_VALIDATION)
      .mockReturnValueOnce(INVALID_VALIDATION);
    mockRunSelfCorrection.mockResolvedValue({
      correctedStatements: VALID_STATEMENTS,
      corrections: [{ attempt: 1, itemsCorrected: [], validationAfter: INVALID_VALIDATION }],
      finalValidation: INVALID_VALIDATION,
      needsManualReview: true,
      usage: { promptTokens: 200, completionTokens: 50 },
    });

    const result = await runExtractionPipeline('/tmp/test.pdf', 'application/pdf', 'test.pdf');
    expect(result.status).toBe('partial');
    expect(mockRunSelfCorrection).toHaveBeenCalled();
  });
});

// ── route integration tests ────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/financial-extraction', financialExtractionRouter);
  return app;
}

describe('GET /api/financial-extraction/health', () => {
  it('returns 200 with status ok', async () => {
    const app = buildApp();
    const res = await supertest(app).get('/api/financial-extraction/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('financial-extraction');
  });
});

describe('POST /api/financial-extraction/extract — no file', () => {
  it('returns 400 when no file is uploaded', async () => {
    const app = buildApp();
    const res = await supertest(app).post('/api/financial-extraction/extract');
    expect(res.status).toBe(400);
    expect(res.body.errorCode).toBe('NO_FILE');
  });
});
