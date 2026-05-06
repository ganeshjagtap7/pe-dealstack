import { supabase } from '../../supabase.js';
import { log } from '../../utils/logger.js';

const TTL_MS = 30_000;
const cache = new Map<string, { isBlocked: boolean; isThrottled: boolean; loadedAt: number }>();

export interface UserFlags {
  isBlocked: boolean;
  isThrottled: boolean;
}

export async function getUserFlags(userId: string): Promise<UserFlags> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) {
    return { isBlocked: cached.isBlocked, isThrottled: cached.isThrottled };
  }
  try {
    const { data } = await supabase
      .from('User')
      .select('isBlocked, isThrottled')
      .eq('id', userId)
      .single();
    const flags: UserFlags = {
      isBlocked: !!data?.isBlocked,
      isThrottled: !!data?.isThrottled,
    };
    cache.set(userId, { ...flags, loadedAt: Date.now() });
    return flags;
  } catch (err) {
    log.warn('getUserFlags: failed, defaulting to allow', { userId, err });
    return { isBlocked: false, isThrottled: false };
  }
}

/** Test-only / admin-action helper to invalidate a single user's cached flags. */
export function invalidateUserFlags(userId: string): void {
  cache.delete(userId);
}

export function _resetUserFlagsCache(): void {
  cache.clear();
}
