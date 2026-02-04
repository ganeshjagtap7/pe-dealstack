/**
 * Deals API Endpoint Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';

// Sample deal data
const mockDeals = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    name: 'Apex Logistics',
    stage: 'DUE_DILIGENCE',
    status: 'ACTIVE',
    industry: 'Supply Chain SaaS',
    dealSize: 48,
    revenue: 48,
    ebitda: 12.4,
    irrProjected: 24.5,
    mom: 3.5,
    company: { id: 'company-1', name: 'Apex Logistics Corp' },
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    name: 'MediCare Plus',
    stage: 'INITIAL_REVIEW',
    status: 'ACTIVE',
    industry: 'Healthcare Services',
    dealSize: 180,
    revenue: 180,
    ebitda: 45,
    irrProjected: 18.2,
    mom: 2.1,
    company: { id: 'company-2', name: 'MediCare Plus Inc' },
  },
];

// Mock supabase client
const mockSupabase = {
  from: vi.fn(),
};

// Create test app with deals routes
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Mock auth middleware
  app.use((req: any, res, next) => {
    req.user = { id: 'test-user-id', email: 'test@example.com', role: 'ADMIN' };
    next();
  });

  // GET /api/deals
  app.get('/api/deals', async (req, res) => {
    try {
      const { stage, status, industry, search } = req.query;

      // Simulate filtering
      let filteredDeals = [...mockDeals];

      if (stage) {
        filteredDeals = filteredDeals.filter((d) => d.stage === stage);
      }
      if (status) {
        filteredDeals = filteredDeals.filter((d) => d.status === status);
      }
      if (industry) {
        filteredDeals = filteredDeals.filter((d) =>
          d.industry.toLowerCase().includes((industry as string).toLowerCase())
        );
      }
      if (search) {
        const searchLower = (search as string).toLowerCase();
        filteredDeals = filteredDeals.filter(
          (d) =>
            d.name.toLowerCase().includes(searchLower) ||
            d.industry.toLowerCase().includes(searchLower)
        );
      }

      res.json(filteredDeals);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch deals' });
    }
  });

  // GET /api/deals/stats/summary
  app.get('/api/deals/stats/summary', async (req, res) => {
    const total = mockDeals.length;
    const active = mockDeals.filter((d) => d.status === 'ACTIVE').length;
    const passed = mockDeals.filter((d) => d.status === 'PASSED').length;

    const byStage = mockDeals.reduce((acc: Record<string, number>, deal) => {
      acc[deal.stage] = (acc[deal.stage] || 0) + 1;
      return acc;
    }, {});

    res.json({
      total,
      active,
      passed,
      byStage: Object.entries(byStage).map(([stage, count]) => ({ stage, count })),
    });
  });

  // GET /api/deals/:id
  app.get('/api/deals/:id', async (req, res) => {
    const { id } = req.params;
    const deal = mockDeals.find((d) => d.id === id);

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json(deal);
  });

  // POST /api/deals
  const createDealSchema = z.object({
    name: z.string().min(1),
    companyId: z.string().optional(),
    companyName: z.string().optional(),
    stage: z.string().default('INITIAL_REVIEW'),
    status: z.string().default('ACTIVE'),
    industry: z.string().optional(),
    dealSize: z.number().optional(),
  });

  app.post('/api/deals', async (req, res) => {
    try {
      const data = createDealSchema.parse(req.body);

      if (!data.companyId && !data.companyName) {
        return res.status(400).json({ error: 'Company ID or name is required' });
      }

      const newDeal = {
        id: 'new-deal-id-123',
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      res.status(201).json(newDeal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create deal' });
    }
  });

  // PATCH /api/deals/:id
  app.patch('/api/deals/:id', async (req, res) => {
    const { id } = req.params;
    const deal = mockDeals.find((d) => d.id === id);

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const updatedDeal = { ...deal, ...req.body, updatedAt: new Date().toISOString() };
    res.json(updatedDeal);
  });

  // DELETE /api/deals/:id
  app.delete('/api/deals/:id', async (req, res) => {
    const { id } = req.params;
    const deal = mockDeals.find((d) => d.id === id);

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.status(204).send();
  });

  return app;
};

describe('Deals API Endpoints', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('GET /api/deals', () => {
    it('should return all deals', async () => {
      const response = await request(app).get('/api/deals');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should filter deals by stage', async () => {
      const response = await request(app).get('/api/deals?stage=DUE_DILIGENCE');

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].stage).toBe('DUE_DILIGENCE');
    });

    it('should filter deals by industry', async () => {
      const response = await request(app).get('/api/deals?industry=Healthcare');

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].industry).toContain('Healthcare');
    });

    it('should search deals by name', async () => {
      const response = await request(app).get('/api/deals?search=Apex');

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].name).toBe('Apex Logistics');
    });
  });

  describe('GET /api/deals/stats/summary', () => {
    it('should return deal statistics', async () => {
      const response = await request(app).get('/api/deals/stats/summary');

      expect(response.status).toBe(200);
      expect(response.body.total).toBe(2);
      expect(response.body.active).toBe(2);
      expect(response.body.passed).toBe(0);
      expect(Array.isArray(response.body.byStage)).toBe(true);
    });
  });

  describe('GET /api/deals/:id', () => {
    it('should return a single deal by ID', async () => {
      const response = await request(app).get(
        '/api/deals/550e8400-e29b-41d4-a716-446655440001'
      );

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Apex Logistics');
      expect(response.body.id).toBe('550e8400-e29b-41d4-a716-446655440001');
    });

    it('should return 404 for non-existent deal', async () => {
      const response = await request(app).get('/api/deals/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Deal not found');
    });
  });

  describe('POST /api/deals', () => {
    it('should create a new deal with valid data', async () => {
      const newDeal = {
        name: 'New Test Deal',
        companyName: 'Test Company',
        industry: 'Technology',
        dealSize: 50,
      };

      const response = await request(app).post('/api/deals').send(newDeal);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Test Deal');
      expect(response.body.industry).toBe('Technology');
      expect(response.body.id).toBeDefined();
    });

    it('should return 400 when company is missing', async () => {
      const invalidDeal = {
        name: 'Test Deal',
        industry: 'Technology',
      };

      const response = await request(app).post('/api/deals').send(invalidDeal);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Company ID or name is required');
    });

    it('should return 400 when name is missing', async () => {
      const invalidDeal = {
        companyName: 'Test Company',
      };

      const response = await request(app).post('/api/deals').send(invalidDeal);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('PATCH /api/deals/:id', () => {
    it('should update an existing deal', async () => {
      const updates = {
        stage: 'LOI_SUBMITTED',
        dealSize: 55,
      };

      const response = await request(app)
        .patch('/api/deals/550e8400-e29b-41d4-a716-446655440001')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.stage).toBe('LOI_SUBMITTED');
      expect(response.body.dealSize).toBe(55);
    });

    it('should return 404 for non-existent deal', async () => {
      const response = await request(app)
        .patch('/api/deals/non-existent-id')
        .send({ stage: 'LOI_SUBMITTED' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/deals/:id', () => {
    it('should delete an existing deal', async () => {
      const response = await request(app).delete(
        '/api/deals/550e8400-e29b-41d4-a716-446655440001'
      );

      expect(response.status).toBe(204);
    });

    it('should return 404 for non-existent deal', async () => {
      const response = await request(app).delete('/api/deals/non-existent-id');

      expect(response.status).toBe(404);
    });
  });
});

describe('Deal Validation', () => {
  const app = createTestApp();

  it('should validate deal name is not empty', async () => {
    const response = await request(app).post('/api/deals').send({
      name: '',
      companyName: 'Test Company',
    });

    expect(response.status).toBe(400);
  });

  it('should accept optional numeric fields', async () => {
    const response = await request(app).post('/api/deals').send({
      name: 'Valid Deal',
      companyName: 'Test Company',
      dealSize: 100,
      industry: 'Tech',
    });

    expect(response.status).toBe(201);
    expect(response.body.dealSize).toBe(100);
  });
});
