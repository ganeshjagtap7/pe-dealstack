/**
 * pipeline.test.ts — Subtask 5: End-to-end pipeline + API route
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

vi.mock('../src/services/extraction/financialClassifier.js', () => ({
  classifyExtraction: vi.fn().mockResolvedValue({
    statements: [{
      statementType: 'INCOME_STATEMENT',
      unitScale: 'MILLIONS',
      currency: 'USD',
      periods: [{ period: '2023', periodType: 'HISTORICAL', confidence: 95, lineItems: [
        { name: 'revenue', value: 100, category: 'revenue', isSubtotal: false },
        { name: 'ebitda', value: 25, category: 'margin', isSubtotal: true }
      ] }]
    }],
    usage: { promptTokens: 500, completionTokens: 200 },
    warnings: [],
    overallConfidence: 95,
  }),
}));

vi.mock('../src/services/extraction/textExtractor.js', () => ({
  extractText: vi.fn().mockResolvedValue({
    text: 'Revenue was $100M and EBITDA was $25M in 2023.',
    sections: [{ name: 'Page 1', text: 'Revenue was $100M and EBITDA was $25M in 2023.', hasTabularData: true }],
    metadata: { format: 'pdf', pageCount: 1, fileSize: 1000, extractionMethod: 'pdf-parse', isScanned: false },
  }),
}));

vi.mock('../src/middleware/auth.js', () => ({
  authMiddleware: (req: { user: { id: string; }; }, res: any, next: () => void) => { req.user = { id: 'test-user' }; next(); },
}));

vi.mock('../src/middleware/orgScope.js', () => ({
  orgMiddleware: (req: { orgId: string; }, res: any, next: () => void) => { req.orgId = 'test-org'; next(); },
  getOrgId: () => 'test-org',
  verifyDealAccess: () => Promise.resolve(true),
}));

describe('Subtask 5 — End-to-end pipeline', () => {
  it('POST /api/financial-extraction/extract returns 200', async () => {
    const response = await request(app)
      .post('/api/financial-extraction/extract')
      .set('Authorization', 'Bearer mock')
      .attach('file', Buffer.from('Revenue was $100M and EBITDA was $25M in 2023.'), 'test.pdf');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('success');
  });

  it('GET /api/financial-extraction/health returns ok', async () => {
    const response = await request(app).get('/api/financial-extraction/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
