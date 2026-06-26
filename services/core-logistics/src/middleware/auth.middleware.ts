import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';
import { supabase } from '../config/database';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  } | {
    id: string;
    email: string;
    roles: string[];
    isAdmin: boolean;
  };
}

/**
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) { next(); return; }

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      (req as AuthRequest).user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role || 'customer',
      };
      next();
    } catch {
      next();
    }
  } catch {
    next();
  }
};

/**
 * Verify JWT token and check live account status.
 * Deleted/suspended accounts are rejected even if their JWT has not expired.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ResponseUtil.unauthorized(res, 'No token provided');
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      const userId = decoded.userId || decoded.id;

      // Live status check — deleted/suspended users cannot use old tokens
      const { data: userRow } = await supabase
        .from('users')
        .select('status')
        .eq('id', userId)
        .single();

      if (!userRow) {
        return ResponseUtil.unauthorized(res, 'Account not found');
      }
      if (userRow.status === 'account_deleted') {
        return ResponseUtil.unauthorized(res, 'This account has been deleted. Please register again.');
      }
      if (userRow.status !== 'active') {
        return ResponseUtil.unauthorized(res, 'Your account has been suspended. Please contact support.');
      }

      (req as AuthRequest).user = {
        id: userId,
        email: decoded.email,
        role: decoded.role || 'customer',
      };

      next();
    } catch (error) {
      logger.error('Token verification error:', error);
      return ResponseUtil.unauthorized(res, 'Invalid or expired token');
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return ResponseUtil.serverError(res, 'Authentication failed');
  }
};

/**
 * Check if user has required role
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const user = (req as AuthRequest).user;

    if (!user) {
      return ResponseUtil.unauthorized(res);
    }

    // Handle both single role and multiple roles (admin users)
    const userRoles = 'roles' in user ? user.roles : [user.role];
    const hasRequiredRole = userRoles.some(userRole => roles.includes(userRole));

    if (!hasRequiredRole) {
      return ResponseUtil.forbidden(res, 'Insufficient permissions');
    }

    next();
  };
};
