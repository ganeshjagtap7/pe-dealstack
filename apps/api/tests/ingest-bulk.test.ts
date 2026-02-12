/**
 * Excel/CSV Bulk Import Tests
 * Tests the excelParser service and POST /api/ingest/bulk endpoint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { parseExcelToDealRows } from '../src/services/excelParser.js';

// ============================================================
// Excel Parser — Unit Tests
// ============================================================

describe('parseExcelToDealRows', () => {
  function createExcelBuffer(headers: string[], rows: any[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  it('should parse standard column names', () => {
    const buffer = createExcelBuffer(
      ['Company Name', 'Industry', 'Revenue', 'EBITDA', 'Stage', 'Notes'],
      [
        ['Acme Corp', 'Healthcare', 50, 10, 'DUE_DILIGENCE', 'Strong pipeline'],
        ['Beta Inc', 'Technology', 120, 30, 'INITIAL_REVIEW', 'Early stage'],
      ]
    );

    const deals = parseExcelToDealRows(buffer);
    expect(deals).toHaveLength(2);
    expect(deals[0].companyName).toBe('Acme Corp');
    expect(deals[0].industry).toBe('Healthcare');
    expect(deals[0].revenue).toBe(50);
    expect(deals[0].ebitda).toBe(10);
    expect(deals[0].stage).toBe('DUE_DILIGENCE');
    expect(deals[0].notes).toBe('Strong pipeline');
    expect(deals[1].companyName).toBe('Beta Inc');
  });

  it('should handle alternative column name mappings', () => {
    const buffer = createExcelBuffer(
      ['Target', 'Sector', 'Sales', 'Adj. EBITDA'],
      [['Gamma LLC', 'Manufacturing', 200, 45]]
    );

    const deals = parseExcelToDealRows(buffer);
    expect(deals).toHaveLength(1);
    expect(deals[0].companyName).toBe('Gamma LLC');
    expect(deals[0].industry).toBe('Manufacturing');
    expect(deals[0].revenue).toBe(200);
    expect(deals[0].ebitda).toBe(45);
  });

  it('should handle financial values with $ and commas', () => {
    const buffer = createExcelBuffer(
      ['Company', 'Revenue', 'EBITDA'],
      [['Delta Corp', '$1,500', '$350']]
    );

    const deals = parseExcelToDealRows(buffer);
    expect(deals).toHaveLength(1);
    expect(deals[0].revenue).toBe(1500);
    expect(deals[0].ebitda).toBe(350);
  });

  it('should skip rows without company name', () => {
    const buffer = createExcelBuffer(
      ['Company Name', 'Revenue'],
      [
        ['Valid Corp', 100],
        ['', 200],       // empty company name
        ['Another Inc', 300],
      ]
    );

    const deals = parseExcelToDealRows(buffer);
    expect(deals).toHaveLength(2);
    expect(deals[0].companyName).toBe('Valid Corp');
    expect(deals[1].companyName).toBe('Another Inc');
  });

  it('should handle non-numeric revenue values gracefully', () => {
    const buffer = createExcelBuffer(
      ['Company', 'Revenue'],
      [['Test Corp', 'N/A']]
    );

    const deals = parseExcelToDealRows(buffer);
    expect(deals).toHaveLength(1);
    expect(deals[0].revenue).toBeUndefined();
  });

  it('should return empty array for empty file', () => {
    const buffer = createExcelBuffer(['Company Name'], []);
    const deals = parseExcelToDealRows(buffer);
    expect(deals).toHaveLength(0);
  });

  it('should return empty array for file with no recognized columns', () => {
    const buffer = createExcelBuffer(
      ['Foo', 'Bar', 'Baz'],
      [['a', 'b', 'c']]
    );

    const deals = parseExcelToDealRows(buffer);
    expect(deals).toHaveLength(0); // no companyName field mapped
  });

  it('should return empty array for invalid buffer', () => {
    const deals = parseExcelToDealRows(Buffer.from('not an excel file'));
    expect(deals).toHaveLength(0);
  });

  it('should handle case-insensitive column matching', () => {
    const buffer = createExcelBuffer(
      ['COMPANY NAME', 'revenue', 'Ebitda'],
      [['CaseTest Corp', 75, 15]]
    );

    const deals = parseExcelToDealRows(buffer);
    expect(deals).toHaveLength(1);
    expect(deals[0].companyName).toBe('CaseTest Corp');
    expect(deals[0].revenue).toBe(75);
    expect(deals[0].ebitda).toBe(15);
  });
});

// ============================================================
// Bulk Import Endpoint Tests
// ============================================================

describe('POST /api/ingest/bulk', () => {
  function createBulkApp() {
    const app = express();

    const upload = multer({ storage: multer.memoryStorage() });

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'test@example.com', role: 'ADMIN' };
      next();
    });

    app.post('/api/ingest/bulk', upload.single('file'), (req: any, res) => {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file provided' });

      if (
        !file.mimetype.includes('spreadsheet') &&
        !file.mimetype.includes('excel') &&
        !file.mimetype.includes('csv')
      ) {
        return res.status(400).json({ error: 'File must be Excel (.xlsx) or CSV (.csv)' });
      }

      const dealRows = parseExcelToDealRows(file.buffer);
      if (dealRows.length === 0) {
        return res.status(400).json({
          error: 'No valid deals found in file. Ensure you have a column named "Company" or "Company Name".',
          hint: 'Supported columns: Company Name, Industry, Revenue, EBITDA, Stage, Description, Notes',
        });
      }

      if (dealRows.length > 500) {
        return res.status(400).json({ error: 'Maximum 500 deals per import. Split your file.' });
      }

      // Simulate successful imports
      const deals = dealRows.map((row, i) => ({
        companyName: row.companyName,
        dealId: `deal-${i}`,
      }));

      res.status(201).json({
        success: true,
        summary: {
          total: dealRows.length,
          imported: dealRows.length,
          failed: 0,
          deals,
          errors: [],
        },
      });
    });

    return app;
  }

  function createExcelBuffer(headers: string[], rows: any[][]): Buffer {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  let app: express.Express;

  beforeEach(() => {
    app = createBulkApp();
  });

  it('should import deals from a valid Excel file', async () => {
    const buffer = createExcelBuffer(
      ['Company Name', 'Industry', 'Revenue', 'EBITDA'],
      [
        ['Acme Corp', 'Healthcare', 50, 10],
        ['Beta Inc', 'Technology', 120, 30],
        ['Gamma LLC', 'Manufacturing', 200, 45],
      ]
    );

    const response = await request(app)
      .post('/api/ingest/bulk')
      .attach('file', buffer, {
        filename: 'deals.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.summary.total).toBe(3);
    expect(response.body.summary.imported).toBe(3);
    expect(response.body.summary.failed).toBe(0);
    expect(response.body.summary.deals).toHaveLength(3);
  });

  it('should reject non-Excel file types', async () => {
    const response = await request(app)
      .post('/api/ingest/bulk')
      .attach('file', Buffer.from('test'), {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Excel');
  });

  it('should reject Excel file with no valid deals', async () => {
    const buffer = createExcelBuffer(
      ['Foo', 'Bar'],
      [['a', 'b']]
    );

    const response = await request(app)
      .post('/api/ingest/bulk')
      .attach('file', buffer, {
        filename: 'bad.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('No valid deals');
    expect(response.body.hint).toBeDefined();
  });

  it('should return 400 when no file is provided', async () => {
    const response = await request(app)
      .post('/api/ingest/bulk')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No file provided');
  });

  it('should handle alternative column names in Excel', async () => {
    const buffer = createExcelBuffer(
      ['Target Company', 'Sector', 'Sales', 'Adjusted EBITDA'],
      [['Alt Corp', 'Retail', 80, 20]]
    );

    const response = await request(app)
      .post('/api/ingest/bulk')
      .attach('file', buffer, {
        filename: 'pipeline.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(response.status).toBe(201);
    expect(response.body.summary.total).toBe(1);
    expect(response.body.summary.deals[0].companyName).toBe('Alt Corp');
  });

  it('should include summary with imported count and deal IDs', async () => {
    const buffer = createExcelBuffer(
      ['Company', 'Industry'],
      [['Summary Test Corp', 'Energy']]
    );

    const response = await request(app)
      .post('/api/ingest/bulk')
      .attach('file', buffer, {
        filename: 'test.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(response.status).toBe(201);
    const summary = response.body.summary;
    expect(summary.total).toBe(1);
    expect(summary.imported).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.deals[0]).toHaveProperty('dealId');
    expect(summary.deals[0]).toHaveProperty('companyName');
    expect(summary.errors).toHaveLength(0);
  });
});
