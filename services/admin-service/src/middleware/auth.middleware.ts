import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { logger } from '../utils/logger';
import { ResponseUtil } from '../utils/response';
import { supabase } from '../config/database';

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
 * Check if the user's tokens have been globally revoked.
 *
 * We store a row in `admin_token_revocations` keyed by user_id whenever
 * a super admin strips the admin role or suspends the account. The row
 * holds a `revoked_at` timestamp. Any JWT whose `iat` (issued-at) is
 * BEFORE that timestamp is considered invalid — even if the JWT signature
 * itself is still valid.
 *
 * This gives us instant forced-logout without needing to track individual
 * tokens or maintain a full blacklist.
 */
async function isTokenRevoked(userId: string, tokenIssuedAt: number): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('admin_token_revocations')
      .select('revoked_at')
      .eq('user_id', userId)
      .order('revoked_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return false; // no revocation record — token is valid

    // Token issued BEFORE the revocation time → forcibly expired
    const revokedAtMs = new Date(data.revoked_at).getTime();
    const issuedAtMs  = tokenIssuedAt * 1000; // JWT iat is in seconds

    return issuedAtMs < revokedAtMs;
  } catch (err) {
    // If DB check fails, fail open (don't block legitimate admins due to DB hiccup)
    logger.error('isTokenRevoked DB check failed (fail-open)', { userId, error: toMessage(err) });
    return false;
  }
}

/**
 * Verifies the JWT, checks admin/super_admin role, and validates
 * against the token revocation table for instant forced-logout.
 *
 * Made async to support the DB revocation check.
 */
export const adminAuthMiddleware = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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

    // ── Revocation check ────────────────────────────────────────────────────
    // iat is the Unix timestamp (seconds) when the JWT was signed.
    const iat = decoded.iat as number | undefined;
    if (iat) {
      const revoked = await isTokenRevoked(userId, iat);
      if (revoked) {
        ResponseUtil.unauthorized(
          res,
          'Your admin access has been revoked. Please log in again.',
          'TOKEN_REVOKED'
        );
        return;
      }
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
