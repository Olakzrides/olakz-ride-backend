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
    message: string,
    data?: T,
    statusCode: number = 200
  ): Response<ApiResponse<T>> {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static error(
    res: Response,
    message: string,
    statusCode: number = 400,
    errorCode: string = 'BAD_REQUEST',
    details?: any
  ): Response<ApiResponse> {
    return res.status(statusCode).json({
      success: false,
      message,
      error: {
        code: errorCode,
        details,
      },
      timestamp: new Date().toISOString(),
    });
  }

  static notFound(
    res: Response,
    resource: string = 'Resource'
  ): Response<ApiResponse> {
    return this.error(res, `${resource} not found`, 404, 'NOT_FOUND');
  }

  static unauthorized(
    res: Response,
    message: string = 'Unauthorized access'
  ): Response<ApiResponse> {
    return this.error(res, message, 401, 'UNAUTHORIZED');
  }

  static forbidden(
    res: Response,
    message: string = 'Access forbidden'
  ): Response<ApiResponse> {
    return this.error(res, message, 403, 'FORBIDDEN');
  }

  static validationError(
    res: Response,
    details: any,
    message: string = 'Validation failed'
  ): Response<ApiResponse> {
    return this.error(res, message, 422, 'VALIDATION_ERROR', details);
  }

  static serverError(
    res: Response,
    message: string = 'Internal server error',
    details?: any
  ): Response<ApiResponse> {
    return this.error(res, message, 500, 'INTERNAL_SERVER_ERROR', details);
  }

  static serviceUnavailable(
    res: Response,
    service: string,
    message?: string
  ): Response<ApiResponse> {
    return this.error(
      res,
      message || `${service} service is temporarily unavailable`,
      503,
      'SERVICE_UNAVAILABLE'
    );
  }
}

export default ResponseUtil;