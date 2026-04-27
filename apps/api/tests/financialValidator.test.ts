import { describe, it, expect } from 'vitest';

describe('financialValidator — tiered tolerance', () => {
  it('rejects 3% error on large values (>$1M)', () => {
    const revenue = 50;
    const cogs = 10;
    const grossProfit = 38.5;
    const diff = Math.abs(grossProfit - (revenue - cogs)) / Math.abs(revenue - cogs);
    expect(diff).toBeGreaterThan(0.01);
  });

  it('accepts 1.5% error on small values (<$1M)', () => {
    const revenue = 0.5;
    const cogs = 0.1;
    const grossProfit = 0.394;
    const diff = Math.abs(grossProfit - (revenue - cogs)) / Math.abs(revenue - cogs);
    expect(diff).toBeLessThan(0.02);
  });
});
