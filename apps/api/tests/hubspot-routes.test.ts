import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockSupabase = { from: vi.fn() };
vi.mock('../src/supabase.js', () => ({ supabase: mockSupabase }));
vi.mock('../src/utils/logger.js', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../src/middleware/orgScope.js', () => ({ getOrgId: () => 'org-A' }));
vi.mock('../src/services/encryption.js', () => ({
  encryptField: (v: string) => `enc:${v}`, decryptField: (v: string) => v.replace(/^enc:/, ''),
}));
const validateToken = vi.fn().mockResolvedValue(true);
vi.mock('../src/services/hubspot/client.js', () => ({
  HubSpotClient: vi.fn().mockImplementation(function () { return { validateToken }; }),
}));
vi.mock('../src/services/hubspot/importEngine.js', () => ({ runImportBatch: vi.fn().mockResolvedValue(false) }));

const buildApp = async () => {
  const { default: router } = await import('../src/routes/hubspot-import.js');
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.user = { id: 'u1' }; next(); });
  app.use('/api/integrations/hubspot', router);
  return app;
};

const chain = (overrides: Record<string, any> = {}) => ({
  select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(),
  upsert: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null }), ...overrides,
});

describe('hubspot-import routes', () => {
  beforeEach(() => { vi.clearAllMocks(); validateToken.mockResolvedValue(true); });

  it('POST /connect rejects an invalid token', async () => {
    validateToken.mockResolvedValue(false);
    mockSupabase.from.mockReturnValue(chain());
    const res = await request(await buildApp()).post('/api/integrations/hubspot/connect').send({ token: 'bad-token-1234' });
    expect(res.status).toBe(400);
  });

  it('POST /connect stores an encrypted token and returns connected', async () => {
    mockSupabase.from.mockReturnValue(chain());
    const res = await request(await buildApp()).post('/api/integrations/hubspot/connect').send({ token: 'good-token' });
    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
  });

  it('POST /import creates a job and returns jobId', async () => {
    mockSupabase.from.mockReturnValue(chain({
      maybeSingle: vi.fn()
        .mockResolvedValueOnce({ data: { accessToken: 'enc:tok' } }) // connection lookup
        .mockResolvedValueOnce({ data: { id: 'job-1' } }),           // created job
    }));
    const res = await request(await buildApp()).post('/api/integrations/hubspot/import').send({});
    expect(res.status).toBe(202);
    expect(res.body.jobId).toBe('job-1');
  });

  it('GET /import/:id returns status', async () => {
    mockSupabase.from.mockReturnValue(chain({
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'job-1', status: 'running', objectCounts: {} } }),
    }));
    const res = await request(await buildApp()).get('/api/integrations/hubspot/import/job-1');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('running');
  });
});
