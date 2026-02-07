/**
 * Request ID Middleware
 * Adds a unique request ID to each request for error correlation and tracing
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

/**
 * Middleware that assigns a unique ID to each request
 * Uses X-Request-ID header if provided, otherwise generates a new UUID
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use existing request ID from header or generate new one
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  // Attach to request object
  req.requestId = requestId;

  // Add to response headers for client correlation
  res.setHeader('X-Request-ID', requestId);

  next();
}

export default requestIdMiddleware;
