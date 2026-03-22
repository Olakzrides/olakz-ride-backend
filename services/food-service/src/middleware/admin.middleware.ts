import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ResponseUtil } from '../utils/response';
import logger from '../utils/logger';

interface AdminRequest extends Request {
  user?: { id: string; email: string; roles: string[]; isAdmin: boolean };
}

export const adminAuthMiddleware = (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      ResponseUtil.unauthorized(res, 'Admin authentication required');
      return;
    }

    const token = authHeader.substring(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) { ResponseUtil.serverError(res, 'Auth configuration error'); return; }

    const decoded = jwt.verify(token, secret) as any;
    const userId = decoded.id || decoded.userId;
    const userRoles = decoded.roles || (decoded.role ? [decoded.role] : []);
    const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');

    if (!isAdmin) {
      ResponseUtil.forbidden(res, 'Admin access required');
      return;
    }

    req.user = { id: userId, email: decoded.email, roles: userRoles, isAdmin: true };
    logger.info('Admin authenticated:', { adminId: userId, endpoint: req.path });
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') { ResponseUtil.unauthorized(res, 'Invalid admin token'); return; }
    if (error.name === 'TokenExpiredError') { ResponseUtil.unauthorized(res, 'Admin token expired'); return; }
    ResponseUtil.serverError(res, 'Admin authentication error');
  }
};
