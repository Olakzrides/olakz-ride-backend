import { Response } from 'express';
import { ApiResponse } from '../types';
import { 
  DriverRegistrationErrorCode, 
  StandardizedError, 
  ErrorResponse, 
  ValidationError,
  ErrorMessages,
  ErrorStatusCodes
} from '../types/error-codes.types';

export class ResponseUtil {
  static success<T>(res: Response, data: T, message?: string, statusCode = 200): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      ...(message && { message }),
      timestamp: new Date().toISOString()
    };
    return res.status(statusCode).json(response);
  }

  static error(res: Response, error: string, statusCode = 500): Response {
    const response: ApiResponse = {
      success: false,
      error,
      timestamp: new Date().toISOString()
    };
    return res.status(statusCode).json(response);
  }

  static standardizedError(
    res: Response, 
    errorCode: DriverRegistrationErrorCode, 
    customMessage?: string,
    field?: string,
    details?: any,
    requestId?: string
  ): Response {
    const statusCode = ErrorStatusCodes[errorCode] || 500;
    const message = customMessage || ErrorMessages[errorCode] || 'An error occurred';

    const standardizedError: StandardizedError = {
      code: errorCode,
      message,
      ...(field && { field }),
      ...(details && { details }),
      timestamp: new Date().toISOString(),
      ...(requestId && { requestId })
    };

    const response: ErrorResponse = {
      success: false,
      error: standardizedError,
      timestamp: new Date().toISOString(),
      path: res.req?.originalUrl,
      method: res.req?.method
    };

    return res.status(statusCode).json(response);
  }

  static validationError(
    res: Response,
    validationErrors: ValidationError[],
    message = 'Validation failed'
  ): Response {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: DriverRegistrationErrorCode.VALIDATION_FAILED,
        message,
        timestamp: new Date().toISOString()
      },
      validation_errors: validationErrors,
      timestamp: new Date().toISOString(),
      path: res.req?.originalUrl,
      method: res.req?.method
    };

    return res.status(400).json(response);
  }

  static sessionNotFound(res: Response, requestId?: string): Response {
    return this.standardizedError(
      res, 
      DriverRegistrationErrorCode.SESSION_NOT_FOUND,
      undefined,
      undefined,
      undefined,
      requestId
    );
  }

  static sessionExpired(res: Response, requestId?: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.SESSION_EXPIRED,
      undefined,
      undefined,
      undefined,
      requestId
    );
  }

  static sessionAlreadyExists(res: Response, requestId?: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.SESSION_ALREADY_EXISTS,
      undefined,
      undefined,
      undefined,
      requestId
    );
  }

  static authenticationRequired(res: Response): Response {
    return this.standardizedError(res, DriverRegistrationErrorCode.UNAUTHORIZED);
  }

  static accessDenied(res: Response): Response {
    return this.standardizedError(res, DriverRegistrationErrorCode.FORBIDDEN);
  }

  static invalidToken(res: Response): Response {
    return this.standardizedError(res, DriverRegistrationErrorCode.INVALID_TOKEN);
  }

  static tokenExpired(res: Response): Response {
    return this.standardizedError(res, DriverRegistrationErrorCode.TOKEN_EXPIRED);
  }

  static invalidVehicleType(res: Response, vehicleType: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.INVALID_VEHICLE_TYPE,
      `Unsupported vehicle type: ${vehicleType}`,
      'vehicle_type',
      { provided_vehicle_type: vehicleType }
    );
  }

  static invalidVehicleServiceCombination(
    res: Response, 
    vehicleType: string, 
    serviceTypes: string[],
    allowedServices: string[]
  ): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.INVALID_VEHICLE_SERVICE_COMBINATION,
      `Vehicle type ${vehicleType} does not support the requested services`,
      'service_types',
      {
        vehicle_type: vehicleType,
        requested_services: serviceTypes,
        allowed_services: allowedServices,
        invalid_services: serviceTypes.filter(s => !allowedServices.includes(s))
      }
    );
  }

  static stepOutOfOrder(res: Response, currentStep: string, requiredStep: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.STEP_OUT_OF_ORDER,
      `Please complete ${requiredStep} before proceeding to ${currentStep}`,
      'step',
      {
        current_step: currentStep,
        required_step: requiredStep
      }
    );
  }

  static previousStepIncomplete(res: Response, incompleteStep: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.PREVIOUS_STEP_INCOMPLETE,
      `${incompleteStep} must be completed first`,
      'step',
      { incomplete_step: incompleteStep }
    );
  }

  static duplicateRegistration(res: Response, userId: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.DUPLICATE_REGISTRATION,
      'You already have an active registration',
      undefined,
      { user_id: userId }
    );
  }

  static vehicleAlreadyRegistered(res: Response, vehicleIdentifier: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.VEHICLE_ALREADY_REGISTERED,
      'This vehicle is already registered with another driver',
      'vehicle',
      { vehicle_identifier: vehicleIdentifier }
    );
  }

  static ageRequirementNotMet(res: Response, age: number): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.AGE_REQUIREMENT_NOT_MET,
      `You must be at least 18 years old. Current age: ${age}`,
      'date_of_birth',
      { current_age: age, minimum_age: 18 }
    );
  }

  static rateLimitExceeded(res: Response, retryAfter?: number): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.RATE_LIMIT_EXCEEDED,
      undefined,
      undefined,
      retryAfter ? { retry_after_seconds: retryAfter } : undefined
    );
  }

  static serviceUnavailable(res: Response, reason?: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.SERVICE_UNAVAILABLE,
      reason || 'Service is temporarily unavailable',
      undefined,
      reason ? { reason } : undefined
    );
  }

  static databaseError(res: Response, operation?: string): Response {
    return this.standardizedError(
      res,
      DriverRegistrationErrorCode.DATABASE_ERROR,
      'Database operation failed',
      undefined,
      operation ? { operation } : undefined
    );
  }

  // Legacy methods for backward compatibility
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
