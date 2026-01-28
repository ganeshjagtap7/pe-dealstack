import { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabase.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role?: string;
        user_metadata?: Record<string, any>;
      };
    }
  }
}

/**
 * Authentication middleware that verifies Supabase JWT tokens
 * Extracts user information and attaches it to the request
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization header provided',
      });
      return;
    }

    // Check for Bearer token
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authorization header format. Use Bearer token.',
      });
      return;
    }

    // Extract the token
    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
      });
      return;
    }

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Auth error:', error?.message || 'User not found');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      return;
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email || '',
      role: user.user_metadata?.role,
      user_metadata: user.user_metadata,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
}

/**
 * Optional authentication middleware
 * Attaches user if token is provided, but doesn't require it
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      if (token) {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (!error && user) {
          req.user = {
            id: user.id,
            email: user.email || '',
            role: user.user_metadata?.role,
            user_metadata: user.user_metadata,
          };
        }
      }
    }

    next();
  } catch (error) {
    // Silently continue without user attached
    next();
  }
}

/**
 * Role-based access control middleware
 * Must be used after authMiddleware
 * @param allowedRoles - Array of roles that can access the route
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      return;
    }

    const userRole = req.user.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      res.status(403).json({
        error: 'Forbidden',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}
