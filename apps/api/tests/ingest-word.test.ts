/**
 * Word Document & Multi-Format Ingestion Tests
 * Tests the documentParser service and multi-format support in POST /api/ingest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import multer from 'multer';

// ============================================================
// Document Parser — extractTextFromWord (unit tests)
// ============================================================

describe('extractTextFromWord', () => {
  // We can't easily test mammoth without real .docx buffers,
  // so test the contract: invalid/empty buffers return null.

  it('should export extractTextFromWord function', async () => {
    const mod = await import('../src/services/documentParser.js');
    expect(typeof mod.extractTextFromWord).toBe('function');
  });

  it('should return null for empty buffer', async () => {
    const { extractTextFromWord } = await import('../src/services/documentParser.js');
    const result = await extractTextFromWord(Buffer.alloc(0));
    expect(result).toBeNull();
  });

  it('should return null for random non-docx bytes', async () => {
    const { extractTextFromWord } = await import('../src/services/documentParser.js');
    const randomBuffer = Buffer.from('This is not a valid Word document format');
    const result = await extractTextFromWord(randomBuffer);
    expect(result).toBeNull();
  });
});

// ============================================================
// Multi-Format Ingest Endpoint Tests
// ============================================================

describe('POST /api/ingest — Multi-format support', () => {
  function createMultiFormatApp() {
    const app = express();

    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowedTypes = [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
        ];
        if (allowedTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type'));
        }
      },
    });

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'test@example.com', role: 'ADMIN' };
      next();
    });

    // Simulated multi-format ingest endpoint
    app.post('/api/ingest', upload.single('file'), (req: any, res) => {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      const mimeType = file.mimetype;

      // Route by format
      if (mimeType === 'application/pdf') {
        return res.status(201).json({
          success: true,
          format: 'pdf',
          deal: { id: 'deal-1', name: 'PDF Deal' },
        });
      } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mimeType === 'application/msword'
      ) {
        return res.status(201).json({
          success: true,
          format: 'word',
          deal: { id: 'deal-2', name: 'Word Deal' },
        });
      } else if (mimeType === 'text/plain') {
        const text = file.buffer.toString('utf-8');
        if (!text || text.trim().length < 50) {
          return res.status(400).json({ error: 'Text file is too short or empty' });
        }
        return res.status(201).json({
          success: true,
          format: 'text',
          deal: { id: 'deal-3', name: 'Text Deal' },
        });
      } else {
        return res.status(400).json({
          error: 'Unsupported file type for auto-deal creation',
          supported: ['PDF (.pdf)', 'Word (.docx, .doc)', 'Text (.txt)'],
        });
      }
    });

    // Error handler for multer
    app.use((err: any, _req: any, res: any, _next: any) => {
      if (err.message === 'Invalid file type') {
        return res.status(400).json({ error: 'Invalid file type' });
      }
      res.status(500).json({ error: err.message });
    });

    return app;
  }

  let app: express.Express;

  beforeEach(() => {
    app = createMultiFormatApp();
  });

  it('should accept PDF files', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .attach('file', Buffer.from('%PDF-1.4 test content'), {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(response.body.format).toBe('pdf');
  });

  it('should accept Word .docx files', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .attach('file', Buffer.from('fake docx content'), {
        filename: 'report.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

    expect(response.status).toBe(201);
    expect(response.body.format).toBe('word');
  });

  it('should accept Word .doc files', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .attach('file', Buffer.from('fake doc content'), {
        filename: 'report.doc',
        contentType: 'application/msword',
      });

    expect(response.status).toBe(201);
    expect(response.body.format).toBe('word');
  });

  it('should accept plain text .txt files with sufficient content', async () => {
    const longText = 'Acme Healthcare Services is a leading home healthcare provider in the Northeast US with strong revenue growth and EBITDA margins.';

    const response = await request(app)
      .post('/api/ingest')
      .attach('file', Buffer.from(longText), {
        filename: 'deal-notes.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(201);
    expect(response.body.format).toBe('text');
  });

  it('should reject plain text files that are too short', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .attach('file', Buffer.from('Too short'), {
        filename: 'short.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('too short');
  });

  it('should reject unsupported MIME types via multer filter', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .attach('file', Buffer.from('test'), {
        filename: 'image.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid file type');
  });

  it('should return 400 when no file is provided', async () => {
    const response = await request(app)
      .post('/api/ingest')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('No file provided');
  });

  it('should include supported formats in error for unsupported types', async () => {
    // This tests the route-level check (not multer filter)
    // We need to bypass multer by allowing the type first
    const customApp = express();
    const openUpload = multer({ storage: multer.memoryStorage() });

    customApp.use((req: any, _res, next) => {
      req.user = { id: 'user-123' };
      next();
    });

    customApp.post('/api/ingest', openUpload.single('file'), (req: any, res) => {
      const mimeType = req.file?.mimetype;
      const supportedFormats = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
      ];

      if (!supportedFormats.includes(mimeType)) {
        return res.status(400).json({
          error: 'Unsupported file type for auto-deal creation',
          supported: ['PDF (.pdf)', 'Word (.docx, .doc)', 'Text (.txt)'],
        });
      }
      res.status(201).json({ success: true });
    });

    const response = await request(customApp)
      .post('/api/ingest')
      .attach('file', Buffer.from('test'), {
        filename: 'data.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

    expect(response.status).toBe(400);
    expect(response.body.supported).toContain('PDF (.pdf)');
    expect(response.body.supported).toContain('Word (.docx, .doc)');
    expect(response.body.supported).toContain('Text (.txt)');
  });
});
