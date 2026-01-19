import { Response } from 'express';
import { ApiResponse } from '../types';

export class ResponseUtil {
  static success<T>(res: Response, data: T, message?: string, statusCode = 200): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      ...(message && { message }),
    };
    return res.status(statusCode).json(response);
  }

  static error(res: Response, error: string, statusCode = 500): Response {
    const response: ApiResponse = {
      success: false,
      error,
    };
    return res.status(statusCode).json(response);
  }

  static created<T>(res: Response, data: T, message?: string): Response {
    return this.success(res, data, message, 201);
  }

  static badRequest(res: Response, error: string): Response {
    return this.error(res, error, 400);
  }

  static unauthorized(res: Response, error = 'Unauthorized'): Response {
    return this.error(res, error, 401);
  }

  static forbidden(res: Response, error = 'Forbidden'): Response {
    return this.error(res, error, 403);
  }

  static notFound(res: Response, error = 'Resource not found'): Response {
    return this.error(res, error, 404);
  }

  static serverError(res: Response, error = 'Internal server error'): Response {
    return this.error(res, error, 500);
  }
}
