import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  const message = err?.message || err?.toString() || 'Internal server error';
  logger.error('Unhandled error', { error: message, stack: err?.stack, path: req.path });
  res.status(500).json({
    success: false,
    message: message || 'Internal server error',
    error: { code: 'INTERNAL_SERVER_ERROR' },
    timestamp: new Date().toISOString(),
  });
}
