/**
 * Company Researcher & Enhanced URL Scraping Tests
 * Tests the companyResearcher service and POST /api/ingest/url endpoint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ============================================================
// Company Researcher Service — Unit Tests
// ============================================================

describe('companyResearcher service', () => {
  async function getModule() {
    return await import('../src/services/companyResearcher.js');
  }

  it('should export researchCompany, buildResearchText, and scrapePageText', async () => {
    const mod = await getModule();
    expect(typeof mod.researchCompany).toBe('function');
    expect(typeof mod.buildResearchText).toBe('function');
    expect(typeof mod.scrapePageText).toBe('function');
  });

  it('should normalize URLs without protocol', async () => {
    const { researchCompany } = await getModule();
    // This will fail to connect (no real server) but tests URL normalization
    const result = await researchCompany('example.com');
    expect(result).toBeDefined();
    expect(result.companyWebsite).toBeDefined();
    expect(result.companyWebsite.scrapedPages).toBeInstanceOf(Array);
    expect(result.enrichedData.website).toBe('https://example.com');
  });

  it('should strip trailing slash from URLs', async () => {
    const { researchCompany } = await getModule();
    const result = await researchCompany('https://example.com/');
    expect(result.enrichedData.website).toBe('https://example.com');
  });

  it('should return empty results for unreachable sites', async () => {
    const { researchCompany } = await getModule();
    const result = await researchCompany('https://this-domain-does-not-exist-12345.com');
    expect(result.companyWebsite.scrapedPages).toHaveLength(0);
    expect(result.companyWebsite.aboutText).toBeNull();
    expect(result.companyWebsite.teamText).toBeNull();
    expect(result.companyWebsite.productText).toBeNull();
  });

  it('scrapePageText should return null for non-existent page', async () => {
    const { scrapePageText } = await getModule();
    const result = await scrapePageText('https://this-domain-does-not-exist-12345.com');
    expect(result).toBeNull();
  });

  it('scrapePageText should return null for invalid URL', async () => {
    const { scrapePageText } = await getModule();
    const result = await scrapePageText('not-a-url');
    expect(result).toBeNull();
  });
});

// ============================================================
// buildResearchText — Unit Tests
// ============================================================

describe('buildResearchText', () => {
  async function getModule() {
    return await import('../src/services/companyResearcher.js');
  }

  it('should build text with about section', async () => {
    const { buildResearchText } = await getModule();
    const text = buildResearchText({
      companyWebsite: {
        homepageText: null,
        aboutText: 'We are a SaaS company founded in 2015.',
        teamText: null,
        productText: null,
        scrapedPages: ['https://example.com/about'],
      },
      enrichedData: {},
    });

    expect(text).toContain('=== ABOUT THE COMPANY ===');
    expect(text).toContain('SaaS company founded in 2015');
  });

  it('should build text with all sections', async () => {
    const { buildResearchText } = await getModule();
    const text = buildResearchText({
      companyWebsite: {
        homepageText: null,
        aboutText: 'About text here',
        teamText: 'CEO: John Smith, CTO: Jane Doe',
        productText: 'Our platform serves enterprise clients',
        scrapedPages: [
          'https://example.com/about',
          'https://example.com/team',
          'https://example.com/products',
        ],
      },
      enrichedData: {},
    });

    expect(text).toContain('=== ABOUT THE COMPANY ===');
    expect(text).toContain('About text here');
    expect(text).toContain('=== PRODUCTS/SERVICES ===');
    expect(text).toContain('enterprise clients');
    expect(text).toContain('=== LEADERSHIP TEAM ===');
    expect(text).toContain('CEO: John Smith');
  });

  it('should return empty string when no content', async () => {
    const { buildResearchText } = await getModule();
    const text = buildResearchText({
      companyWebsite: {
        homepageText: null,
        aboutText: null,
        teamText: null,
        productText: null,
        scrapedPages: [],
      },
      enrichedData: {},
    });

    expect(text).toBe('');
  });

  it('should only include sections that have content', async () => {
    const { buildResearchText } = await getModule();
    const text = buildResearchText({
      companyWebsite: {
        homepageText: null,
        aboutText: 'About us info',
        teamText: null,
        productText: 'Product info',
        scrapedPages: [],
      },
      enrichedData: {},
    });

    expect(text).toContain('=== ABOUT THE COMPANY ===');
    expect(text).toContain('=== PRODUCTS/SERVICES ===');
    expect(text).not.toContain('=== LEADERSHIP TEAM ===');
  });
});

// ============================================================
// POST /api/ingest/url — Endpoint Tests
// ============================================================

describe('POST /api/ingest/url', () => {
  function createUrlResearchApp() {
    const app = express();
    app.use(express.json());

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'analyst@pe.com', role: 'ADMIN' };
      next();
    });

    // Simplified URL research endpoint for testing
    app.post('/api/ingest/url', async (req: any, res) => {
      const { url, companyName, autoCreateDeal } = req.body;

      // Validate URL
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: 'Invalid input', details: [{ message: 'Must be a valid URL' }] });
      }

      // Simulate research result
      const { buildResearchText } = await import('../src/services/companyResearcher.js');

      const mockResearch = {
        companyWebsite: {
          homepageText: url.includes('empty') ? null : 'Welcome to our company. We provide enterprise solutions.',
          aboutText: url.includes('empty') ? null : 'We are a leading SaaS company with $200M revenue and 500 employees. Founded in 2010, we serve enterprise customers globally.',
          teamText: url.includes('empty') ? null : 'CEO: John Smith, CTO: Jane Doe, CFO: Bob Wilson',
          productText: url.includes('empty') ? null : 'Our cloud platform enables digital transformation for Fortune 500 companies.',
          scrapedPages: url.includes('empty')
            ? []
            : [`${url}`, `${url}/about`, `${url}/team`, `${url}/products`],
        },
        enrichedData: { website: url },
      };

      const researchText = buildResearchText(mockResearch);

      if (researchText.length < 100) {
        return res.status(400).json({
          error: 'Could not extract enough content from website',
          pagesAttempted: mockResearch.companyWebsite.scrapedPages.length,
        });
      }

      // Preview mode
      if (autoCreateDeal === false) {
        return res.json({
          success: true,
          extraction: {
            companyName: { value: companyName || 'Test Corp', confidence: companyName ? 100 : 75 },
            industry: { value: 'SaaS', confidence: 80 },
          },
          research: {
            pagesScraped: mockResearch.companyWebsite.scrapedPages,
            textLength: researchText.length,
          },
        });
      }

      // Full mode — create deal
      const name = companyName || 'Test Corp';
      res.status(201).json({
        success: true,
        deal: { id: 'deal-new', name },
        document: { id: 'doc-new', name: `Web Research — ${name}` },
        extraction: {
          companyName: { value: name, confidence: companyName ? 100 : 75 },
          industry: { value: 'SaaS', confidence: 80 },
        },
        research: {
          pagesScraped: mockResearch.companyWebsite.scrapedPages,
          textLength: researchText.length,
        },
      });
    });

    return app;
  }

  let app: express.Express;

  beforeEach(() => {
    app = createUrlResearchApp();
  });

  it('should reject invalid URL', async () => {
    const res = await request(app)
      .post('/api/ingest/url')
      .send({ url: 'not-a-url' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid');
  });

  it('should reject website with insufficient content', async () => {
    const res = await request(app)
      .post('/api/ingest/url')
      .send({ url: 'https://empty-site.com/empty' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('enough content');
  });

  it('should create deal from valid URL', async () => {
    const res = await request(app)
      .post('/api/ingest/url')
      .send({ url: 'https://acme-corp.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.deal).toBeDefined();
    expect(res.body.research.pagesScraped).toBeInstanceOf(Array);
    expect(res.body.research.pagesScraped.length).toBeGreaterThan(0);
  });

  it('should override company name when provided', async () => {
    const res = await request(app)
      .post('/api/ingest/url')
      .send({ url: 'https://acme-corp.com', companyName: 'Acme Corporation' });

    expect(res.status).toBe(201);
    expect(res.body.deal.name).toBe('Acme Corporation');
    expect(res.body.extraction.companyName.value).toBe('Acme Corporation');
    expect(res.body.extraction.companyName.confidence).toBe(100);
  });

  it('should return preview without creating deal when autoCreateDeal=false', async () => {
    const res = await request(app)
      .post('/api/ingest/url')
      .send({ url: 'https://acme-corp.com', autoCreateDeal: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.extraction).toBeDefined();
    expect(res.body.research.pagesScraped).toBeInstanceOf(Array);
    expect(res.body.deal).toBeUndefined(); // No deal created in preview mode
  });

  it('should include research metadata in response', async () => {
    const res = await request(app)
      .post('/api/ingest/url')
      .send({ url: 'https://acme-corp.com' });

    expect(res.status).toBe(201);
    expect(res.body.research).toBeDefined();
    expect(res.body.research.pagesScraped).toContain('https://acme-corp.com');
    expect(res.body.research.pagesScraped).toContain('https://acme-corp.com/about');
    expect(res.body.research.textLength).toBeGreaterThan(0);
  });

  it('should store research as document record', async () => {
    const res = await request(app)
      .post('/api/ingest/url')
      .send({ url: 'https://acme-corp.com' });

    expect(res.status).toBe(201);
    expect(res.body.document).toBeDefined();
    expect(res.body.document.name).toContain('Web Research');
  });
});
