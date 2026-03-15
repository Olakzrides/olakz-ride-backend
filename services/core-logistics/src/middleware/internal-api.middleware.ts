import { Request, Response, NextFunction } from 'express';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

/**
 * Middleware to authenticate internal API calls from other services
 * Checks for x-internal-api-key header
 */
export const internalApiAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-internal-api-key'] as string;
  const expectedKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';

  if (!apiKey) {
    logger.warn('Internal API call without API key', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    ResponseUtil.unauthorized(res, 'Internal API key required');
    return;
  }

  if (apiKey !== expectedKey) {
    logger.warn('Internal API call with invalid API key', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    ResponseUtil.unauthorized(res, 'Invalid internal API key');
    return;
  }

  next();
};
