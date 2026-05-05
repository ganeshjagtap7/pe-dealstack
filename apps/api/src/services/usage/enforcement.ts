import { getUsageContext } from '../../middleware/usageContext.js';
import { getUserFlags } from './userFlags.js';
import { throttleIfNeeded } from './throttle.js';
import { recordUsageEvent } from './trackedLLM.js';
import type { UsageProvider } from './trackedLLM.js';

export class UserBlockedError extends Error {
  constructor(public userId: string) {
    super('User is blocked from AI features. Contact support.');
    this.name = 'UserBlockedError';
  }
}

/**
 * Check the current request's user against isBlocked / isThrottled.
 * - If no usage context, no-op (background paths bypass).
 * - If isBlocked, record a UsageEvent with status='blocked' and throw UserBlockedError.
 * - If isThrottled, sleep up to 2s then proceed.
 */
export async function enforceUserGate(
  operation: string,
  model: string | undefined,
  provider: UsageProvider,
): Promise<void> {
  const ctx = getUsageContext();
  if (!ctx) return;
  const flags = await getUserFlags(ctx.userId);
  if (flags.isBlocked) {
    void recordUsageEvent({
      operation,
      model: model ?? 'unknown',
      provider,
      promptTokens: 0,
      completionTokens: 0,
      status: 'blocked',
    } as any);
    throw new UserBlockedError(ctx.userId);
  }
  if (flags.isThrottled) {
    await throttleIfNeeded(ctx.userId);
  }
}
