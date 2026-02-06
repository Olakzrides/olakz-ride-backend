import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Middleware to authenticate internal API requests from other services
 */
export const internalApiAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-internal-api-key'];
  const expectedKey = process.env.INTERNAL_API_KEY || 'default-internal-key-change-in-production';
  
  // Debug logging
  logger.info('Internal API auth check:', {
    hasHeader: !!apiKey,
    authenticated: apiKey === expectedKey,
  });

  if (!apiKey) {
    logger.warn('Internal API request without API key:', {
      path: req.path,
      ip: req.ip,
    });
    
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing internal API key',
    });
    return;
  }

  if (apiKey !== expectedKey) {
    logger.warn('Internal API request with invalid API key:', {
      path: req.path,
      ip: req.ip,
      receivedKeyMatch: apiKey === expectedKey,
      receivedKeyLength: typeof apiKey === 'string' ? apiKey.length : 0,
      expectedKeyLength: expectedKey?.length,
    });
    
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid internal API key',
    });
    return;
  }

  logger.info('Internal API request authenticated:', {
    path: req.path,
  });

  next();
};
