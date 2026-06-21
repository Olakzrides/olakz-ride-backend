import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import { ResponseUtil } from '../utils/response';
import config from '../config';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; roles: string[] };
}

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    ResponseUtil.unauthorized(res, 'Missing or invalid authorization header');
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    const userId = decoded.sub || decoded.userId || decoded.id;

    // Live status check — deleted/suspended users cannot use old tokens
    const { data: userRow } = await supabase
      .from('users')
      .select('status')
      .eq('id', userId)
      .single();

    if (!userRow) {
      ResponseUtil.unauthorized(res, 'Account not found'); return;
    }
    if (userRow.status === 'account_deleted') {
      ResponseUtil.unauthorized(res, 'This account has been deleted. Please register again.'); return;
    }
    if (userRow.status !== 'active') {
      ResponseUtil.unauthorized(res, 'Your account has been suspended. Please contact support.'); return;
    }

    (req as AuthRequest).user = {
      id: userId,
      email: decoded.email,
      roles: decoded.roles || (decoded.role ? [decoded.role] : []),
    };
    next();
  } catch {
    ResponseUtil.unauthorized(res, 'Invalid or expired token');
  }
}
