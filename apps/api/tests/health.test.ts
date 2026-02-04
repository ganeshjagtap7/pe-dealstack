/**
 * Health Check Endpoint Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Create a minimal test app
const app = express();
app.use(express.json());

// Mock supabase for health check
const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
};

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { error } = await mockSupabase.from('Company').select('count');

    if (error) throw error;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
    });
  }
});

describe('Health Check Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 and healthy status when database is connected', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.database).toBe('connected');
    expect(response.body.timestamp).toBeDefined();
  });

  it('should return 500 when database connection fails', async () => {
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('Connection failed') }),
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(500);
    expect(response.body.status).toBe('error');
    expect(response.body.database).toBe('disconnected');
  });
});

describe('API Root Endpoint', () => {
  const apiApp = express();
  apiApp.get('/api', (req, res) => {
    res.json({
      message: 'AI CRM API v0.1.0',
      endpoints: {
        deals: '/api/deals',
        companies: '/api/companies',
        health: '/health',
      },
    });
  });

  it('should return API information', async () => {
    const response = await request(apiApp).get('/api');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('AI CRM API v0.1.0');
    expect(response.body.endpoints).toBeDefined();
    expect(response.body.endpoints.deals).toBe('/api/deals');
  });
});
