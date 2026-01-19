import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import ResponseUtil from '../utils/response';

/**
 * Global error handling middleware
 * Must be registered AFTER all routes
 */
export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log the error
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
    body: req.body,
    query: req.query,
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    ResponseUtil.error(
      res,
      'Validation error',
      400,
      'VALIDATION_ERROR',
      err.details || err.message
    );
    return;
  }

  if (err.name === 'UnauthorizedError' || err.statusCode === 401) {
    ResponseUtil.error(
      res,
      'Unauthorized access',
      401,
      'UNAUTHORIZED'
    );
    return;
  }

  if (err.name === 'ForbiddenError' || err.statusCode === 403) {
    ResponseUtil.error(
      res,
      'Access forbidden',
      403,
      'FORBIDDEN'
    );
    return;
  }

  if (err.code === 'ECONNREFUSED') {
    ResponseUtil.serviceUnavailable(
      res,
      'Backend',
      'Unable to connect to backend service'
    );
    return;
  }

  if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
    ResponseUtil.error(
      res,
      'Request timeout',
      504,
      'GATEWAY_TIMEOUT',
      'The backend service took too long to respond'
    );
    return;
  }

  // CORS errors
  if (err.message && err.message.includes('CORS')) {
    ResponseUtil.error(
      res,
      'CORS policy violation',
      403,
      'CORS_ERROR',
      err.message
    );
    return;
  }

  // Default to 500 server error
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  ResponseUtil.error(
    res,
    message,
    statusCode,
    undefined,
    process.env.NODE_ENV === 'development' ? err.stack : undefined
  );
};

/**
 * 404 Not Found middleware
 * Must be registered AFTER all routes but BEFORE error middleware
 */
export const notFoundMiddleware = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`);
  ResponseUtil.notFound(res, `Route ${req.originalUrl}`);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors and pass to error middleware
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};