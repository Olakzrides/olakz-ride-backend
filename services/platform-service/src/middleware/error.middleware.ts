import { Request, Response, NextFunction } from 'express';
import ResponseUtil from '../utils/response';
import logger from '../utils/logger';

/**
 * Global error handler middleware
 */
export const errorMiddleware = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    ResponseUtil.validationError(res, error.details, error.message);
    return;
  }

  if (error.name === 'UnauthorizedError') {
    ResponseUtil.unauthorized(res, error.message);
    return;
  }

  if (error.code === 'P2002') { // Prisma unique constraint error
    ResponseUtil.error(res, 'Resource already exists', 409, 'CONFLICT');
    return;
  }

  if (error.code === 'P2025') { // Prisma record not found error
    ResponseUtil.notFound(res, 'Resource');
    return;
  }

  // Default server error
  ResponseUtil.serverError(
    res,
    'An unexpected error occurred',
    process.env.NODE_ENV === 'development' ? error.message : undefined
  );
};

/**
 * 404 handler middleware
 */
export const notFoundMiddleware = (req: Request, res: Response): void => {
  logger.warn('Route not found:', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  ResponseUtil.notFound(res, 'Endpoint');
};