import { Response } from 'express';

export class ResponseUtil {
  static success(res: Response, data: unknown, message = 'Success', statusCode = 200): void {
    res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static created(res: Response, data: unknown, message = 'Created'): void {
    this.success(res, data, message, 201);
  }

  static error(
    res: Response,
    message: string,
    statusCode = 500,
    code?: string,
    details?: unknown
  ): void {
    res.status(statusCode).json({
      success: false,
      error: { message, code, details },
      timestamp: new Date().toISOString(),
    });
  }

  static badRequest(res: Response, message: string, code?: string): void {
    this.error(res, message, 400, code);
  }

  static unauthorized(res: Response, message = 'Unauthorized', code?: string): void {
    this.error(res, message, 401, code);
  }

  static forbidden(res: Response, message = 'Forbidden', code?: string): void {
    this.error(res, message, 403, code);
  }

  static notFound(res: Response, resource = 'Resource'): void {
    this.error(res, `${resource} not found`, 404, 'NOT_FOUND');
  }

  static serverError(res: Response, message = 'Internal server error', code?: string): void {
    this.error(res, message, 500, code);
  }
}
