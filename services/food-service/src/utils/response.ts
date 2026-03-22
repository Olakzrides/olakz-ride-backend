import { Response } from 'express';

export class ResponseUtil {
  static success<T>(res: Response, data: T, message?: string, statusCode = 200): Response {
    return res.status(statusCode).json({
      success: true,
      ...(message && { message }),
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static created<T>(res: Response, data: T, message?: string): Response {
    return this.success(res, data, message, 201);
  }

  static error(res: Response, message: string, statusCode = 500, code?: string): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      ...(code && { error: { code } }),
      timestamp: new Date().toISOString(),
    });
  }

  static badRequest(res: Response, message: string): Response {
    return this.error(res, message, 400, 'BAD_REQUEST');
  }

  static unauthorized(res: Response, message = 'Unauthorized'): Response {
    return this.error(res, message, 401, 'UNAUTHORIZED');
  }

  static forbidden(res: Response, message = 'Forbidden'): Response {
    return this.error(res, message, 403, 'FORBIDDEN');
  }

  static notFound(res: Response, message = 'Resource not found'): Response {
    return this.error(res, message, 404, 'NOT_FOUND');
  }

  static serverError(res: Response, message = 'Internal server error'): Response {
    return this.error(res, message, 500, 'INTERNAL_ERROR');
  }

  static conflict(res: Response, message: string): Response {
    return this.error(res, message, 409, 'CONFLICT');
  }
}
