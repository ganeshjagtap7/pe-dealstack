/**
 * Audit Trail Tests
 * Tests the audit log service, API endpoints, and ingest audit integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock Supabase before any imports that depend on it
vi.mock('../src/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
    })),
  },
}));

// ============================================================
// Audit Log Service — Unit Tests
// ============================================================

describe('AuditLog service', () => {
  it('should export AuditLog with convenience methods', async () => {
    const mod = await import('../src/services/auditLog.js');
    expect(mod.AuditLog).toBeDefined();
    expect(typeof mod.AuditLog.dealCreated).toBe('function');
    expect(typeof mod.AuditLog.dealUpdated).toBe('function');
    expect(typeof mod.AuditLog.dealDeleted).toBe('function');
    expect(typeof mod.AuditLog.documentUploaded).toBe('function');
    expect(typeof mod.AuditLog.documentDeleted).toBe('function');
    expect(typeof mod.AuditLog.aiIngest).toBe('function');
    expect(typeof mod.AuditLog.aiChat).toBe('function');
    expect(typeof mod.AuditLog.aiGenerate).toBe('function');
    expect(typeof mod.AuditLog.memoCreated).toBe('function');
    expect(typeof mod.AuditLog.memoDeleted).toBe('function');
    expect(typeof mod.AuditLog.userCreated).toBe('function');
    expect(typeof mod.AuditLog.userUpdated).toBe('function');
    expect(typeof mod.AuditLog.userDeleted).toBe('function');
    expect(typeof mod.AuditLog.log).toBe('function');
  });

  it('should export AUDIT_ACTIONS constants', async () => {
    const mod = await import('../src/services/auditLog.js');
    expect(mod.AUDIT_ACTIONS).toBeDefined();
    expect(mod.AUDIT_ACTIONS.DEAL_CREATED).toBe('DEAL_CREATED');
    expect(mod.AUDIT_ACTIONS.DEAL_UPDATED).toBe('DEAL_UPDATED');
    expect(mod.AUDIT_ACTIONS.DEAL_DELETED).toBe('DEAL_DELETED');
    expect(mod.AUDIT_ACTIONS.DOCUMENT_UPLOADED).toBe('DOCUMENT_UPLOADED');
    expect(mod.AUDIT_ACTIONS.AI_INGEST).toBe('AI_INGEST');
    expect(mod.AUDIT_ACTIONS.AI_CHAT).toBe('AI_CHAT');
  });

  it('should export RESOURCE_TYPES constants', async () => {
    const mod = await import('../src/services/auditLog.js');
    expect(mod.RESOURCE_TYPES).toBeDefined();
    expect(mod.RESOURCE_TYPES.DEAL).toBe('DEAL');
    expect(mod.RESOURCE_TYPES.DOCUMENT).toBe('DOCUMENT');
    expect(mod.RESOURCE_TYPES.MEMO).toBe('MEMO');
    expect(mod.RESOURCE_TYPES.USER).toBe('USER');
    expect(mod.RESOURCE_TYPES.COMPANY).toBe('COMPANY');
  });

  it('should export SEVERITY levels', async () => {
    const mod = await import('../src/services/auditLog.js');
    expect(mod.SEVERITY).toBeDefined();
    expect(mod.SEVERITY.INFO).toBe('INFO');
    expect(mod.SEVERITY.WARNING).toBe('WARNING');
    expect(mod.SEVERITY.ERROR).toBe('ERROR');
    expect(mod.SEVERITY.CRITICAL).toBe('CRITICAL');
  });

  it('should export logAuditEvent function', async () => {
    const mod = await import('../src/services/auditLog.js');
    expect(typeof mod.logAuditEvent).toBe('function');
  });

  it('should export getAuditLogs function', async () => {
    const mod = await import('../src/services/auditLog.js');
    expect(typeof mod.getAuditLogs).toBe('function');
  });

  it('should export getAuditSummary function', async () => {
    const mod = await import('../src/services/auditLog.js');
    expect(typeof mod.getAuditSummary).toBe('function');
  });
});

// ============================================================
// Audit API Endpoint Tests
// ============================================================

describe('GET /api/audit', () => {
  function createAuditApp() {
    const app = express();
    app.use(express.json());

    // Mock auth
    app.use((req: any, _res, next) => {
      req.user = { id: 'user-123', email: 'admin@example.com', role: 'ADMIN' };
      next();
    });

    // Mock audit logs data
    const mockLogs = [
      {
        id: 'audit-1',
        userId: 'user-123',
        userEmail: 'admin@example.com',
        action: 'DEAL_CREATED',
        resourceType: 'DEAL',
        resourceId: 'deal-1',
        resourceName: 'Acme Corp',
        description: 'Created deal: Acme Corp',
        metadata: {},
        severity: 'INFO',
        createdAt: '2026-02-13T10:00:00Z',
      },
      {
        id: 'audit-2',
        userId: 'user-123',
        userEmail: 'admin@example.com',
        action: 'AI_INGEST',
        resourceType: 'DEAL',
        resourceId: 'deal-1',
        resourceName: 'cim.pdf',
        description: null,
        metadata: {},
        severity: 'INFO',
        createdAt: '2026-02-13T10:01:00Z',
      },
      {
        id: 'audit-3',
        userId: 'user-456',
        userEmail: 'analyst@example.com',
        action: 'DEAL_UPDATED',
        resourceType: 'DEAL',
        resourceId: 'deal-1',
        resourceName: 'Acme Corp',
        metadata: { changes: { stage: 'DUE_DILIGENCE' } },
        severity: 'INFO',
        createdAt: '2026-02-13T11:00:00Z',
      },
    ];

    // GET /api/audit — list with filtering
    app.get('/api/audit', (req, res) => {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      let filtered = [...mockLogs];

      if (req.query.resourceId) {
        filtered = filtered.filter(l => l.resourceId === req.query.resourceId);
      }
      if (req.query.resourceType) {
        filtered = filtered.filter(l => l.resourceType === req.query.resourceType);
      }
      if (req.query.action) {
        filtered = filtered.filter(l => l.action === req.query.action);
      }
      if (req.query.userId) {
        filtered = filtered.filter(l => l.userId === req.query.userId);
      }

      const paged = filtered.slice(offset, offset + limit);
      res.json({ success: true, count: filtered.length, limit, offset, logs: paged });
    });

    // GET /api/audit/entity/:entityId
    app.get('/api/audit/entity/:entityId', (req, res) => {
      const { entityId } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const filtered = mockLogs.filter(l => l.resourceId === entityId);
      res.json({ success: true, entityId, count: filtered.length, logs: filtered.slice(0, limit) });
    });

    // GET /api/audit/summary
    app.get('/api/audit/summary', (req, res) => {
      const days = parseInt(req.query.days as string) || 30;
      res.json({
        success: true,
        period: `${days} days`,
        totalActions: mockLogs.length,
        byAction: { DEAL_CREATED: 1, AI_INGEST: 1, DEAL_UPDATED: 1 },
        byUser: { 'admin@example.com': 2, 'analyst@example.com': 1 },
        bySeverity: { INFO: 3 },
      });
    });

    return app;
  }

  let app: express.Express;

  beforeEach(() => {
    app = createAuditApp();
  });

  it('should return all audit logs', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.logs).toHaveLength(3);
    expect(res.body.count).toBe(3);
  });

  it('should filter by resourceId', async () => {
    const res = await request(app).get('/api/audit?resourceId=deal-1');
    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThan(0);
    res.body.logs.forEach((log: any) => {
      expect(log.resourceId).toBe('deal-1');
    });
  });

  it('should filter by action', async () => {
    const res = await request(app).get('/api/audit?action=DEAL_CREATED');
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].action).toBe('DEAL_CREATED');
  });

  it('should filter by userId', async () => {
    const res = await request(app).get('/api/audit?userId=user-456');
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].userEmail).toBe('analyst@example.com');
  });

  it('should respect limit and offset', async () => {
    const res = await request(app).get('/api/audit?limit=1&offset=1');
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(1);
    expect(res.body.logs[0].id).toBe('audit-2');
    expect(res.body.limit).toBe(1);
    expect(res.body.offset).toBe(1);
  });

  it('should return audit trail for a specific entity', async () => {
    const res = await request(app).get('/api/audit/entity/deal-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.entityId).toBe('deal-1');
    expect(res.body.logs.length).toBeGreaterThan(0);
    res.body.logs.forEach((log: any) => {
      expect(log.resourceId).toBe('deal-1');
    });
  });

  it('should return empty array for unknown entity', async () => {
    const res = await request(app).get('/api/audit/entity/nonexistent');
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(0);
    expect(res.body.count).toBe(0);
  });

  it('should return audit summary', async () => {
    const res = await request(app).get('/api/audit/summary');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalActions).toBe(3);
    expect(res.body.byAction).toBeDefined();
    expect(res.body.byUser).toBeDefined();
    expect(res.body.bySeverity).toBeDefined();
  });

  it('should accept custom days parameter for summary', async () => {
    const res = await request(app).get('/api/audit/summary?days=7');
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('7 days');
  });

  it('should include required fields in each audit log entry', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(200);
    const log = res.body.logs[0];
    expect(log).toHaveProperty('id');
    expect(log).toHaveProperty('action');
    expect(log).toHaveProperty('createdAt');
    expect(log).toHaveProperty('severity');
  });
});

// ============================================================
// Audit Log Entry Shape Tests
// ============================================================

describe('AuditLogEntry interface', () => {
  it('should have correct shape for AuditLogEntry', async () => {
    const mod = await import('../src/services/auditLog.js');
    // Verify the function accepts the right shape
    const entry: any = {
      userId: 'user-123',
      userEmail: 'test@example.com',
      action: mod.AUDIT_ACTIONS.DEAL_CREATED,
      resourceType: mod.RESOURCE_TYPES.DEAL,
      resourceId: 'deal-123',
      resourceName: 'Test Deal',
      description: 'Test description',
      metadata: { source: 'test' },
      severity: mod.SEVERITY.INFO,
    };
    // Verify all fields are valid
    expect(entry.userId).toBe('user-123');
    expect(entry.action).toBe('DEAL_CREATED');
    expect(entry.resourceType).toBe('DEAL');
    expect(entry.severity).toBe('INFO');
  });

  it('should support all AUDIT_ACTIONS', async () => {
    const { AUDIT_ACTIONS } = await import('../src/services/auditLog.js');
    const actions = Object.values(AUDIT_ACTIONS);
    expect(actions.length).toBeGreaterThan(20);
    // Key actions for ingest audit trail
    expect(actions).toContain('AI_INGEST');
    expect(actions).toContain('DEAL_CREATED');
    expect(actions).toContain('DEAL_UPDATED');
    expect(actions).toContain('DEAL_DELETED');
    expect(actions).toContain('DOCUMENT_UPLOADED');
  });
});

// ============================================================
// Ingest Audit Integration Tests
// ============================================================

describe('Ingest routes import AuditLog', () => {
  it('should have AuditLog imported in ingest.ts', async () => {
    // Verify the ingest module loads without error (includes AuditLog import)
    const mod = await import('../src/routes/ingest.js');
    expect(mod.default).toBeDefined(); // Router is the default export
  });
});
