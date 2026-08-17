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
    roles?: string[];
  };
}

/**
 * Verify JWT token and enforce live account status.
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return ResponseUtil.unauthorized(res, 'No token provided');
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      const userId = decoded.userId || decoded.id;

      // Live account status + roles check — always read from DB so role changes
      // (vendor approval, suspension) take effect without requiring re-login
      const { data: userRow } = await supabase
        .from('users')
        .select('status, roles, active_role')
        .eq('id', userId)
        .single();

      if (!userRow) return ResponseUtil.unauthorized(res, 'Account not found');
      if (userRow.status === 'account_deleted')
        return ResponseUtil.unauthorized(res, 'This account has been deleted. Please register again.');
      if (userRow.status !== 'active')
        return ResponseUtil.unauthorized(res, 'Your account has been suspended. Please contact support.');

      // Use live roles from DB — not the JWT payload (which may be stale)
      const liveRoles: string[] = (userRow.roles as string[]) ?? [decoded.role ?? 'customer'];

      (req as AuthRequest).user = {
        id: userId,
        email: decoded.email,
        role: userRow.active_role ?? decoded.role ?? 'customer',
        roles: liveRoles,
      };

      next();
    } catch (err) {
      logger.error('Token verification error:', err);
      return ResponseUtil.unauthorized(res, 'Invalid or expired token');
    }
  } catch (err) {
    logger.error('Authentication middleware error:', err);
    return ResponseUtil.serverError(res, 'Authentication failed');
  }
};

/**
 * Optional auth — does not fail if no token is present.
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, config.jwtSecret) as any;
      (req as AuthRequest).user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role || 'customer',
      };
    } catch {
      // silently ignore invalid token
    }
  } catch {
    // silently ignore
  }
  next();
};

/**
 * Role-based access control.
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const user = (req as AuthRequest).user;
    if (!user) return ResponseUtil.unauthorized(res);

    const userRoles = user.roles ?? [user.role];
    const allowed = userRoles.some((r) => roles.includes(r));

    if (!allowed) return ResponseUtil.forbidden(res, 'Insufficient permissions');
    next();
  };
};
