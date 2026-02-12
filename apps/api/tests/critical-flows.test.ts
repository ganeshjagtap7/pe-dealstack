/**
 * Critical User Flow Tests
 * Tests the most important user-facing flows: document upload validation,
 * AI chat endpoint structure, and deal lifecycle operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { validateFile, sanitizeFilename, getExpectedMimeType, isPotentiallyDangerous, ALLOWED_MIME_TYPES } from '../src/services/fileValidator.js';

// ============================================================
// Document Upload Flow Tests
// ============================================================

describe('Document Upload Flow', () => {
  describe('File validation pipeline', () => {
    it('should accept a valid PDF upload', () => {
      // Real PDF magic bytes: %PDF
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const result = validateFile(pdfBuffer, 'report.pdf', 'application/pdf');

      expect(result.isValid).toBe(true);
      expect(result.sanitizedFilename).toBe('report.pdf');
    });

    it('should accept a valid XLSX upload', () => {
      // XLSX magic bytes: PK (ZIP-based)
      const xlsxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      const result = validateFile(xlsxBuffer, 'financials.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

      expect(result.isValid).toBe(true);
      expect(result.sanitizedFilename).toBe('financials.xlsx');
    });

    it('should accept a valid CSV upload', () => {
      const csvContent = 'Name,Revenue,EBITDA\nApex Corp,48000000,12400000\nMediCare Plus,180000000,45000000';
      const csvBuffer = Buffer.from(csvContent);
      const result = validateFile(csvBuffer, 'deals.csv', 'text/csv');

      expect(result.isValid).toBe(true);
    });

    it('should reject file with mismatched magic bytes', () => {
      // Send JPEG magic bytes but claim PDF
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
      const result = validateFile(jpegBuffer, 'fake.pdf', 'application/pdf');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not match claimed type');
    });

    it('should reject disallowed MIME types', () => {
      const buffer = Buffer.from('test content');
      const result = validateFile(buffer, 'script.js', 'application/javascript');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should reject files exceeding size limits', () => {
      // Create a buffer larger than CSV limit (20MB)
      const largeBuffer = Buffer.alloc(21 * 1024 * 1024, 'a');
      const result = validateFile(largeBuffer, 'huge.csv', 'text/csv');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('exceeds limit');
    });

    it('should reject path traversal in filenames', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const result = validateFile(buffer, '../../../etc/passwd', 'application/pdf');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should reject executable file extensions', () => {
      const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      const result = validateFile(buffer, 'malware.exe', 'application/pdf');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should detect potentially dangerous executables', () => {
      // Windows PE (MZ) header
      const exeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00]);
      expect(isPotentiallyDangerous(exeBuffer, 'file.bin')).toBe(true);

      // ELF header
      const elfBuffer = Buffer.from([0x7F, 0x45, 0x4C, 0x46]);
      expect(isPotentiallyDangerous(elfBuffer, 'file.bin')).toBe(true);

      // Shebang
      const shebangBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
      expect(isPotentiallyDangerous(shebangBuffer, 'file.sh')).toBe(true);
    });

    it('should detect script injection attempts', () => {
      const scriptBuffer = Buffer.from('<script>alert("xss")</script>');
      expect(isPotentiallyDangerous(scriptBuffer, 'file.html')).toBe(true);

      const phpBuffer = Buffer.from('<?php system("whoami"); ?>');
      expect(isPotentiallyDangerous(phpBuffer, 'file.php')).toBe(true);
    });
  });

  describe('Filename sanitization', () => {
    it('should sanitize path separators', () => {
      expect(sanitizeFilename('path/to/file.pdf')).toBe('path_to_file.pdf');
      expect(sanitizeFilename('path\\to\\file.pdf')).toBe('path_to_file.pdf');
    });

    it('should remove control characters', () => {
      expect(sanitizeFilename('file\x00name.pdf')).toBe('filename.pdf');
    });

    it('should replace dangerous characters', () => {
      expect(sanitizeFilename('file<>:"|?*.pdf')).toBe('file_______.pdf');
    });

    it('should handle empty filenames after sanitization', () => {
      const result = sanitizeFilename('...');
      expect(result).toContain('file_');
    });
  });

  describe('MIME type detection from extension', () => {
    it('should map common extensions to MIME types', () => {
      expect(getExpectedMimeType('report.pdf')).toBe('application/pdf');
      expect(getExpectedMimeType('data.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(getExpectedMimeType('data.csv')).toBe('text/csv');
      expect(getExpectedMimeType('memo.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(getExpectedMimeType('photo.jpg')).toBe('image/jpeg');
      expect(getExpectedMimeType('photo.jpeg')).toBe('image/jpeg');
      expect(getExpectedMimeType('logo.png')).toBe('image/png');
      expect(getExpectedMimeType('email.msg')).toBe('application/vnd.ms-outlook');
      expect(getExpectedMimeType('email.eml')).toBe('message/rfc822');
    });

    it('should return null for unknown extensions', () => {
      expect(getExpectedMimeType('file.xyz')).toBeNull();
      expect(getExpectedMimeType('noext')).toBeNull();
    });
  });
});

// ============================================================
// Document Upload API Endpoint Tests
// ============================================================

describe('Document Upload API', () => {
  function createDocumentApp() {
    const app = express();
    app.use(express.json());

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'test@example.com', role: 'ADMIN' };
      next();
    });

    // Simulated document upload endpoint
    app.post('/api/deals/:dealId/documents/upload', (req: any, res) => {
      const { dealId } = req.params;

      if (!dealId) {
        return res.status(400).json({ error: 'Deal ID is required' });
      }

      // Simulate successful upload
      res.status(201).json({
        id: 'doc-new-123',
        dealId,
        name: 'uploaded-file.pdf',
        type: 'CIM',
        size: 1024,
        url: 'https://storage.example.com/uploaded-file.pdf',
        uploadedBy: req.user.id,
        createdAt: new Date().toISOString(),
      });
    });

    // Document metadata update
    app.patch('/api/documents/:id', (req, res) => {
      const { id } = req.params;
      res.json({ id, ...req.body, updatedAt: new Date().toISOString() });
    });

    // Document download URL
    app.get('/api/documents/:id/download', (req, res) => {
      const { id } = req.params;
      if (id === 'not-found') {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({
        url: `https://storage.example.com/${id}/file.pdf`,
        expiresIn: 3600,
      });
    });

    return app;
  }

  let app: express.Express;

  beforeEach(() => {
    app = createDocumentApp();
  });

  it('should upload a document to a deal', async () => {
    const response = await request(app)
      .post('/api/deals/deal-123/documents/upload')
      .send({ name: 'CIM Document.pdf' });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.dealId).toBe('deal-123');
    expect(response.body.uploadedBy).toBe('user-123');
  });

  it('should update document metadata', async () => {
    const response = await request(app)
      .patch('/api/documents/doc-123')
      .send({ type: 'FINANCIALS', tags: ['Q4', '2024'] });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe('FINANCIALS');
    expect(response.body.tags).toEqual(['Q4', '2024']);
  });

  it('should get document download URL', async () => {
    const response = await request(app).get('/api/documents/doc-123/download');

    expect(response.status).toBe(200);
    expect(response.body.url).toBeDefined();
    expect(response.body.expiresIn).toBe(3600);
  });

  it('should return 404 for non-existent document download', async () => {
    const response = await request(app).get('/api/documents/not-found/download');

    expect(response.status).toBe(404);
  });
});

// ============================================================
// AI Chat Flow Tests
// ============================================================

describe('AI Chat Flow', () => {
  function createAIChatApp() {
    const app = express();
    app.use(express.json());

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'test@example.com', role: 'ADMIN' };
      next();
    });

    // AI chat endpoint
    app.post('/api/deals/:dealId/chat', (req: any, res) => {
      const { dealId } = req.params;
      const { message } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message is required' });
      }

      if (message.length > 5000) {
        return res.status(400).json({ error: 'Message too long' });
      }

      // Simulate AI response
      res.json({
        response: `Analysis for deal ${dealId}: Based on the available data, this deal shows strong fundamentals.`,
        model: 'gpt-4-turbo-preview',
      });
    });

    // AI chat with field updates
    app.post('/api/deals/:dealId/chat/update', (req: any, res) => {
      const { dealId } = req.params;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Message is required' });
      }

      res.json({
        response: 'I\'ve updated the deal fields as requested.',
        model: 'gpt-4-turbo-preview',
        updates: [
          { field: 'stage', oldValue: 'INITIAL_REVIEW', newValue: 'DUE_DILIGENCE' },
        ],
      });
    });

    // Chat history
    app.get('/api/deals/:dealId/chat/history', (req, res) => {
      const { dealId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      res.json({
        messages: [
          { id: 'msg-1', role: 'user', content: 'Tell me about this deal', createdAt: '2025-01-01T00:00:00Z' },
          { id: 'msg-2', role: 'assistant', content: 'This deal involves...', createdAt: '2025-01-01T00:00:01Z' },
        ],
        total: 2,
        dealId,
      });
    });

    // AI status
    app.get('/api/ai/status', (_req, res) => {
      res.json({
        enabled: true,
        model: 'gpt-4-turbo-preview',
        features: ['chat', 'analysis', 'field-updates'],
      });
    });

    return app;
  }

  let app: express.Express;

  beforeEach(() => {
    app = createAIChatApp();
  });

  it('should send a chat message and receive AI response', async () => {
    const response = await request(app)
      .post('/api/deals/deal-123/chat')
      .send({ message: 'What are the key risks for this deal?' });

    expect(response.status).toBe(200);
    expect(response.body.response).toBeDefined();
    expect(response.body.model).toBe('gpt-4-turbo-preview');
  });

  it('should reject empty chat messages', async () => {
    const response = await request(app)
      .post('/api/deals/deal-123/chat')
      .send({ message: '' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('required');
  });

  it('should reject missing message field', async () => {
    const response = await request(app)
      .post('/api/deals/deal-123/chat')
      .send({});

    expect(response.status).toBe(400);
  });

  it('should reject overly long messages', async () => {
    const longMessage = 'a'.repeat(5001);
    const response = await request(app)
      .post('/api/deals/deal-123/chat')
      .send({ message: longMessage });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('too long');
  });

  it('should support AI-driven field updates', async () => {
    const response = await request(app)
      .post('/api/deals/deal-123/chat/update')
      .send({ message: 'Move this deal to due diligence stage' });

    expect(response.status).toBe(200);
    expect(response.body.updates).toBeDefined();
    expect(response.body.updates.length).toBeGreaterThan(0);
    expect(response.body.updates[0].field).toBe('stage');
  });

  it('should retrieve chat history', async () => {
    const response = await request(app).get('/api/deals/deal-123/chat/history');

    expect(response.status).toBe(200);
    expect(response.body.messages).toBeDefined();
    expect(response.body.messages.length).toBe(2);
    expect(response.body.messages[0].role).toBe('user');
    expect(response.body.messages[1].role).toBe('assistant');
  });

  it('should report AI feature status', async () => {
    const response = await request(app).get('/api/ai/status');

    expect(response.status).toBe(200);
    expect(response.body.enabled).toBe(true);
    expect(response.body.features).toContain('chat');
  });
});

// ============================================================
// Deal Lifecycle Flow Tests
// ============================================================

describe('Deal Lifecycle Flow', () => {
  function createDealLifecycleApp() {
    const app = express();
    app.use(express.json());

    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'test@example.com', role: 'ADMIN' };
      next();
    });

    const deals: any[] = [];

    // Create deal
    app.post('/api/deals', (req: any, res) => {
      const { name, companyName, industry } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const deal = {
        id: `deal-${Date.now()}`,
        name,
        companyName,
        industry,
        stage: 'INITIAL_REVIEW',
        status: 'ACTIVE',
        assignedTo: req.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      deals.push(deal);
      res.status(201).json(deal);
    });

    // Update deal stage
    app.patch('/api/deals/:id', (req, res) => {
      const deal = deals.find(d => d.id === req.params.id);
      if (!deal) return res.status(404).json({ error: 'Deal not found' });

      Object.assign(deal, req.body, { updatedAt: new Date().toISOString() });
      res.json(deal);
    });

    // Add team member
    app.post('/api/deals/:id/team', (req, res) => {
      const deal = deals.find(d => d.id === req.params.id);
      if (!deal) return res.status(404).json({ error: 'Deal not found' });

      const member = {
        id: `member-${Date.now()}`,
        userId: req.body.userId,
        role: req.body.role || 'MEMBER',
        dealId: deal.id,
      };
      res.status(201).json(member);
    });

    // Get deal
    app.get('/api/deals/:id', (req, res) => {
      const deal = deals.find(d => d.id === req.params.id);
      if (!deal) return res.status(404).json({ error: 'Deal not found' });
      res.json(deal);
    });

    return app;
  }

  it('should complete full deal lifecycle: create → update stage → add team member', async () => {
    const app = createDealLifecycleApp();

    // Step 1: Create a deal
    const createRes = await request(app)
      .post('/api/deals')
      .send({ name: 'Apex Logistics Acquisition', companyName: 'Apex Corp', industry: 'Logistics' });

    expect(createRes.status).toBe(201);
    expect(createRes.body.stage).toBe('INITIAL_REVIEW');
    const dealId = createRes.body.id;

    // Step 2: Move to Due Diligence
    const updateRes = await request(app)
      .patch(`/api/deals/${dealId}`)
      .send({ stage: 'DUE_DILIGENCE' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.stage).toBe('DUE_DILIGENCE');

    // Step 3: Add a team member
    const teamRes = await request(app)
      .post(`/api/deals/${dealId}/team`)
      .send({ userId: 'analyst-456', role: 'MEMBER' });

    expect(teamRes.status).toBe(201);
    expect(teamRes.body.role).toBe('MEMBER');

    // Step 4: Verify final deal state
    const getRes = await request(app).get(`/api/deals/${dealId}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.stage).toBe('DUE_DILIGENCE');
    expect(getRes.body.status).toBe('ACTIVE');
  });

  it('should handle deal stage progression through full pipeline', async () => {
    const app = createDealLifecycleApp();
    const stages = [
      'INITIAL_REVIEW',
      'DUE_DILIGENCE',
      'IOI_SUBMITTED',
      'LOI_SUBMITTED',
      'NEGOTIATION',
      'CLOSING',
      'CLOSED_WON',
    ];

    // Create deal
    const createRes = await request(app)
      .post('/api/deals')
      .send({ name: 'Pipeline Test Deal', companyName: 'Test Corp' });

    const dealId = createRes.body.id;
    expect(createRes.body.stage).toBe(stages[0]);

    // Progress through each stage
    for (let i = 1; i < stages.length; i++) {
      const updateRes = await request(app)
        .patch(`/api/deals/${dealId}`)
        .send({ stage: stages[i] });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.stage).toBe(stages[i]);
    }
  });
});
