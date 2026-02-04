/**
 * Companies API Endpoint Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';

// Sample company data
const mockCompanies = [
  {
    id: 'company-1',
    name: 'Apex Logistics Corp',
    industry: 'Supply Chain SaaS',
    description: 'Leading supply chain management platform',
    website: 'https://apexlogistics.example.com',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'company-2',
    name: 'MediCare Plus Inc',
    industry: 'Healthcare Services',
    description: 'Healthcare services provider',
    website: 'https://medicareplus.example.com',
    createdAt: '2024-01-20T10:00:00Z',
  },
];

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Mock auth middleware
  app.use((req: any, res, next) => {
    req.user = { id: 'test-user-id', email: 'test@example.com', role: 'ADMIN' };
    next();
  });

  // GET /api/companies
  app.get('/api/companies', async (req, res) => {
    const { search } = req.query;

    let filteredCompanies = [...mockCompanies];

    if (search) {
      const searchLower = (search as string).toLowerCase();
      filteredCompanies = filteredCompanies.filter(
        (c) =>
          c.name.toLowerCase().includes(searchLower) ||
          c.industry?.toLowerCase().includes(searchLower)
      );
    }

    res.json(filteredCompanies);
  });

  // GET /api/companies/:id
  app.get('/api/companies/:id', async (req, res) => {
    const { id } = req.params;
    const company = mockCompanies.find((c) => c.id === id);

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.json(company);
  });

  // POST /api/companies
  const createCompanySchema = z.object({
    name: z.string().min(1),
    industry: z.string().optional(),
    description: z.string().optional(),
    website: z.string().url().optional(),
  });

  app.post('/api/companies', async (req, res) => {
    try {
      const data = createCompanySchema.parse(req.body);

      const newCompany = {
        id: 'new-company-id',
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      res.status(201).json(newCompany);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation error', details: error.errors });
      }
      res.status(500).json({ error: 'Failed to create company' });
    }
  });

  // PATCH /api/companies/:id
  app.patch('/api/companies/:id', async (req, res) => {
    const { id } = req.params;
    const company = mockCompanies.find((c) => c.id === id);

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const updatedCompany = { ...company, ...req.body, updatedAt: new Date().toISOString() };
    res.json(updatedCompany);
  });

  // DELETE /api/companies/:id
  app.delete('/api/companies/:id', async (req, res) => {
    const { id } = req.params;
    const company = mockCompanies.find((c) => c.id === id);

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    res.status(204).send();
  });

  return app;
};

describe('Companies API Endpoints', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe('GET /api/companies', () => {
    it('should return all companies', async () => {
      const response = await request(app).get('/api/companies');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should search companies by name', async () => {
      const response = await request(app).get('/api/companies?search=Apex');

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].name).toBe('Apex Logistics Corp');
    });

    it('should search companies by industry', async () => {
      const response = await request(app).get('/api/companies?search=Healthcare');

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].industry).toBe('Healthcare Services');
    });
  });

  describe('GET /api/companies/:id', () => {
    it('should return a single company by ID', async () => {
      const response = await request(app).get('/api/companies/company-1');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Apex Logistics Corp');
    });

    it('should return 404 for non-existent company', async () => {
      const response = await request(app).get('/api/companies/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Company not found');
    });
  });

  describe('POST /api/companies', () => {
    it('should create a new company with valid data', async () => {
      const newCompany = {
        name: 'New Tech Corp',
        industry: 'Technology',
        description: 'A new tech company',
        website: 'https://newtech.example.com',
      };

      const response = await request(app).post('/api/companies').send(newCompany);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Tech Corp');
      expect(response.body.id).toBeDefined();
    });

    it('should return 400 when name is missing', async () => {
      const invalidCompany = {
        industry: 'Technology',
      };

      const response = await request(app).post('/api/companies').send(invalidCompany);

      expect(response.status).toBe(400);
    });

    it('should validate website URL format', async () => {
      const invalidCompany = {
        name: 'Test Company',
        website: 'not-a-valid-url',
      };

      const response = await request(app).post('/api/companies').send(invalidCompany);

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/companies/:id', () => {
    it('should update an existing company', async () => {
      const updates = {
        description: 'Updated description',
      };

      const response = await request(app)
        .patch('/api/companies/company-1')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body.description).toBe('Updated description');
    });

    it('should return 404 for non-existent company', async () => {
      const response = await request(app)
        .patch('/api/companies/non-existent')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/companies/:id', () => {
    it('should delete an existing company', async () => {
      const response = await request(app).delete('/api/companies/company-1');

      expect(response.status).toBe(204);
    });

    it('should return 404 for non-existent company', async () => {
      const response = await request(app).delete('/api/companies/non-existent');

      expect(response.status).toBe(404);
    });
  });
});
