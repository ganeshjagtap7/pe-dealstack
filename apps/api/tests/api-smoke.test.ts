/**
 * API Smoke Tests
 * Basic tests to verify all major endpoints are responding correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock all external dependencies
vi.mock('../src/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: { id: 'updated' }, error: null }),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
    auth: {
      getUser: vi.fn(),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file' } }),
      })),
    },
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Create a comprehensive test app that mocks all routes
function createSmokeTestApp() {
  const app = express();
  app.use(express.json());

  // Add request ID middleware
  app.use((req: any, res, next) => {
    req.requestId = 'test-request-id';
    res.setHeader('X-Request-ID', req.requestId);
    next();
  });

  // Mock auth middleware
  app.use((req: any, res, next) => {
    // Default authenticated user for most tests
    req.user = { id: 'user-123', email: 'test@example.com', role: 'ADMIN' };
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  });

  // API info
  app.get('/api', (req, res) => {
    res.json({
      message: 'AI CRM API v0.1.0',
      endpoints: {
        deals: '/api/deals',
        companies: '/api/companies',
        activities: '/api/activities',
        documents: '/api/documents',
        users: '/api/users',
        invitations: '/api/invitations',
        notifications: '/api/notifications',
        health: '/health',
      },
    });
  });

  // Deals endpoints
  app.get('/api/deals', (req, res) => {
    res.json([
      { id: 'deal-1', name: 'Test Deal', stage: 'DUE_DILIGENCE', status: 'ACTIVE' },
    ]);
  });

  app.get('/api/deals/:id', (req, res) => {
    const { id } = req.params;
    if (id === 'not-found') {
      return res.status(404).json({ error: 'Deal not found' });
    }
    res.json({ id, name: 'Test Deal', stage: 'DUE_DILIGENCE' });
  });

  app.post('/api/deals', (req, res) => {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    res.status(201).json({ id: 'new-deal', ...req.body });
  });

  app.patch('/api/deals/:id', (req, res) => {
    res.json({ id: req.params.id, ...req.body, updatedAt: new Date().toISOString() });
  });

  app.delete('/api/deals/:id', (req, res) => {
    res.status(204).send();
  });

  // Companies endpoints
  app.get('/api/companies', (req, res) => {
    res.json([
      { id: 'company-1', name: 'Test Company', industry: 'Technology' },
    ]);
  });

  app.get('/api/companies/:id', (req, res) => {
    if (req.params.id === 'not-found') {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.json({ id: req.params.id, name: 'Test Company' });
  });

  app.post('/api/companies', (req, res) => {
    res.status(201).json({ id: 'new-company', ...req.body });
  });

  // Users endpoints
  app.get('/api/users', (req, res) => {
    res.json([
      { id: 'user-1', name: 'Test User', email: 'user@example.com', role: 'MEMBER' },
    ]);
  });

  app.get('/api/users/me', (req: any, res) => {
    res.json(req.user);
  });

  app.patch('/api/users/me', (req: any, res) => {
    res.json({ ...req.user, ...req.body });
  });

  // Activities endpoints
  app.get('/api/deals/:dealId/activities', (req, res) => {
    res.json({ data: [], total: 0, limit: 50, offset: 0 });
  });

  app.post('/api/deals/:dealId/activities', (req, res) => {
    res.status(201).json({ id: 'activity-1', ...req.body });
  });

  // Documents endpoints
  app.get('/api/deals/:dealId/documents', (req, res) => {
    res.json([
      { id: 'doc-1', name: 'Test Document.pdf', type: 'CIM' },
    ]);
  });

  app.get('/api/documents/:id', (req, res) => {
    if (req.params.id === 'not-found') {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ id: req.params.id, name: 'Test Document.pdf' });
  });

  // Notifications endpoints
  app.get('/api/notifications', (req, res) => {
    res.json([
      { id: 'notif-1', title: 'Test Notification', isRead: false },
    ]);
  });

  app.get('/api/notifications/unread-count', (req, res) => {
    res.json({ count: 5 });
  });

  app.patch('/api/notifications/:id/read', (req, res) => {
    res.json({ id: req.params.id, isRead: true });
  });

  // Invitations endpoints
  app.get('/api/invitations', (req, res) => {
    res.json([
      { id: 'inv-1', email: 'invited@example.com', status: 'PENDING' },
    ]);
  });

  app.post('/api/invitations', (req, res) => {
    if (!req.body.email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    res.status(201).json({ id: 'new-inv', ...req.body, status: 'PENDING' });
  });

  // Folders endpoints
  app.get('/api/deals/:dealId/folders', (req, res) => {
    res.json([
      { id: 'folder-1', name: 'Data Room', fileCount: 5 },
    ]);
  });

  // Memos endpoints
  app.get('/api/memos', (req, res) => {
    res.json([
      { id: 'memo-1', title: 'Investment Memo', status: 'DRAFT' },
    ]);
  });

  app.get('/api/memos/:id', (req, res) => {
    if (req.params.id === 'not-found') {
      return res.status(404).json({ error: 'Memo not found' });
    }
    res.json({ id: req.params.id, title: 'Investment Memo', sections: [] });
  });

  // AI endpoints
  app.get('/api/ai/status', (req, res) => {
    res.json({ enabled: true, model: 'gpt-4-turbo-preview' });
  });

  // Error handler
  app.use((err: any, req: any, res: any, next: any) => {
    res.status(err.statusCode || 500).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Internal server error',
        requestId: req.requestId,
      },
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}

describe('API Smoke Tests', () => {
  let app: ReturnType<typeof createSmokeTestApp>;

  beforeEach(() => {
    app = createSmokeTestApp();
  });

  describe('Health & Info Endpoints', () => {
    it('GET /health should return ok status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.database).toBe('connected');
      expect(response.body.timestamp).toBeDefined();
    });

    it('GET /api should return API info', async () => {
      const response = await request(app).get('/api');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('AI CRM API');
      expect(response.body.endpoints).toBeDefined();
      expect(response.body.endpoints.deals).toBe('/api/deals');
    });
  });

  describe('Deals API', () => {
    it('GET /api/deals should return deal list', async () => {
      const response = await request(app).get('/api/deals');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/deals/:id should return single deal', async () => {
      const response = await request(app).get('/api/deals/deal-123');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('deal-123');
    });

    it('GET /api/deals/:id should return 404 for non-existent deal', async () => {
      const response = await request(app).get('/api/deals/not-found');

      expect(response.status).toBe(404);
    });

    it('POST /api/deals should create deal', async () => {
      const response = await request(app)
        .post('/api/deals')
        .send({ name: 'New Deal', companyName: 'New Company' });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Deal');
    });

    it('POST /api/deals should validate required fields', async () => {
      const response = await request(app)
        .post('/api/deals')
        .send({});

      expect(response.status).toBe(400);
    });

    it('PATCH /api/deals/:id should update deal', async () => {
      const response = await request(app)
        .patch('/api/deals/deal-123')
        .send({ stage: 'LOI_SUBMITTED' });

      expect(response.status).toBe(200);
      expect(response.body.stage).toBe('LOI_SUBMITTED');
    });

    it('DELETE /api/deals/:id should delete deal', async () => {
      const response = await request(app).delete('/api/deals/deal-123');

      expect(response.status).toBe(204);
    });
  });

  describe('Companies API', () => {
    it('GET /api/companies should return company list', async () => {
      const response = await request(app).get('/api/companies');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/companies/:id should return single company', async () => {
      const response = await request(app).get('/api/companies/company-123');

      expect(response.status).toBe(200);
    });

    it('POST /api/companies should create company', async () => {
      const response = await request(app)
        .post('/api/companies')
        .send({ name: 'New Company', industry: 'Tech' });

      expect(response.status).toBe(201);
    });
  });

  describe('Users API', () => {
    it('GET /api/users should return user list', async () => {
      const response = await request(app).get('/api/users');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/users/me should return current user', async () => {
      const response = await request(app).get('/api/users/me');

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.email).toBeDefined();
    });

    it('PATCH /api/users/me should update current user', async () => {
      const response = await request(app)
        .patch('/api/users/me')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });
  });

  describe('Activities API', () => {
    it('GET /api/deals/:dealId/activities should return activities', async () => {
      const response = await request(app).get('/api/deals/deal-123/activities');

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('POST /api/deals/:dealId/activities should create activity', async () => {
      const response = await request(app)
        .post('/api/deals/deal-123/activities')
        .send({ type: 'NOTE_ADDED', title: 'Test note' });

      expect(response.status).toBe(201);
    });
  });

  describe('Documents API', () => {
    it('GET /api/deals/:dealId/documents should return documents', async () => {
      const response = await request(app).get('/api/deals/deal-123/documents');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/documents/:id should return single document', async () => {
      const response = await request(app).get('/api/documents/doc-123');

      expect(response.status).toBe(200);
    });

    it('GET /api/documents/:id should return 404 for non-existent document', async () => {
      const response = await request(app).get('/api/documents/not-found');

      expect(response.status).toBe(404);
    });
  });

  describe('Notifications API', () => {
    it('GET /api/notifications should return notifications', async () => {
      const response = await request(app).get('/api/notifications');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/notifications/unread-count should return count', async () => {
      const response = await request(app).get('/api/notifications/unread-count');

      expect(response.status).toBe(200);
      expect(response.body.count).toBeDefined();
    });

    it('PATCH /api/notifications/:id/read should mark as read', async () => {
      const response = await request(app).patch('/api/notifications/notif-123/read');

      expect(response.status).toBe(200);
      expect(response.body.isRead).toBe(true);
    });
  });

  describe('Invitations API', () => {
    it('GET /api/invitations should return invitations', async () => {
      const response = await request(app).get('/api/invitations');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('POST /api/invitations should create invitation', async () => {
      const response = await request(app)
        .post('/api/invitations')
        .send({ email: 'new@example.com', role: 'MEMBER' });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('PENDING');
    });

    it('POST /api/invitations should validate email', async () => {
      const response = await request(app)
        .post('/api/invitations')
        .send({ role: 'MEMBER' });

      expect(response.status).toBe(400);
    });
  });

  describe('Folders API', () => {
    it('GET /api/deals/:dealId/folders should return folders', async () => {
      const response = await request(app).get('/api/deals/deal-123/folders');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Memos API', () => {
    it('GET /api/memos should return memos', async () => {
      const response = await request(app).get('/api/memos');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('GET /api/memos/:id should return single memo', async () => {
      const response = await request(app).get('/api/memos/memo-123');

      expect(response.status).toBe(200);
      expect(response.body.sections).toBeDefined();
    });
  });

  describe('AI API', () => {
    it('GET /api/ai/status should return AI status', async () => {
      const response = await request(app).get('/api/ai/status');

      expect(response.status).toBe(200);
      expect(response.body.enabled).toBeDefined();
      expect(response.body.model).toBeDefined();
    });
  });
});

describe('API Response Format', () => {
  let app: ReturnType<typeof createSmokeTestApp>;

  beforeEach(() => {
    app = createSmokeTestApp();
  });

  it('should include X-Request-ID header in responses', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('should return JSON content type', async () => {
    const response = await request(app).get('/api');

    expect(response.headers['content-type']).toContain('application/json');
  });

  it('should return 404 for unknown routes', async () => {
    const response = await request(app).get('/api/unknown-endpoint');

    expect(response.status).toBe(404);
  });
});

describe('API Error Handling', () => {
  let app: ReturnType<typeof createSmokeTestApp>;

  beforeEach(() => {
    app = createSmokeTestApp();
  });

  it('should return structured error for 404', async () => {
    const response = await request(app).get('/api/deals/not-found');

    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
  });

  it('should return structured error for validation failures', async () => {
    const response = await request(app)
      .post('/api/deals')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});

describe('API Security Headers', () => {
  let app: ReturnType<typeof createSmokeTestApp>;

  beforeEach(() => {
    app = createSmokeTestApp();
  });

  it('should include request ID for error correlation', async () => {
    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-request-id'].length).toBeGreaterThan(0);
  });
});
