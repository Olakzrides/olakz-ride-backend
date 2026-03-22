import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void | Response => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return ResponseUtil.unauthorized(res, 'No token provided');
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) return ResponseUtil.serverError(res, 'Auth configuration error');

    const decoded = jwt.verify(token, secret) as any;
    (req as AuthRequest).user = {
      id: decoded.userId || decoded.id,
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
