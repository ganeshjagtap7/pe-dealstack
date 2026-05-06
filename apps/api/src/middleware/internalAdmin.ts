import { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';
import { log } from '../utils/logger.js';

/**
 * Gate for /api/internal/* routes. Looks up User.isInternal by authId.
 * Returns 404 (not 403) on failure to prevent enumeration of internal routes.
 */
export async function requireInternalAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authId = req.user?.id;
  if (!authId) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  const { data, error } = await supabase
    .from('User')
    .select('isInternal')
    .eq('authId', authId)
    .single();
  if (error || !data?.isInternal) {
    log.info('requireInternalAdmin: denied', { authId });
    res.status(404).json({ error: 'Not Found' });
    return;
  }
  next();
}
