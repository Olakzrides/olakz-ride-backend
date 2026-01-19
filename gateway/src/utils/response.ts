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
  /**
   * Send success response
   */
  static success<T>(
    res: Response,
    data: T,
    message: string = 'Request successful',
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

  /**
   * Send error response
   */
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

  /**
   * Send service unavailable response
   */
  static serviceUnavailable(
    res: Response,
    serviceName: string,
    details?: string
  ): Response {
    return this.error(
      res,
      `${serviceName} service is temporarily unavailable`,
      503,
      'SERVICE_UNAVAILABLE',
      details
    );
  }

  /**
   * Send rate limit exceeded response
   */
  static rateLimitExceeded(res: Response): Response {
    return this.error(
      res,
      'Too many requests, please try again later',
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }

  /**
   * Send not found response
   */
  static notFound(res: Response, resource?: string): Response {
    return this.error(
      res,
      resource ? `${resource} not found` : 'Resource not found',
      404,
      'NOT_FOUND'
    );
  }

  /**
   * Get standard error code based on status code
   */
  private static getErrorCode(statusCode: number): string {
    const errorCodes: { [key: number]: string } = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      429: 'RATE_LIMIT_EXCEEDED',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };
    return errorCodes[statusCode] || 'UNKNOWN_ERROR';
  }
}

export default ResponseUtil;