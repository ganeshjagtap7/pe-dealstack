import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';

export interface UsageContext {
  userId: string;
  organizationId: string;
  requestId?: string;
  source: 'http' | 'background' | 'test';
}

const storage = new AsyncLocalStorage<UsageContext>();

export function getUsageContext(): UsageContext | undefined {
  return storage.getStore();
}

export function runWithUsageContext<T>(ctx: UsageContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Express middleware. Must run AFTER authMiddleware + orgMiddleware so req.user
 * has both id and organizationId populated. If either is missing, no-ops.
 */
export function usageContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const userId = req.user?.id;
  const organizationId = req.user?.organizationId;
  if (!userId || !organizationId) {
    return next();
  }
  const requestId = (req.headers['x-request-id'] as string) || undefined;
  storage.run({ userId, organizationId, requestId, source: 'http' }, () => next());
}
