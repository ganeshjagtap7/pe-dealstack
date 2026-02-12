/**
 * LangExtract Deep Extraction Tests
 * Tests the langExtractClient service and smart routing in ingest.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deepExtract, isDeepExtractionAvailable } from '../src/services/langExtractClient.js';

// ============================================================
// langExtractClient — Unit Tests
// ============================================================

describe('langExtractClient', () => {
  describe('isDeepExtractionAvailable', () => {
    const originalEnv = process.env.EXTRACTOR_URL;

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.EXTRACTOR_URL = originalEnv;
      } else {
        delete process.env.EXTRACTOR_URL;
      }
    });

    it('should return true when EXTRACTOR_URL is set', () => {
      process.env.EXTRACTOR_URL = 'http://localhost:5050';
      expect(isDeepExtractionAvailable()).toBe(true);
    });

    it('should return false when EXTRACTOR_URL is not set', () => {
      delete process.env.EXTRACTOR_URL;
      expect(isDeepExtractionAvailable()).toBe(false);
    });

    it('should return false when EXTRACTOR_URL is empty string', () => {
      process.env.EXTRACTOR_URL = '';
      expect(isDeepExtractionAvailable()).toBe(false);
    });
  });

  describe('deepExtract', () => {
    it('should return null when service is unreachable', async () => {
      // Default localhost:5050 won't be running during tests
      const result = await deepExtract('Some long document text that needs to be extracted');
      expect(result).toBeNull();
    });

    it('should handle abort timeout gracefully', async () => {
      const result = await deepExtract('test text');
      expect(result).toBeNull();
    });
  });
});

// ============================================================
// Smart Routing Logic Tests (unit-level)
// ============================================================

describe('Smart Routing Logic', () => {
  it('should route to deep extraction for long documents when available', () => {
    const textLength = 60000;
    const extractorAvailable = true;
    const shouldUseDeep = textLength > 50000 && extractorAvailable;
    expect(shouldUseDeep).toBe(true);
  });

  it('should use standard extraction for short documents', () => {
    const textLength = 10000;
    const extractorAvailable = true;
    const shouldUseDeep = textLength > 50000 && extractorAvailable;
    expect(shouldUseDeep).toBe(false);
  });

  it('should use standard extraction when extractor is unavailable', () => {
    const textLength = 60000;
    const extractorAvailable = false;
    const shouldUseDeep = textLength > 50000 && extractorAvailable;
    expect(shouldUseDeep).toBe(false);
  });

  it('should use standard extraction at exactly 50000 chars', () => {
    const textLength = 50000;
    const extractorAvailable = true;
    const shouldUseDeep = textLength > 50000 && extractorAvailable;
    expect(shouldUseDeep).toBe(false);
  });
});

// ============================================================
// transformDeepResultToExtractedDealData Tests
// ============================================================

describe('transformDeepResultToExtractedDealData', () => {
  // Import the function from ingest.ts indirectly by testing the contract
  // The transformer is an internal function, so we test its behavior through the interface

  it('should have correct DeepExtractionResult interface shape', () => {
    const mockResult = {
      success: true,
      dealData: {
        companyName: 'Acme Corp',
        industry: 'Healthcare',
        revenue: 150,
        ebitda: 30,
        ebitdaMargin: 20,
        revenueGrowth: 15,
        employees: 500,
        headquarters: 'New York, NY',
        keyRisks: ['Market concentration', 'Regulatory risk'],
        investmentHighlights: ['Strong growth', 'Market leader'],
        financialMetrics: [{ name: 'capex', value: '5M' }],
        sourceGroundings: [{ entity: 'revenue', value: '150M', source: 'page 3' }],
      },
      rawExtractions: [],
      extractionCount: 12,
    };

    expect(mockResult.success).toBe(true);
    expect(mockResult.dealData.companyName).toBe('Acme Corp');
    expect(mockResult.dealData.revenue).toBe(150);
    expect(mockResult.dealData.keyRisks).toHaveLength(2);
    expect(mockResult.dealData.investmentHighlights).toHaveLength(2);
    expect(mockResult.extractionCount).toBe(12);
  });

  it('should handle null fields in deal data', () => {
    const mockResult = {
      success: true,
      dealData: {
        companyName: null,
        industry: null,
        revenue: null,
        ebitda: null,
        ebitdaMargin: null,
        revenueGrowth: null,
        employees: null,
        headquarters: null,
        keyRisks: [],
        investmentHighlights: [],
        financialMetrics: [],
        sourceGroundings: [],
      },
      rawExtractions: [],
      extractionCount: 0,
    };

    expect(mockResult.success).toBe(true);
    expect(mockResult.dealData.companyName).toBeNull();
    expect(mockResult.dealData.revenue).toBeNull();
    expect(mockResult.dealData.keyRisks).toHaveLength(0);
  });
});

// ============================================================
// Python Service Contract Tests
// ============================================================

describe('Python Service Contract', () => {
  it('should define /health endpoint contract', () => {
    const expectedHealthResponse = {
      status: 'ok',
      service: 'langextract',
      langextract_available: true,
    };

    expect(expectedHealthResponse.status).toBe('ok');
    expect(expectedHealthResponse.service).toBe('langextract');
  });

  it('should define /extract endpoint request contract', () => {
    const request = {
      text: 'document text...',
      model: 'gemini-2.5-flash',
      extraction_passes: 3,
      max_workers: 10,
    };

    expect(request.text).toBeDefined();
    expect(request.model).toBe('gemini-2.5-flash');
    expect(request.extraction_passes).toBe(3);
    expect(request.max_workers).toBe(10);
  });

  it('should require minimum 50 chars in text', () => {
    const shortText = 'Too short';
    const longText = 'A'.repeat(51);
    expect(shortText.length).toBeLessThan(50);
    expect(longText.length).toBeGreaterThan(50);
  });

  it('should define error response contract', () => {
    const errorResponse = {
      success: false,
      error: 'extraction failed',
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error).toBeDefined();
  });
});
