/**
 * Financial Data Validation Tests
 * Tests the validateFinancials service for PE deal data sanity checks.
 */

import { describe, it, expect } from 'vitest';

// ============================================================
// Financial Validator — Unit Tests
// ============================================================

describe('validateFinancials', () => {
  async function getValidator() {
    const mod = await import('../src/services/financialValidator.js');
    return mod.validateFinancials;
  }

  it('should export validateFinancials function', async () => {
    const validate = await getValidator();
    expect(typeof validate).toBe('function');
  });

  it('should return valid for normal PE financial data', async () => {
    const validate = await getValidator();
    const result = validate({
      revenue: 150,     // $150M
      ebitda: 30,       // $30M
      ebitdaMargin: 20, // 20%
      revenueGrowth: 15,
      employees: 500,
    });
    expect(result.isValid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('should return valid for null/undefined values', async () => {
    const validate = await getValidator();
    const result = validate({
      revenue: null,
      ebitda: null,
      ebitdaMargin: null,
      revenueGrowth: null,
      employees: null,
    });
    expect(result.isValid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('should return valid for empty input', async () => {
    const validate = await getValidator();
    const result = validate({});
    expect(result.isValid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  // Revenue checks
  it('should flag revenue > $50B as likely in thousands', async () => {
    const validate = await getValidator();
    const result = validate({ revenue: 75000 }); // $75,000M = $75B
    expect(result.isValid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('too high');
    expect(result.corrections.revenue).toBeDefined();
    expect(result.corrections.revenue.corrected).toBe(75);
  });

  it('should flag very low revenue', async () => {
    const validate = await getValidator();
    const result = validate({ revenue: 0.05 }); // $50K
    expect(result.isValid).toBe(false);
    expect(result.warnings[0]).toContain('too low');
  });

  it('should flag negative revenue', async () => {
    const validate = await getValidator();
    const result = validate({ revenue: -10 });
    expect(result.isValid).toBe(false);
    expect(result.warnings[0]).toContain('negative');
  });

  it('should accept normal revenue range', async () => {
    const validate = await getValidator();
    const result = validate({ revenue: 250 }); // $250M
    expect(result.isValid).toBe(true);
  });

  // EBITDA margin checks
  it('should flag EBITDA margin > 80%', async () => {
    const validate = await getValidator();
    const result = validate({ ebitdaMargin: 95 });
    expect(result.isValid).toBe(false);
    expect(result.warnings[0]).toContain('unusually high');
  });

  it('should flag EBITDA margin < -50%', async () => {
    const validate = await getValidator();
    const result = validate({ ebitdaMargin: -60 });
    expect(result.isValid).toBe(false);
    expect(result.warnings[0]).toContain('significant losses');
  });

  // Cross-check: EBITDA vs Revenue
  it('should flag EBITDA exceeding revenue', async () => {
    const validate = await getValidator();
    const result = validate({ revenue: 50, ebitda: 80 });
    expect(result.isValid).toBe(false);
    expect(result.warnings.some(w => w.includes('exceeds revenue'))).toBe(true);
  });

  it('should flag EBITDA margin mismatch', async () => {
    const validate = await getValidator();
    const result = validate({
      revenue: 100,
      ebitda: 20,       // 20% calculated
      ebitdaMargin: 40, // 40% extracted — mismatch
    });
    expect(result.isValid).toBe(false);
    expect(result.warnings.some(w => w.includes('mismatch'))).toBe(true);
  });

  it('should accept matching EBITDA margin', async () => {
    const validate = await getValidator();
    const result = validate({
      revenue: 100,
      ebitda: 25,       // 25% calculated
      ebitdaMargin: 25, // 25% extracted — matches
    });
    expect(result.isValid).toBe(true);
  });

  // Revenue growth checks
  it('should flag revenue growth > 200%', async () => {
    const validate = await getValidator();
    const result = validate({ revenueGrowth: 350 });
    expect(result.isValid).toBe(false);
    expect(result.warnings[0]).toContain('exceptionally high');
  });

  it('should accept normal revenue growth', async () => {
    const validate = await getValidator();
    const result = validate({ revenueGrowth: 25 });
    expect(result.isValid).toBe(true);
  });

  // Employee checks
  it('should flag > 100K employees', async () => {
    const validate = await getValidator();
    const result = validate({ employees: 150000 });
    expect(result.isValid).toBe(false);
    expect(result.warnings[0]).toContain('very high');
  });

  it('should flag very low revenue per employee', async () => {
    const validate = await getValidator();
    const result = validate({ revenue: 1, employees: 5000 }); // $1M / 5000 = $200 per employee
    expect(result.isValid).toBe(false);
    expect(result.warnings.some(w => w.includes('per employee'))).toBe(true);
  });

  it('should accept normal employee count', async () => {
    const validate = await getValidator();
    const result = validate({ revenue: 50, employees: 200 }); // $250K per employee
    expect(result.isValid).toBe(true);
  });

  // Multiple warnings
  it('should accumulate multiple warnings', async () => {
    const validate = await getValidator();
    const result = validate({
      revenue: -10,
      ebitdaMargin: 95,
      revenueGrowth: 500,
      employees: 200000,
    });
    expect(result.isValid).toBe(false);
    expect(result.warnings.length).toBeGreaterThanOrEqual(4);
  });

  // Return shape
  it('should return correct shape', async () => {
    const validate = await getValidator();
    const result = validate({ revenue: 100 });
    expect(result).toHaveProperty('isValid');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('corrections');
    expect(typeof result.isValid).toBe('boolean');
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(typeof result.corrections).toBe('object');
  });
});
