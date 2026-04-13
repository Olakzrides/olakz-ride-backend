import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ResponseUtil } from '../utils/response';
import config from '../config';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; roles: string[] };
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    ResponseUtil.unauthorized(res, 'Missing or invalid authorization header');
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    (req as AuthRequest).user = {
      id: decoded.sub || decoded.userId || decoded.id,
      email: decoded.email,
      roles: decoded.roles || (decoded.role ? [decoded.role] : []),
    };
    next();
  } catch {
    ResponseUtil.unauthorized(res, 'Invalid or expired token');
  }
}
