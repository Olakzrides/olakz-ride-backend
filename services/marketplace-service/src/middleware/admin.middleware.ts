import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { ResponseUtil } from '../utils/response';

export function isAdmin(req: Request, res: Response, next: NextFunction): void {
  const roles = (req as AuthRequest).user?.roles || [];
  if (!roles.includes('admin') && !roles.includes('super_admin')) {
    ResponseUtil.forbidden(res, 'Admin access required');
    return;
  }
  next();
}
