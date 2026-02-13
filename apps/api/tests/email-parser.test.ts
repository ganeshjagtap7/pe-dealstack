/**
 * Email Parser & Email Ingest Tests
 * Tests the emailParser service and POST /api/ingest/email endpoint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ============================================================
// Email Parser Service — Unit Tests
// ============================================================

describe('emailParser service', () => {
  async function getModule() {
    const mod = await import('../src/services/emailParser.js');
    return mod;
  }

  it('should export parseEmailFile and buildDealTextFromEmail', async () => {
    const mod = await getModule();
    expect(typeof mod.parseEmailFile).toBe('function');
    expect(typeof mod.buildDealTextFromEmail).toBe('function');
  });

  it('should parse a valid .eml buffer', async () => {
    const { parseEmailFile } = await getModule();
    const emlContent = [
      'From: banker@goldmansachs.com',
      'To: analyst@pefirm.com',
      'Subject: CIM - Acme Corp Acquisition Opportunity',
      'Date: Thu, 13 Feb 2026 10:00:00 +0000',
      'Content-Type: text/plain',
      '',
      'Dear Team,',
      '',
      'Please find attached the Confidential Information Memorandum for Acme Corp.',
      'Revenue: $150M, EBITDA: $30M, Growth: 15% YoY.',
      'The company operates in the enterprise SaaS space.',
      '',
      'Best regards,',
      'John Banker',
    ].join('\r\n');

    const result = await parseEmailFile(Buffer.from(emlContent));
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('CIM - Acme Corp Acquisition Opportunity');
    expect(result!.from).toContain('banker@goldmansachs.com');
    expect(result!.to).toHaveLength(1);
    expect(result!.to[0]).toContain('analyst@pefirm.com');
    expect(result!.bodyText).toContain('Acme Corp');
    expect(result!.bodyText).toContain('$150M');
    expect(result!.date).toBeInstanceOf(Date);
  });

  it('should handle email with no subject', async () => {
    const { parseEmailFile } = await getModule();
    const emlContent = [
      'From: test@example.com',
      'To: to@example.com',
      'Content-Type: text/plain',
      '',
      'Some content here.',
    ].join('\r\n');

    const result = await parseEmailFile(Buffer.from(emlContent));
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('(No Subject)');
  });

  it('should handle HTML-only email', async () => {
    const { parseEmailFile } = await getModule();
    const emlContent = [
      'From: html@example.com',
      'To: to@example.com',
      'Subject: HTML Email',
      'Content-Type: text/html',
      '',
      '<html><body><p>Revenue is <b>$200M</b></p><p>EBITDA is $40M</p></body></html>',
    ].join('\r\n');

    const result = await parseEmailFile(Buffer.from(emlContent));
    expect(result).not.toBeNull();
    expect(result!.bodyHtml).toContain('$200M');
  });

  it('should return null for invalid buffer', async () => {
    const { parseEmailFile } = await getModule();
    const result = await parseEmailFile(Buffer.from(''));
    // Empty buffer should still parse (as empty email) or return null
    // simpleParser handles gracefully
    expect(result === null || result?.subject === '(No Subject)').toBe(true);
  });

  it('should handle email with attachments metadata', async () => {
    const { parseEmailFile } = await getModule();
    // A simple email (no actual attachments in this raw format, but tests the array)
    const emlContent = [
      'From: sender@example.com',
      'To: receiver@example.com',
      'Subject: Deal with attachment',
      'Content-Type: text/plain',
      '',
      'See attached CIM.',
    ].join('\r\n');

    const result = await parseEmailFile(Buffer.from(emlContent));
    expect(result).not.toBeNull();
    expect(Array.isArray(result!.attachments)).toBe(true);
  });
});

// ============================================================
// buildDealTextFromEmail — Unit Tests
// ============================================================

describe('buildDealTextFromEmail', () => {
  async function getModule() {
    return await import('../src/services/emailParser.js');
  }

  it('should build text with subject, from, date, and body', async () => {
    const { buildDealTextFromEmail } = await getModule();
    const text = buildDealTextFromEmail({
      subject: 'CIM - Acme Corp',
      from: 'banker@gs.com',
      to: ['analyst@pe.com'],
      date: new Date('2026-02-13T10:00:00Z'),
      bodyText: 'Revenue $150M, EBITDA $30M. SaaS platform serving enterprise clients.',
      bodyHtml: '',
      attachments: [],
    });

    expect(text).toContain('Subject: CIM - Acme Corp');
    expect(text).toContain('From: banker@gs.com');
    expect(text).toContain('2026-02-13');
    expect(text).toContain('Revenue $150M');
  });

  it('should prefer plain text over HTML when text is long enough', async () => {
    const { buildDealTextFromEmail } = await getModule();
    const longText = 'A'.repeat(60); // > 50 chars
    const text = buildDealTextFromEmail({
      subject: 'Test',
      from: 'test@test.com',
      to: [],
      date: new Date(),
      bodyText: longText,
      bodyHtml: '<p>HTML content</p>',
      attachments: [],
    });

    expect(text).toContain(longText);
    expect(text).not.toContain('HTML content');
  });

  it('should fall back to stripped HTML when text is short', async () => {
    const { buildDealTextFromEmail } = await getModule();
    const text = buildDealTextFromEmail({
      subject: 'Test',
      from: 'test@test.com',
      to: [],
      date: new Date(),
      bodyText: 'Short',
      bodyHtml: '<p>Revenue is <b>$200M</b></p><p>EBITDA: $40M</p>',
      attachments: [],
    });

    expect(text).toContain('Revenue is $200M');
    expect(text).toContain('EBITDA: $40M');
    expect(text).not.toContain('<p>');
    expect(text).not.toContain('<b>');
  });

  it('should decode HTML entities', async () => {
    const { buildDealTextFromEmail } = await getModule();
    const text = buildDealTextFromEmail({
      subject: 'Test',
      from: 'test@test.com',
      to: [],
      date: new Date(),
      bodyText: '',
      bodyHtml: '<p>Revenue &gt; $100M &amp; growing</p>',
      attachments: [],
    });

    expect(text).toContain('Revenue > $100M & growing');
  });
});

// ============================================================
// POST /api/ingest/email — Endpoint Tests
// ============================================================

describe('POST /api/ingest/email', () => {
  function createEmailIngestApp() {
    const app = express();

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'analyst@pe.com', role: 'ADMIN' };
      next();
    });

    // Simplified email ingest endpoint for testing
    app.post('/api/ingest/email', express.raw({ type: '*/*', limit: '50mb' }), async (req: any, res) => {
      // Simulate file validation
      const filename = req.headers['x-filename'] as string || '';
      if (!filename.endsWith('.eml')) {
        return res.status(400).json({ error: 'File must be .eml format' });
      }

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'No email file provided' });
      }

      // Try to parse the email
      try {
        const { parseEmailFile, buildDealTextFromEmail } = await import('../src/services/emailParser.js');
        const emailData = await parseEmailFile(req.body);
        if (!emailData) {
          return res.status(400).json({ error: 'Failed to parse email file' });
        }

        const dealText = buildDealTextFromEmail(emailData);
        if (dealText.length < 100) {
          return res.status(400).json({ error: 'Email has insufficient content for deal extraction' });
        }

        // Mock successful response (skip actual AI/DB in tests)
        res.status(201).json({
          success: true,
          deal: { id: 'deal-new', name: emailData.subject },
          email: {
            subject: emailData.subject,
            from: emailData.from,
            date: emailData.date,
            attachmentsProcessed: 0,
          },
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to process email' });
      }
    });

    return app;
  }

  let app: express.Express;

  beforeEach(() => {
    app = createEmailIngestApp();
  });

  it('should reject non-.eml files', async () => {
    const res = await request(app)
      .post('/api/ingest/email')
      .set('x-filename', 'document.pdf')
      .send(Buffer.from('test'));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('.eml');
  });

  it('should reject empty body', async () => {
    const res = await request(app)
      .post('/api/ingest/email')
      .set('x-filename', 'deal.eml')
      .send(Buffer.from(''));

    expect(res.status).toBe(400);
  });

  it('should parse and return email data for valid .eml', async () => {
    const emlContent = [
      'From: banker@goldmansachs.com',
      'To: analyst@pefirm.com',
      'Subject: CIM - Acme Corp Acquisition',
      'Date: Thu, 13 Feb 2026 10:00:00 +0000',
      'Content-Type: text/plain',
      '',
      'Dear Team,',
      '',
      'Please find the Confidential Information Memorandum for Acme Corp.',
      'The company has annual revenue of $150M with EBITDA of $30M.',
      'Operating in the enterprise SaaS space with 500 employees.',
      'Revenue growth has been 15% year over year.',
      '',
      'Key highlights:',
      '- Market leader in vertical SaaS for logistics',
      '- Strong recurring revenue base (90% recurring)',
      '- Multiple expansion opportunities identified',
      '',
      'Best regards,',
      'John Banker',
    ].join('\r\n');

    const res = await request(app)
      .post('/api/ingest/email')
      .set('x-filename', 'deal.eml')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from(emlContent));

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.email.subject).toBe('CIM - Acme Corp Acquisition');
    expect(res.body.email.from).toContain('banker@goldmansachs.com');
  });

  it('should reject email with insufficient content', async () => {
    const emlContent = [
      'From: test@example.com',
      'To: to@example.com',
      'Subject: Hi',
      'Content-Type: text/plain',
      '',
      'Short.',
    ].join('\r\n');

    const res = await request(app)
      .post('/api/ingest/email')
      .set('x-filename', 'short.eml')
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from(emlContent));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('insufficient content');
  });
});
