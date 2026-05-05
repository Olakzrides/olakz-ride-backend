import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { logger } from '../utils/logger';
import { ResponseUtil } from '../utils/response';

export interface AdminUser {
  id: string;
  email: string;
  roles: string[];
  isAdmin: boolean;
}

export interface AdminRequest extends Request {
  user?: AdminUser;
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Verifies the JWT and checks for admin or super_admin role.
 */
export const adminAuthMiddleware = (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      ResponseUtil.unauthorized(res, 'Admin authentication required', 'ADMIN_AUTH_REQUIRED');
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.jwt.secret) as Record<string, unknown>;

    const userId = (decoded.id || decoded.userId) as string | undefined;
    if (!userId) {
      ResponseUtil.unauthorized(res, 'Invalid admin token', 'INVALID_ADMIN_TOKEN');
      return;
    }

    const userRoles: string[] =
      Array.isArray(decoded.roles)
        ? (decoded.roles as string[])
        : decoded.role
        ? [decoded.role as string]
        : [];

    const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');
    if (!isAdmin) {
      ResponseUtil.forbidden(res, 'Admin access required', 'ADMIN_ACCESS_REQUIRED');
      return;
    }

    req.user = { id: userId, email: decoded.email as string, roles: userRoles, isAdmin: true };

    logger.info('Admin authenticated', { adminId: userId, roles: userRoles, path: req.path });
    next();
  } catch (err: unknown) {
    const name = err instanceof Error ? (err as NodeJS.ErrnoException).name : '';
    if (name === 'JsonWebTokenError') {
      ResponseUtil.unauthorized(res, 'Invalid admin token', 'INVALID_ADMIN_TOKEN');
    } else if (name === 'TokenExpiredError') {
      ResponseUtil.unauthorized(res, 'Admin token expired', 'ADMIN_TOKEN_EXPIRED');
    } else {
      logger.error('Admin auth middleware error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Admin authentication error', 'ADMIN_AUTH_ERROR');
    }
  }
};

/**
 * Requires super_admin role. Must run after adminAuthMiddleware.
 */
export const superAdminMiddleware = (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    ResponseUtil.unauthorized(res, 'Authentication required', 'AUTH_REQUIRED');
    return;
  }

  if (!req.user.roles.includes('super_admin')) {
    ResponseUtil.forbidden(res, 'Super admin access required', 'SUPER_ADMIN_REQUIRED');
    return;
  }

  next();
};
