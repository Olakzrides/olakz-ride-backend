import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

interface AdminRequest extends Request {
  user?: { id: string; email: string; roles: string[]; isAdmin: boolean };
}

const sendError = (res: Response, statusCode: number, message: string, code?: string) => {
  res.status(statusCode).json({ success: false, error: { message, code, timestamp: new Date().toISOString() } });
};

export const adminAuthMiddleware = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 401, 'Admin authentication required', 'ADMIN_AUTH_REQUIRED');
      return;
    }

    const token = authHeader.substring(7);
    if (!process.env.JWT_SECRET) {
      sendError(res, 500, 'Authentication configuration error', 'AUTH_CONFIG_ERROR');
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
    const userId = decoded.id || decoded.userId;
    const userRoles = decoded.roles || (decoded.role ? [decoded.role] : []);
    const isAdmin = userRoles.includes('admin') || userRoles.includes('super_admin');

    if (!isAdmin) {
      sendError(res, 403, 'Admin access required', 'ADMIN_ACCESS_REQUIRED');
      return;
    }

    req.user = { id: userId, email: decoded.email, roles: userRoles, isAdmin: true };
    logger.info('Admin authenticated:', { adminId: userId, endpoint: req.path });
    next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError') sendError(res, 401, 'Invalid admin token', 'INVALID_ADMIN_TOKEN');
    else if (error.name === 'TokenExpiredError') sendError(res, 401, 'Admin token expired', 'ADMIN_TOKEN_EXPIRED');
    else sendError(res, 500, 'Admin authentication error', 'ADMIN_AUTH_ERROR');
  }
};
