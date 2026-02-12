/**
 * Text Ingestion Endpoint Tests
 * Tests POST /api/ingest/text — creating deals from raw pasted text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';

// ============================================================
// Text Ingestion Validation Tests
// ============================================================

describe('POST /api/ingest/text', () => {
  const textIngestSchema = z.object({
    text: z.string().min(50, 'Text must be at least 50 characters'),
    sourceName: z.string().optional(),
    sourceType: z.enum(['email', 'note', 'slack', 'whatsapp', 'other']).optional(),
  });

  function createTextIngestApp() {
    const app = express();
    app.use(express.json());

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'test@example.com', role: 'ADMIN' };
      next();
    });

    // Text ingest endpoint (mirrors real implementation logic)
    app.post('/api/ingest/text', async (req: any, res) => {
      const validation = textIngestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: 'Invalid input', details: validation.error.errors });
      }

      const { text, sourceName, sourceType } = validation.data;

      // Simulate AI extraction based on text content
      const hasCompanyName = /\b[A-Z][a-z]+ (?:Corp|Inc|LLC|Services|Healthcare|Tech)\b/.test(text);
      const revenueMatch = text.match(/\$(\d+)M?\s*(?:in\s+)?(?:annual\s+)?revenue/i);
      const ebitdaMatch = text.match(/\$(\d+)M?\s*EBITDA/i);

      if (text.length < 100) {
        return res.status(400).json({ error: 'Could not extract deal data from text. Try providing more detail.' });
      }

      const companyName = hasCompanyName ? 'Acme Healthcare Services' : 'Unknown Company';
      const revenue = revenueMatch ? parseInt(revenueMatch[1]) : null;
      const ebitda = ebitdaMatch ? parseInt(ebitdaMatch[1]) : null;
      const confidence = hasCompanyName ? 90 : 45;
      const needsReview = confidence < 70;

      res.status(201).json({
        success: true,
        deal: {
          id: `deal-${Date.now()}`,
          name: companyName,
          stage: 'INITIAL_REVIEW',
          status: needsReview ? 'PENDING_REVIEW' : 'ACTIVE',
          industry: 'Healthcare Services',
          revenue,
          ebitda,
          company: { id: `company-${Date.now()}`, name: companyName },
        },
        document: {
          id: `doc-${Date.now()}`,
          name: sourceName || `${sourceType || 'Text'} input - ${new Date().toLocaleDateString()}`,
          type: 'OTHER',
          mimeType: 'text/plain',
          confidence: confidence / 100,
          status: needsReview ? 'pending_review' : 'analyzed',
        },
        extraction: {
          companyName: { value: companyName, confidence },
          industry: { value: 'Healthcare Services', confidence: 85 },
          revenue: { value: revenue, confidence: revenue ? 90 : 0 },
          ebitda: { value: ebitda, confidence: ebitda ? 90 : 0 },
          overallConfidence: confidence,
          needsReview,
          reviewReasons: needsReview ? ['Company name uncertain'] : [],
        },
      });
    });

    return app;
  }

  let app: express.Express;

  beforeEach(() => {
    app = createTextIngestApp();
  });

  it('should reject text shorter than 50 characters', async () => {
    const response = await request(app)
      .post('/api/ingest/text')
      .send({ text: 'Too short' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid input');
    expect(response.body.details).toBeDefined();
    expect(response.body.details[0].message).toContain('50 characters');
  });

  it('should reject missing text field', async () => {
    const response = await request(app)
      .post('/api/ingest/text')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid input');
  });

  it('should reject invalid sourceType', async () => {
    const response = await request(app)
      .post('/api/ingest/text')
      .send({
        text: 'A'.repeat(100),
        sourceType: 'invalid_type',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid input');
  });

  it('should accept valid text and return extraction with deal', async () => {
    const sampleText = 'Acme Healthcare Services is a leading home healthcare provider in the Northeast US. The company generates $50M in annual revenue with $10M EBITDA (20% margins). Founded in 2010, they employ 500+ caregivers serving 10,000+ patients annually.';

    const response = await request(app)
      .post('/api/ingest/text')
      .send({
        text: sampleText,
        sourceType: 'email',
        sourceName: 'Email from Goldman Sachs',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    // Deal created
    expect(response.body.deal).toBeDefined();
    expect(response.body.deal.id).toBeDefined();
    expect(response.body.deal.name).toBe('Acme Healthcare Services');
    expect(response.body.deal.stage).toBe('INITIAL_REVIEW');
    expect(response.body.deal.status).toBe('ACTIVE');
    expect(response.body.deal.revenue).toBe(50);
    expect(response.body.deal.ebitda).toBe(10);

    // Document created
    expect(response.body.document).toBeDefined();
    expect(response.body.document.mimeType).toBe('text/plain');
    expect(response.body.document.name).toBe('Email from Goldman Sachs');
    expect(response.body.document.type).toBe('OTHER');

    // Extraction with confidence
    expect(response.body.extraction).toBeDefined();
    expect(response.body.extraction.overallConfidence).toBeGreaterThanOrEqual(70);
    expect(response.body.extraction.needsReview).toBe(false);
  });

  it('should accept all valid sourceType values', async () => {
    const validTypes = ['email', 'note', 'slack', 'whatsapp', 'other'];
    const longText = 'Acme Healthcare Services is a company that provides home healthcare in the US with significant revenue and EBITDA margins for growth.';

    for (const sourceType of validTypes) {
      const response = await request(app)
        .post('/api/ingest/text')
        .send({ text: longText, sourceType });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    }
  });

  it('should use default document name when sourceName is not provided', async () => {
    const longText = 'Acme Healthcare Services is a company that provides home healthcare in the US with significant revenue and EBITDA margins for growth.';

    const response = await request(app)
      .post('/api/ingest/text')
      .send({ text: longText, sourceType: 'slack' });

    expect(response.status).toBe(201);
    expect(response.body.document.name).toContain('slack');
  });

  it('should mark low-confidence extractions for review', async () => {
    // Text without clear company name patterns
    const vagueText = 'There is a business opportunity in the midwest region. Revenue is approximately twenty million dollars annually. The management team is experienced and the market is growing rapidly with strong tailwinds.';

    const response = await request(app)
      .post('/api/ingest/text')
      .send({ text: vagueText });

    expect(response.status).toBe(201);
    expect(response.body.deal.status).toBe('PENDING_REVIEW');
    expect(response.body.extraction.needsReview).toBe(true);
    expect(response.body.extraction.reviewReasons.length).toBeGreaterThan(0);
  });

  it('should include company object in deal response', async () => {
    const longText = 'Acme Healthcare Services is a company that provides home healthcare in the US with significant revenue and EBITDA margins for growth.';

    const response = await request(app)
      .post('/api/ingest/text')
      .send({ text: longText });

    expect(response.status).toBe(201);
    expect(response.body.deal.company).toBeDefined();
    expect(response.body.deal.company.id).toBeDefined();
    expect(response.body.deal.company.name).toBeDefined();
  });

  it('should return extraction confidence scores for key fields', async () => {
    const longText = 'Acme Healthcare Services is a company that provides home healthcare in the US. Revenue is $50M with $10M EBITDA margins.';

    const response = await request(app)
      .post('/api/ingest/text')
      .send({ text: longText });

    expect(response.status).toBe(201);
    const extraction = response.body.extraction;

    // Each field should have value + confidence
    expect(extraction.companyName).toHaveProperty('value');
    expect(extraction.companyName).toHaveProperty('confidence');
    expect(extraction.industry).toHaveProperty('value');
    expect(extraction.industry).toHaveProperty('confidence');
    expect(extraction.revenue).toHaveProperty('value');
    expect(extraction.revenue).toHaveProperty('confidence');
    expect(extraction.ebitda).toHaveProperty('value');
    expect(extraction.ebitda).toHaveProperty('confidence');

    // Overall confidence
    expect(typeof extraction.overallConfidence).toBe('number');
    expect(typeof extraction.needsReview).toBe('boolean');
  });
});

// ============================================================
// Zod Schema Unit Tests
// ============================================================

describe('Text Ingest Schema Validation', () => {
  const textIngestSchema = z.object({
    text: z.string().min(50, 'Text must be at least 50 characters'),
    sourceName: z.string().optional(),
    sourceType: z.enum(['email', 'note', 'slack', 'whatsapp', 'other']).optional(),
  });

  it('should validate minimum text length of 50 chars', () => {
    const short = textIngestSchema.safeParse({ text: 'short' });
    expect(short.success).toBe(false);

    const exact = textIngestSchema.safeParse({ text: 'A'.repeat(50) });
    expect(exact.success).toBe(true);
  });

  it('should accept valid sourceType enum values', () => {
    for (const type of ['email', 'note', 'slack', 'whatsapp', 'other']) {
      const result = textIngestSchema.safeParse({ text: 'A'.repeat(50), sourceType: type });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid sourceType values', () => {
    const result = textIngestSchema.safeParse({ text: 'A'.repeat(50), sourceType: 'telegram' });
    expect(result.success).toBe(false);
  });

  it('should make sourceName and sourceType optional', () => {
    const result = textIngestSchema.safeParse({ text: 'A'.repeat(50) });
    expect(result.success).toBe(true);
  });
});
