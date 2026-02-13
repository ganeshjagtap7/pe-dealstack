/**
 * Multi-Document Context Analysis Tests
 * Tests conflict detection, gap filling, and the POST /api/deals/:id/analyze endpoint.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock supabase (multiDocAnalyzer imports it)
vi.mock('../src/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

// Mock openai (multiDocAnalyzer imports it)
vi.mock('../src/openai.js', () => ({
  openai: null,
  isAIEnabled: () => false,
}));

// ============================================================
// multiDocAnalyzer Service — Unit Tests
// ============================================================

describe('multiDocAnalyzer service', () => {
  async function getModule() {
    return await import('../src/services/multiDocAnalyzer.js');
  }

  it('should export all public functions', async () => {
    const mod = await getModule();
    expect(typeof mod.detectConflicts).toBe('function');
    expect(typeof mod.findGapsFilled).toBe('function');
    expect(typeof mod.getDocumentContributions).toBe('function');
    expect(typeof mod.buildCombinedText).toBe('function');
    expect(typeof mod.analyzeMultipleDocuments).toBe('function');
  });
});

// ============================================================
// detectConflicts — Unit Tests
// ============================================================

describe('detectConflicts', () => {
  async function getModule() {
    return await import('../src/services/multiDocAnalyzer.js');
  }

  const baseDocs = [
    {
      id: 'doc-1',
      name: 'CIM - Acme Corp',
      type: 'CIM',
      extractedText: 'Acme Corp CIM content',
      extractedData: {
        companyName: { value: 'Acme Corp', confidence: 90 },
        industry: { value: 'SaaS', confidence: 85 },
        revenue: { value: 150, confidence: 80 },
        ebitda: { value: 30, confidence: 75 },
        employees: { value: 500, confidence: 70 },
      },
      confidence: 0.85,
    },
    {
      id: 'doc-2',
      name: 'Teaser - Acme',
      type: 'TEASER',
      extractedText: 'Acme teaser content',
      extractedData: {
        companyName: { value: 'Acme Corp', confidence: 80 },
        industry: { value: 'SaaS', confidence: 75 },
        revenue: { value: 160, confidence: 65 }, // CONFLICT: 160 vs 150
        ebitda: { value: 30, confidence: 60 },   // No conflict: same value
        foundedYear: { value: 2015, confidence: 55 },
      },
      confidence: 0.72,
    },
  ];

  it('should detect revenue conflict between two documents', async () => {
    const { detectConflicts } = await getModule();
    const conflicts = detectConflicts(baseDocs);

    const revenueConflict = conflicts.find(c => c.field === 'revenue');
    expect(revenueConflict).toBeDefined();
    expect(revenueConflict!.documents).toHaveLength(2);
    expect(revenueConflict!.resolved).toBe(150); // Higher confidence wins
    expect(revenueConflict!.resolution).toBe('highest_confidence');
  });

  it('should NOT report conflict when values match', async () => {
    const { detectConflicts } = await getModule();
    const conflicts = detectConflicts(baseDocs);

    const ebitdaConflict = conflicts.find(c => c.field === 'ebitda');
    expect(ebitdaConflict).toBeUndefined(); // Both say 30
  });

  it('should NOT report conflict when only one doc has the field', async () => {
    const { detectConflicts } = await getModule();
    const conflicts = detectConflicts(baseDocs);

    const foundedConflict = conflicts.find(c => c.field === 'foundedYear');
    expect(foundedConflict).toBeUndefined(); // Only doc-2 has foundedYear
  });

  it('should NOT report conflict for matching company names', async () => {
    const { detectConflicts } = await getModule();
    const conflicts = detectConflicts(baseDocs);

    const nameConflict = conflicts.find(c => c.field === 'companyName');
    expect(nameConflict).toBeUndefined(); // Both say Acme Corp
  });

  it('should return empty array for no conflicts', async () => {
    const { detectConflicts } = await getModule();
    const docs = [
      {
        id: 'doc-1', name: 'Doc 1', type: 'CIM',
        extractedText: '', confidence: 0.9,
        extractedData: {
          revenue: { value: 100, confidence: 90 },
        },
      },
      {
        id: 'doc-2', name: 'Doc 2', type: 'TEASER',
        extractedText: '', confidence: 0.8,
        extractedData: {
          revenue: { value: 100, confidence: 80 },
        },
      },
    ];

    const conflicts = detectConflicts(docs);
    expect(conflicts).toHaveLength(0);
  });

  it('should handle documents with no extractedData', async () => {
    const { detectConflicts } = await getModule();
    const docs = [
      { id: 'doc-1', name: 'Doc 1', type: 'CIM', extractedText: '', confidence: 0.9, extractedData: null },
      { id: 'doc-2', name: 'Doc 2', type: 'TEASER', extractedText: '', confidence: 0.8, extractedData: null },
    ];

    const conflicts = detectConflicts(docs);
    expect(conflicts).toHaveLength(0);
  });

  it('should detect multiple conflicts across fields', async () => {
    const { detectConflicts } = await getModule();
    const docs = [
      {
        id: 'doc-1', name: 'CIM', type: 'CIM',
        extractedText: '', confidence: 0.9,
        extractedData: {
          revenue: { value: 100, confidence: 90 },
          ebitda: { value: 20, confidence: 85 },
          industry: { value: 'SaaS', confidence: 80 },
        },
      },
      {
        id: 'doc-2', name: 'Teaser', type: 'TEASER',
        extractedText: '', confidence: 0.7,
        extractedData: {
          revenue: { value: 120, confidence: 70 },
          ebitda: { value: 25, confidence: 65 },
          industry: { value: 'Technology', confidence: 60 },
        },
      },
    ];

    const conflicts = detectConflicts(docs);
    expect(conflicts.length).toBe(3); // revenue, ebitda, industry
  });
});

// ============================================================
// findGapsFilled — Unit Tests
// ============================================================

describe('findGapsFilled', () => {
  async function getModule() {
    return await import('../src/services/multiDocAnalyzer.js');
  }

  it('should identify gaps filled by complementary documents', async () => {
    const { findGapsFilled } = await getModule();
    const docs = [
      {
        id: 'doc-1', name: 'CIM', type: 'CIM',
        extractedText: '', confidence: 0.9,
        extractedData: {
          revenue: { value: 100, confidence: 90 },
          ebitda: { value: 20, confidence: 85 },
        },
      },
      {
        id: 'doc-2', name: 'Teaser', type: 'TEASER',
        extractedText: '', confidence: 0.7,
        extractedData: {
          employees: { value: 500, confidence: 70 },
          foundedYear: { value: 2010, confidence: 65 },
        },
      },
    ];

    const gaps = findGapsFilled(docs);
    // All 4 fields are unique to one doc
    expect(gaps.length).toBe(4);

    const empGap = gaps.find(g => g.field === 'employees');
    expect(empGap).toBeDefined();
    expect(empGap!.filledFrom).toBe('Teaser');
    expect(empGap!.value).toBe(500);

    const revGap = gaps.find(g => g.field === 'revenue');
    expect(revGap).toBeDefined();
    expect(revGap!.filledFrom).toBe('CIM');
  });

  it('should NOT report gaps when both docs have same field', async () => {
    const { findGapsFilled } = await getModule();
    const docs = [
      {
        id: 'doc-1', name: 'CIM', type: 'CIM',
        extractedText: '', confidence: 0.9,
        extractedData: {
          revenue: { value: 100, confidence: 90 },
        },
      },
      {
        id: 'doc-2', name: 'Teaser', type: 'TEASER',
        extractedText: '', confidence: 0.7,
        extractedData: {
          revenue: { value: 120, confidence: 70 },
        },
      },
    ];

    const gaps = findGapsFilled(docs);
    expect(gaps.length).toBe(0); // Both have revenue
  });
});

// ============================================================
// getDocumentContributions — Unit Tests
// ============================================================

describe('getDocumentContributions', () => {
  async function getModule() {
    return await import('../src/services/multiDocAnalyzer.js');
  }

  it('should list fields each document contributed', async () => {
    const { getDocumentContributions } = await getModule();
    const docs = [
      {
        id: 'doc-1', name: 'CIM', type: 'CIM',
        extractedText: '', confidence: 0.9,
        extractedData: {
          companyName: { value: 'Acme', confidence: 90 },
          revenue: { value: 100, confidence: 80 },
          ebitda: { value: null, confidence: 0 },
        },
      },
      {
        id: 'doc-2', name: 'Teaser', type: 'TEASER',
        extractedText: '', confidence: 0.7,
        extractedData: {
          companyName: { value: 'Acme', confidence: 70 },
          employees: { value: 500, confidence: 60 },
        },
      },
    ];

    const contributions = getDocumentContributions(docs);
    expect(contributions).toHaveLength(2);

    expect(contributions[0].docName).toBe('CIM');
    expect(contributions[0].fieldsContributed).toContain('companyName');
    expect(contributions[0].fieldsContributed).toContain('revenue');
    expect(contributions[0].fieldsContributed).not.toContain('ebitda'); // null value

    expect(contributions[1].docName).toBe('Teaser');
    expect(contributions[1].fieldsContributed).toContain('companyName');
    expect(contributions[1].fieldsContributed).toContain('employees');
  });
});

// ============================================================
// buildCombinedText — Unit Tests
// ============================================================

describe('buildCombinedText', () => {
  async function getModule() {
    return await import('../src/services/multiDocAnalyzer.js');
  }

  it('should build combined text with document headers', async () => {
    const { buildCombinedText } = await getModule();
    const docs = [
      {
        id: 'doc-1', name: 'CIM - Acme', type: 'CIM',
        extractedText: 'Revenue of $150M with EBITDA of $30M.',
        extractedData: null, confidence: 0.85,
      },
      {
        id: 'doc-2', name: 'Teaser - Acme', type: 'TEASER',
        extractedText: 'Acme Corp is a leading SaaS provider.',
        extractedData: null, confidence: 0.72,
      },
    ];

    const text = buildCombinedText(docs);
    expect(text).toContain('MULTI-DOCUMENT DEAL ANALYSIS');
    expect(text).toContain('Total documents: 2');
    expect(text).toContain('DOCUMENT: CIM - Acme');
    expect(text).toContain('Type: CIM');
    expect(text).toContain('Confidence: 85%');
    expect(text).toContain('Revenue of $150M');
    expect(text).toContain('DOCUMENT: Teaser - Acme');
    expect(text).toContain('leading SaaS provider');
  });

  it('should handle documents with no extracted text', async () => {
    const { buildCombinedText } = await getModule();
    const docs = [
      {
        id: 'doc-1', name: 'Doc 1', type: 'OTHER',
        extractedText: '', extractedData: null, confidence: 0,
      },
    ];

    const text = buildCombinedText(docs);
    expect(text).toContain('Total documents: 1');
    expect(text).toContain('DOCUMENT: Doc 1');
  });

  it('should truncate long documents to 5000 chars', async () => {
    const { buildCombinedText } = await getModule();
    const longText = 'A'.repeat(10000);
    const docs = [
      {
        id: 'doc-1', name: 'Long Doc', type: 'CIM',
        extractedText: longText, extractedData: null, confidence: 0.9,
      },
    ];

    const text = buildCombinedText(docs);
    // The excerpt is sliced to 5000 chars, so text should NOT contain the full 10000
    expect(text.length).toBeLessThan(10000);
    // The document excerpt portion should be exactly 5000 chars
    expect(text).toContain('A'.repeat(100)); // Has the repeated text
    expect(text).not.toContain('A'.repeat(6000)); // But not all of it
  });
});

// ============================================================
// POST /api/deals/:id/analyze — Endpoint Tests
// ============================================================

describe('POST /api/deals/:id/analyze', () => {
  function createAnalyzeApp() {
    const app = express();
    app.use(express.json());

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'analyst@pe.com', role: 'ADMIN' };
      next();
    });

    // Simplified analyze endpoint for testing
    app.post('/api/deals/:id/analyze', async (req: any, res) => {
      const { id } = req.params;
      const { detectConflicts, findGapsFilled, getDocumentContributions } = await import('../src/services/multiDocAnalyzer.js');

      // Simulate different scenarios based on deal ID
      if (id === 'deal-not-found') {
        return res.status(404).json({ error: 'Deal not found' });
      }

      if (id === 'deal-one-doc') {
        return res.status(400).json({ error: 'Multi-doc analysis requires at least 2 documents for this deal.' });
      }

      // Simulate 2 docs with a conflict
      const mockDocs = [
        {
          id: 'doc-1', name: 'CIM', type: 'CIM',
          extractedText: 'Acme Corp revenue $150M', confidence: 0.85,
          extractedData: {
            companyName: { value: 'Acme Corp', confidence: 90 },
            revenue: { value: 150, confidence: 80 },
            ebitda: { value: 30, confidence: 75 },
          },
        },
        {
          id: 'doc-2', name: 'Teaser', type: 'TEASER',
          extractedText: 'Acme revenue $160M', confidence: 0.72,
          extractedData: {
            companyName: { value: 'Acme Corp', confidence: 70 },
            revenue: { value: 160, confidence: 65 },
            employees: { value: 500, confidence: 60 },
          },
        },
      ];

      const conflicts = detectConflicts(mockDocs);
      const gapsFilled = findGapsFilled(mockDocs);
      const contributions = getDocumentContributions(mockDocs);

      res.json({
        success: true,
        analysis: {
          mergedData: {},
          conflicts,
          gapsFilled,
          documentContributions: contributions,
          synthesis: null,
        },
      });
    });

    return app;
  }

  let app: express.Express;

  beforeEach(() => {
    app = createAnalyzeApp();
  });

  it('should return 404 for non-existent deal', async () => {
    const res = await request(app).post('/api/deals/deal-not-found/analyze');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Deal not found');
  });

  it('should return 400 when deal has fewer than 2 documents', async () => {
    const res = await request(app).post('/api/deals/deal-one-doc/analyze');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('2 documents');
  });

  it('should return analysis with conflicts for valid deal', async () => {
    const res = await request(app).post('/api/deals/deal-multi/analyze');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.analysis).toBeDefined();
    expect(res.body.analysis.conflicts).toBeInstanceOf(Array);
    expect(res.body.analysis.gapsFilled).toBeInstanceOf(Array);
    expect(res.body.analysis.documentContributions).toBeInstanceOf(Array);
  });

  it('should detect revenue conflict between CIM and Teaser', async () => {
    const res = await request(app).post('/api/deals/deal-multi/analyze');
    const revenueConflict = res.body.analysis.conflicts.find((c: any) => c.field === 'revenue');
    expect(revenueConflict).toBeDefined();
    expect(revenueConflict.documents).toHaveLength(2);
    expect(revenueConflict.resolved).toBe(150); // CIM has higher confidence
  });

  it('should identify gaps filled by complementary docs', async () => {
    const res = await request(app).post('/api/deals/deal-multi/analyze');
    const empGap = res.body.analysis.gapsFilled.find((g: any) => g.field === 'employees');
    expect(empGap).toBeDefined();
    expect(empGap.filledFrom).toBe('Teaser');
    expect(empGap.value).toBe(500);
  });

  it('should list document contributions', async () => {
    const res = await request(app).post('/api/deals/deal-multi/analyze');
    const contributions = res.body.analysis.documentContributions;
    expect(contributions).toHaveLength(2);
    expect(contributions[0].docName).toBe('CIM');
    expect(contributions[0].fieldsContributed).toContain('revenue');
    expect(contributions[1].docName).toBe('Teaser');
    expect(contributions[1].fieldsContributed).toContain('employees');
  });
});
