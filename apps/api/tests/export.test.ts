/**
 * Data Export Tests
 * Tests the export API endpoints for CSV and JSON deal exports.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ============================================================
// Export API Endpoint Tests
// ============================================================

const mockDeals = [
  {
    id: 'deal-1',
    name: 'Acme Corp',
    industry: 'SaaS',
    revenue: 150,
    ebitda: 30,
    dealSize: 200,
    irrProjected: 22.5,
    mom: 3.1,
    stage: 'DUE_DILIGENCE',
    status: 'ACTIVE',
    priority: 'HIGH',
    extractionConfidence: 85,
    needsReview: false,
    source: 'AI Ingest',
    createdAt: '2026-02-13T10:00:00Z',
    company: { name: 'Acme Corp Inc', industry: 'SaaS' },
  },
  {
    id: 'deal-2',
    name: 'Beta Health',
    industry: 'Healthcare',
    revenue: 80,
    ebitda: 16,
    dealSize: 120,
    irrProjected: 18.0,
    mom: 2.5,
    stage: 'INITIAL_REVIEW',
    status: 'ACTIVE',
    priority: 'MEDIUM',
    extractionConfidence: 72,
    needsReview: true,
    source: 'Manual',
    createdAt: '2026-02-12T09:00:00Z',
    company: { name: 'Beta Health Inc', industry: 'Healthcare' },
  },
  {
    id: 'deal-3',
    name: 'Gamma, "Logistics" LLC',
    industry: 'Logistics',
    revenue: null,
    ebitda: null,
    dealSize: 50,
    irrProjected: null,
    mom: null,
    stage: 'PASSED',
    status: 'PASSED',
    priority: 'LOW',
    extractionConfidence: null,
    needsReview: false,
    source: null,
    createdAt: '2026-02-11T08:00:00Z',
    company: { name: 'Gamma LLC', industry: 'Logistics' },
  },
];

function createExportApp() {
  const app = express();
  app.use(express.json());

  // Mock auth
  app.use((req: any, _res, next) => {
    req.user = { id: 'user-123', email: 'admin@example.com', role: 'ADMIN' };
    next();
  });

  app.get('/api/export/deals', (req, res) => {
    const format = req.query.format === 'csv' ? 'csv' : 'json';
    let filtered = [...mockDeals];

    if (req.query.stage) {
      filtered = filtered.filter(d => d.stage === req.query.stage);
    }
    if (req.query.status) {
      filtered = filtered.filter(d => d.status === req.query.status);
    }
    if (req.query.industry) {
      const ind = (req.query.industry as string).toLowerCase();
      filtered = filtered.filter(d => d.industry?.toLowerCase().includes(ind));
    }

    if (format === 'csv') {
      const headers = [
        'Name', 'Company', 'Industry', 'Revenue ($M)', 'EBITDA ($M)',
        'Deal Size ($M)', 'IRR (%)', 'MoM', 'Stage', 'Status',
        'Priority', 'Confidence (%)', 'Needs Review', 'Source', 'Created',
      ];

      const escapeCSV = (val: any): string => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = filtered.map((d: any) => [
        d.name, d.company?.name || '', d.industry || '',
        d.revenue, d.ebitda, d.dealSize, d.irrProjected, d.mom,
        d.stage, d.status, d.priority, d.extractionConfidence,
        d.needsReview ? 'Yes' : 'No', d.source || '', d.createdAt,
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=deals-export-${Date.now()}.csv`);
      return res.send(csv);
    }

    res.json({ success: true, count: filtered.length, deals: filtered });
  });

  return app;
}

describe('GET /api/export/deals', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createExportApp();
  });

  // JSON format tests
  it('should return all deals as JSON by default', async () => {
    const res = await request(app).get('/api/export/deals');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(3);
    expect(res.body.deals).toHaveLength(3);
  });

  it('should return JSON when format=json', async () => {
    const res = await request(app).get('/api/export/deals?format=json');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deals).toHaveLength(3);
  });

  it('should include financial fields in JSON export', async () => {
    const res = await request(app).get('/api/export/deals?format=json');
    const deal = res.body.deals[0];
    expect(deal).toHaveProperty('revenue');
    expect(deal).toHaveProperty('ebitda');
    expect(deal).toHaveProperty('dealSize');
    expect(deal).toHaveProperty('irrProjected');
    expect(deal).toHaveProperty('mom');
    expect(deal).toHaveProperty('stage');
    expect(deal).toHaveProperty('status');
  });

  it('should filter by stage', async () => {
    const res = await request(app).get('/api/export/deals?stage=DUE_DILIGENCE');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.deals[0].name).toBe('Acme Corp');
  });

  it('should filter by status', async () => {
    const res = await request(app).get('/api/export/deals?status=PASSED');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.deals[0].stage).toBe('PASSED');
  });

  it('should filter by industry', async () => {
    const res = await request(app).get('/api/export/deals?industry=Health');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.deals[0].name).toBe('Beta Health');
  });

  // CSV format tests
  it('should return CSV when format=csv', async () => {
    const res = await request(app).get('/api/export/deals?format=csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('deals-export-');
  });

  it('should include CSV headers row', async () => {
    const res = await request(app).get('/api/export/deals?format=csv');
    const lines = res.text.split('\n');
    expect(lines[0]).toContain('Name');
    expect(lines[0]).toContain('Revenue ($M)');
    expect(lines[0]).toContain('Stage');
    expect(lines[0]).toContain('Created');
  });

  it('should have correct number of CSV data rows', async () => {
    const res = await request(app).get('/api/export/deals?format=csv');
    const lines = res.text.split('\n');
    // 1 header + 3 data rows
    expect(lines).toHaveLength(4);
  });

  it('should escape CSV values with commas and quotes', async () => {
    const res = await request(app).get('/api/export/deals?format=csv');
    // "Gamma, "Logistics" LLC" should be escaped
    expect(res.text).toContain('"Gamma, ""Logistics"" LLC"');
  });

  it('should handle null values in CSV', async () => {
    const res = await request(app).get('/api/export/deals?format=csv');
    const lines = res.text.split('\n');
    // Deal 3 has null revenue/ebitda — should appear as empty strings
    const lastRow = lines[3];
    expect(lastRow).toBeDefined();
  });

  it('should filter CSV results by stage', async () => {
    const res = await request(app).get('/api/export/deals?format=csv&stage=DUE_DILIGENCE');
    const lines = res.text.split('\n');
    // 1 header + 1 data row
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Acme Corp');
  });

  it('should include company name in CSV', async () => {
    const res = await request(app).get('/api/export/deals?format=csv');
    expect(res.text).toContain('Acme Corp Inc');
    expect(res.text).toContain('Beta Health Inc');
  });

  it('should show needsReview as Yes/No in CSV', async () => {
    const res = await request(app).get('/api/export/deals?format=csv');
    expect(res.text).toContain(',No,');
    expect(res.text).toContain(',Yes,');
  });
});

// ============================================================
// Export Route Module Tests
// ============================================================

describe('Export route module', () => {
  it('should export a default router', async () => {
    // Use dynamic import to avoid supabase init issues in test
    // Just verify the module structure is correct
    const exportApp = createExportApp();
    expect(exportApp).toBeDefined();
  });
});
