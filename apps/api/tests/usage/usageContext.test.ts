import { describe, it, expect } from 'vitest';
import { runWithUsageContext, getUsageContext } from '../../src/middleware/usageContext.js';

describe('usageContext', () => {
  it('returns undefined outside any context', () => {
    expect(getUsageContext()).toBeUndefined();
  });

  it('binds context inside runWithUsageContext', () => {
    const ctx = { userId: 'u1', organizationId: 'o1', source: 'test' as const };
    runWithUsageContext(ctx, () => {
      expect(getUsageContext()).toEqual(ctx);
    });
  });

  it('isolates parallel contexts', async () => {
    const results: Array<string | undefined> = [];
    await Promise.all([
      runWithUsageContext({ userId: 'u1', organizationId: 'o1', source: 'test' as const }, async () => {
        await new Promise(r => setTimeout(r, 10));
        results.push(getUsageContext()?.userId);
      }),
      runWithUsageContext({ userId: 'u2', organizationId: 'o2', source: 'test' as const }, async () => {
        results.push(getUsageContext()?.userId);
      }),
    ]);
    expect(results.sort()).toEqual(['u1', 'u2']);
  });
});
