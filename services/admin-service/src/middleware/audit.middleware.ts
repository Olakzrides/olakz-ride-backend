import { Response, NextFunction } from 'express';
import { AdminRequest } from './auth.middleware';
import { logger } from '../utils/logger';

/**
 * Logs every admin action for audit trail purposes.
 * Must run after adminAuthMiddleware so req.user is populated.
 */
export const auditMiddleware = (action: string) => {
  return (req: AdminRequest, _res: Response, next: NextFunction): void => {
    logger.info('Admin action', {
      action,
      adminId: req.user?.id,
      email: req.user?.email,
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });
    next();
  };
};
