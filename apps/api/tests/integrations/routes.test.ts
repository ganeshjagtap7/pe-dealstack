import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  vi.resetModules();
});

describe('GET /api/integrations', () => {
  it("returns the user's connected integrations (org-scoped)", async () => {
    vi.doMock('../../src/supabase.js', () => ({
      supabase: {
        from: vi.fn(() => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'i-1',
                provider: 'granola',
                status: 'connected',
                externalAccountEmail: 'x@y.com',
                lastSyncAt: null,
                organizationId: 'org-1',
                userId: 'u-1',
              },
            ],
            error: null,
          }),
        })),
      },
    }));
    vi.doMock('../../src/middleware/auth.js', () => ({
      authMiddleware: (req: any, _res: any, next: any) => {
        req.user = { id: 'auth-1', organizationId: 'org-1' };
        next();
      },
    }));
    vi.doMock('../../src/middleware/orgScope.js', () => ({
      orgMiddleware: (_req: any, _res: any, next: any) => next(),
      requireOrg: (_req: any, _res: any, next: any) => next(),
      getOrgId: () => 'org-1',
    }));
    const express = (await import('express')).default;
    const router = (await import('../../src/routes/integrations.js')).default;
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { req.user = { id: 'auth-1', organizationId: 'org-1' }; next(); });
    app.use('/api/integrations', router);

    const res = await request(app).get('/api/integrations');
    expect(res.status).toBe(200);
    expect(res.body.integrations).toHaveLength(1);
    expect(res.body.integrations[0].provider).toBe('granola');
    expect(res.body.integrations[0].accessTokenEncrypted).toBeUndefined();
  });
});
