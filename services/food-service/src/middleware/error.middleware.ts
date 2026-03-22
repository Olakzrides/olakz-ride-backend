import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    timestamp: new Date().toISOString(),
  });
};

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.error('Unhandled error:', { message: err.message, stack: err.stack });
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    timestamp: new Date().toISOString(),
  });
};
