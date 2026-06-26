import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { ResponseUtil } from '../utils/response';
import logger from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    roles?: string[];
  };
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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
    const secret = process.env.JWT_SECRET;
    if (!secret) return ResponseUtil.serverError(res, 'Auth configuration error');

    const decoded = jwt.verify(token, secret) as any;
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
      roles: decoded.roles,
    };
    next();
  } catch (err) {
    logger.warn('JWT verification failed', { err });
    return ResponseUtil.unauthorized(res, 'Invalid or expired token');
  }
};

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    const user = (req as AuthRequest).user;
    if (!user) return ResponseUtil.unauthorized(res);

    const userRoles = user.roles?.length ? user.roles : [user.role];
    if (!userRoles.some((r) => roles.includes(r))) {
      return ResponseUtil.forbidden(res, 'Insufficient permissions');
    }
    next();
  };
};
