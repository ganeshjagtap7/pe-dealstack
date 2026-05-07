import { describe, it, expect, vi, beforeEach } from 'vitest';

const { flagsSpy, throttleSpy, recordSpy } = vi.hoisted(() => ({
  flagsSpy: vi.fn(),
  throttleSpy: vi.fn(async () => {}),
  recordSpy: vi.fn(),
}));

vi.mock('../../src/services/usage/userFlags.js', () => ({
  getUserFlags: flagsSpy,
  _resetUserFlagsCache: vi.fn(),
}));

vi.mock('../../src/services/usage/throttle.js', () => ({
  throttleIfNeeded: throttleSpy,
  _resetThrottleState: vi.fn(),
}));

vi.mock('../../src/services/usage/trackedLLM.js', () => ({
  recordUsageEvent: recordSpy,
}));

import { enforceUserGate, UserBlockedError } from '../../src/services/usage/enforcement.js';
import { runWithUsageContext } from '../../src/middleware/usageContext.js';

describe('enforceUserGate', () => {
  beforeEach(() => {
    flagsSpy.mockReset();
    recordSpy.mockClear();
  });

  it('no-ops when no usage context is bound', async () => {
    flagsSpy.mockResolvedValue({ isBlocked: false, isThrottled: false });
    await expect(enforceUserGate('deal_chat', 'gpt-4o', 'openai')).resolves.toBeUndefined();
    expect(flagsSpy).not.toHaveBeenCalled();
  });

  it('passes through when both flags are false', async () => {
    flagsSpy.mockResolvedValue({ isBlocked: false, isThrottled: false });
    await runWithUsageContext({ userId: 'u1', organizationId: 'o1', source: 'test' }, async () => {
      await expect(enforceUserGate('deal_chat', 'gpt-4o', 'openai')).resolves.toBeUndefined();
    });
    expect(recordSpy).not.toHaveBeenCalled();
  });

  it('throws UserBlockedError and records a blocked UsageEvent when isBlocked=true', async () => {
    flagsSpy.mockResolvedValue({ isBlocked: true, isThrottled: false });
    await runWithUsageContext({ userId: 'u1', organizationId: 'o1', source: 'test' }, async () => {
      await expect(enforceUserGate('deal_chat', 'gpt-4o', 'openai')).rejects.toBeInstanceOf(UserBlockedError);
    });
    expect(recordSpy).toHaveBeenCalledOnce();
    const row = recordSpy.mock.calls[0][0];
    expect(row.status).toBe('blocked');
    expect(row.operation).toBe('deal_chat');
  });

  it('passes through but throttles when isThrottled=true', async () => {
    flagsSpy.mockResolvedValue({ isBlocked: false, isThrottled: true });
    await runWithUsageContext({ userId: 'u1', organizationId: 'o1', source: 'test' }, async () => {
      await expect(enforceUserGate('deal_chat', 'gpt-4o', 'openai')).resolves.toBeUndefined();
    });
    expect(recordSpy).not.toHaveBeenCalled();
  });
});
