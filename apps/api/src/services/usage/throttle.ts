const THROTTLE_INTERVAL_MS = 2000;
const lastCall = new Map<string, number>();

/**
 * Enforce a soft per-user throttle. If the user has called an LLM within
 * the last THROTTLE_INTERVAL_MS, sleep until that interval has elapsed.
 * Updates lastCall to the time AFTER the (possible) sleep.
 */
export async function throttleIfNeeded(userId: string): Promise<void> {
  const last = lastCall.get(userId) ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < THROTTLE_INTERVAL_MS) {
    await new Promise(r => setTimeout(r, THROTTLE_INTERVAL_MS - elapsed));
  }
  lastCall.set(userId, Date.now());
}

export function _resetThrottleState(): void {
  lastCall.clear();
}
