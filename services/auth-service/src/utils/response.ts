import { Response } from 'express';

interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: {
    code: string;
    details?: any;
  };
  timestamp: string;
}

class ResponseUtil {
  static success<T>(
    res: Response,
    data: T,
    message: string = 'Success',
    statusCode: number = 200
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    };
    return res.status(statusCode).json(response);
  }

  static error(
    res: Response,
    message: string = 'An error occurred',
    statusCode: number = 500,
    errorCode?: string,
    details?: any
  ): Response {
    const response: ApiResponse = {
      success: false,
      message,
      error: {
        code: errorCode || this.getErrorCode(statusCode),
        ...(details && { details }),
      },
      timestamp: new Date().toISOString(),
    };
    return res.status(statusCode).json(response);
  }

  private static getErrorCode(statusCode: number): string {
    const errorCodes: { [key: number]: string } = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_SERVER_ERROR',
    };
    return errorCodes[statusCode] || 'UNKNOWN_ERROR';
  }
}

export default ResponseUtil;