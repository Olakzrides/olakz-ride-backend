// Standardized Error Codes and Types

export enum DriverRegistrationErrorCode {
  // Authentication & Authorization
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Session Management
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_ALREADY_EXISTS = 'SESSION_ALREADY_EXISTS',
  SESSION_INVALID_STATE = 'SESSION_INVALID_STATE',

  // Validation Errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  REQUIRED_FIELD_MISSING = 'REQUIRED_FIELD_MISSING',
  INVALID_FIELD_FORMAT = 'INVALID_FIELD_FORMAT',
  INVALID_FIELD_VALUE = 'INVALID_FIELD_VALUE',
  FIELD_TOO_SHORT = 'FIELD_TOO_SHORT',
  FIELD_TOO_LONG = 'FIELD_TOO_LONG',
  INVALID_DATE_FORMAT = 'INVALID_DATE_FORMAT',
  INVALID_PHONE_FORMAT = 'INVALID_PHONE_FORMAT',
  INVALID_EMAIL_FORMAT = 'INVALID_EMAIL_FORMAT',
  AGE_REQUIREMENT_NOT_MET = 'AGE_REQUIREMENT_NOT_MET',

  // Vehicle-Specific Errors
  INVALID_VEHICLE_TYPE = 'INVALID_VEHICLE_TYPE',
  INVALID_VEHICLE_SERVICE_COMBINATION = 'INVALID_VEHICLE_SERVICE_COMBINATION',
  INVALID_VIN_FORMAT = 'INVALID_VIN_FORMAT',
  INVALID_ENGINE_CAPACITY = 'INVALID_ENGINE_CAPACITY',
  INVALID_SEATING_CAPACITY = 'INVALID_SEATING_CAPACITY',
  INVALID_LOAD_CAPACITY = 'INVALID_LOAD_CAPACITY',
  VEHICLE_YEAR_OUT_OF_RANGE = 'VEHICLE_YEAR_OUT_OF_RANGE',

  // Document Errors
  DOCUMENT_REQUIRED = 'DOCUMENT_REQUIRED',
  DOCUMENT_FORMAT_INVALID = 'DOCUMENT_FORMAT_INVALID',
  DOCUMENT_SIZE_EXCEEDED = 'DOCUMENT_SIZE_EXCEEDED',
  DOCUMENT_EXPIRED = 'DOCUMENT_EXPIRED',
  DOCUMENT_UPLOAD_FAILED = 'DOCUMENT_UPLOAD_FAILED',
  INSUFFICIENT_DOCUMENTS = 'INSUFFICIENT_DOCUMENTS',

  // Step Flow Errors
  STEP_OUT_OF_ORDER = 'STEP_OUT_OF_ORDER',
  PREVIOUS_STEP_INCOMPLETE = 'PREVIOUS_STEP_INCOMPLETE',
  STEP_ALREADY_COMPLETED = 'STEP_ALREADY_COMPLETED',
  INVALID_STEP_TRANSITION = 'INVALID_STEP_TRANSITION',

  // Business Logic Errors
  DUPLICATE_REGISTRATION = 'DUPLICATE_REGISTRATION',
  REGISTRATION_LIMIT_EXCEEDED = 'REGISTRATION_LIMIT_EXCEEDED',
  VEHICLE_ALREADY_REGISTERED = 'VEHICLE_ALREADY_REGISTERED',
  DRIVER_ALREADY_EXISTS = 'DRIVER_ALREADY_EXISTS',
  INVALID_SERVICE_AREA = 'INVALID_SERVICE_AREA',

  // System Errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  FILE_STORAGE_ERROR = 'FILE_STORAGE_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR'
}

export interface StandardizedError {
  code: DriverRegistrationErrorCode;
  message: string;
  field?: string;
  details?: any;
  timestamp: string;
  requestId?: string;
}

export interface ValidationError {
  field: string;
  code: DriverRegistrationErrorCode;
  message: string;
  value?: any;
  constraint?: any;
}

export interface ErrorResponse {
  success: false;
  error: StandardizedError;
  validation_errors?: ValidationError[];
  timestamp: string;
  path?: string;
  method?: string;
}

// Error message templates
export const ErrorMessages: Record<DriverRegistrationErrorCode, string> = {
  [DriverRegistrationErrorCode.UNAUTHORIZED]: 'Authentication required. Please provide a valid token.',
  [DriverRegistrationErrorCode.FORBIDDEN]: 'Access denied. You do not have permission to perform this action.',
  [DriverRegistrationErrorCode.INVALID_TOKEN]: 'Invalid authentication token provided.',
  [DriverRegistrationErrorCode.TOKEN_EXPIRED]: 'Authentication token has expired.',
  [DriverRegistrationErrorCode.SESSION_NOT_FOUND]: 'Registration session not found. Please start a new registration.',
  [DriverRegistrationErrorCode.SESSION_EXPIRED]: 'Registration session has expired. Please start a new registration.',
  [DriverRegistrationErrorCode.SESSION_ALREADY_EXISTS]: 'You already have an active registration session.',
  [DriverRegistrationErrorCode.SESSION_INVALID_STATE]: 'Registration session is in an invalid state.',
  [DriverRegistrationErrorCode.VALIDATION_FAILED]: 'Validation failed. Please check your input and try again.',
  [DriverRegistrationErrorCode.REQUIRED_FIELD_MISSING]: 'Required field is missing.',
  [DriverRegistrationErrorCode.INVALID_FIELD_FORMAT]: 'Field format is invalid.',
  [DriverRegistrationErrorCode.INVALID_FIELD_VALUE]: 'Field value is invalid.',
  [DriverRegistrationErrorCode.FIELD_TOO_SHORT]: 'Field value is too short.',
  [DriverRegistrationErrorCode.FIELD_TOO_LONG]: 'Field value is too long.',
  [DriverRegistrationErrorCode.INVALID_DATE_FORMAT]: 'Invalid date format provided.',
  [DriverRegistrationErrorCode.INVALID_PHONE_FORMAT]: 'Please provide a valid phone number in international format.',
  [DriverRegistrationErrorCode.INVALID_EMAIL_FORMAT]: 'Please provide a valid email address.',
  [DriverRegistrationErrorCode.AGE_REQUIREMENT_NOT_MET]: 'You must be at least 18 years old to register as a driver.',
  [DriverRegistrationErrorCode.INVALID_VEHICLE_TYPE]: 'Invalid vehicle type selected.',
  [DriverRegistrationErrorCode.INVALID_VEHICLE_SERVICE_COMBINATION]: 'Selected services are not available for this vehicle type.',
  [DriverRegistrationErrorCode.INVALID_VIN_FORMAT]: 'VIN must be exactly 17 characters long.',
  [DriverRegistrationErrorCode.INVALID_ENGINE_CAPACITY]: 'Invalid engine capacity provided.',
  [DriverRegistrationErrorCode.INVALID_SEATING_CAPACITY]: 'Invalid seating capacity provided.',
  [DriverRegistrationErrorCode.INVALID_LOAD_CAPACITY]: 'Invalid load capacity provided.',
  [DriverRegistrationErrorCode.VEHICLE_YEAR_OUT_OF_RANGE]: 'Vehicle year is out of acceptable range.',
  [DriverRegistrationErrorCode.DOCUMENT_REQUIRED]: 'Required document is missing.',
  [DriverRegistrationErrorCode.DOCUMENT_FORMAT_INVALID]: 'Document format is invalid.',
  [DriverRegistrationErrorCode.DOCUMENT_SIZE_EXCEEDED]: 'Document size exceeds maximum allowed.',
  [DriverRegistrationErrorCode.DOCUMENT_EXPIRED]: 'Document has expired.',
  [DriverRegistrationErrorCode.DOCUMENT_UPLOAD_FAILED]: 'Document upload failed.',
  [DriverRegistrationErrorCode.INSUFFICIENT_DOCUMENTS]: 'Insufficient documents provided.',
  [DriverRegistrationErrorCode.STEP_OUT_OF_ORDER]: 'Please complete the previous steps before proceeding.',
  [DriverRegistrationErrorCode.PREVIOUS_STEP_INCOMPLETE]: 'Previous step must be completed first.',
  [DriverRegistrationErrorCode.STEP_ALREADY_COMPLETED]: 'This step has already been completed.',
  [DriverRegistrationErrorCode.INVALID_STEP_TRANSITION]: 'Invalid step transition attempted.',
  [DriverRegistrationErrorCode.DUPLICATE_REGISTRATION]: 'A registration already exists for this user.',
  [DriverRegistrationErrorCode.REGISTRATION_LIMIT_EXCEEDED]: 'Registration limit has been exceeded.',
  [DriverRegistrationErrorCode.VEHICLE_ALREADY_REGISTERED]: 'This vehicle is already registered with another driver.',
  [DriverRegistrationErrorCode.DRIVER_ALREADY_EXISTS]: 'Driver profile already exists for this user.',
  [DriverRegistrationErrorCode.INVALID_SERVICE_AREA]: 'Service is not available in your area.',
  [DriverRegistrationErrorCode.DATABASE_ERROR]: 'Database operation failed.',
  [DriverRegistrationErrorCode.EXTERNAL_SERVICE_ERROR]: 'External service error occurred.',
  [DriverRegistrationErrorCode.FILE_STORAGE_ERROR]: 'File storage operation failed.',
  [DriverRegistrationErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later.',
  [DriverRegistrationErrorCode.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please try again later.',
  [DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR]: 'An internal error occurred. Please try again later.'
};

// HTTP Status Code mapping
export const ErrorStatusCodes: Record<DriverRegistrationErrorCode, number> = {
  [DriverRegistrationErrorCode.UNAUTHORIZED]: 401,
  [DriverRegistrationErrorCode.FORBIDDEN]: 403,
  [DriverRegistrationErrorCode.INVALID_TOKEN]: 401,
  [DriverRegistrationErrorCode.TOKEN_EXPIRED]: 401,
  [DriverRegistrationErrorCode.SESSION_NOT_FOUND]: 404,
  [DriverRegistrationErrorCode.SESSION_EXPIRED]: 400,
  [DriverRegistrationErrorCode.SESSION_ALREADY_EXISTS]: 409,
  [DriverRegistrationErrorCode.SESSION_INVALID_STATE]: 400,
  [DriverRegistrationErrorCode.VALIDATION_FAILED]: 400,
  [DriverRegistrationErrorCode.REQUIRED_FIELD_MISSING]: 400,
  [DriverRegistrationErrorCode.INVALID_FIELD_FORMAT]: 400,
  [DriverRegistrationErrorCode.INVALID_FIELD_VALUE]: 400,
  [DriverRegistrationErrorCode.FIELD_TOO_SHORT]: 400,
  [DriverRegistrationErrorCode.FIELD_TOO_LONG]: 400,
  [DriverRegistrationErrorCode.INVALID_DATE_FORMAT]: 400,
  [DriverRegistrationErrorCode.INVALID_PHONE_FORMAT]: 400,
  [DriverRegistrationErrorCode.INVALID_EMAIL_FORMAT]: 400,
  [DriverRegistrationErrorCode.AGE_REQUIREMENT_NOT_MET]: 400,
  [DriverRegistrationErrorCode.INVALID_VEHICLE_TYPE]: 400,
  [DriverRegistrationErrorCode.INVALID_VEHICLE_SERVICE_COMBINATION]: 400,
  [DriverRegistrationErrorCode.INVALID_VIN_FORMAT]: 400,
  [DriverRegistrationErrorCode.INVALID_ENGINE_CAPACITY]: 400,
  [DriverRegistrationErrorCode.INVALID_SEATING_CAPACITY]: 400,
  [DriverRegistrationErrorCode.INVALID_LOAD_CAPACITY]: 400,
  [DriverRegistrationErrorCode.VEHICLE_YEAR_OUT_OF_RANGE]: 400,
  [DriverRegistrationErrorCode.DOCUMENT_REQUIRED]: 400,
  [DriverRegistrationErrorCode.DOCUMENT_FORMAT_INVALID]: 400,
  [DriverRegistrationErrorCode.DOCUMENT_SIZE_EXCEEDED]: 413,
  [DriverRegistrationErrorCode.DOCUMENT_EXPIRED]: 400,
  [DriverRegistrationErrorCode.DOCUMENT_UPLOAD_FAILED]: 500,
  [DriverRegistrationErrorCode.INSUFFICIENT_DOCUMENTS]: 400,
  [DriverRegistrationErrorCode.STEP_OUT_OF_ORDER]: 400,
  [DriverRegistrationErrorCode.PREVIOUS_STEP_INCOMPLETE]: 400,
  [DriverRegistrationErrorCode.STEP_ALREADY_COMPLETED]: 409,
  [DriverRegistrationErrorCode.INVALID_STEP_TRANSITION]: 400,
  [DriverRegistrationErrorCode.DUPLICATE_REGISTRATION]: 409,
  [DriverRegistrationErrorCode.REGISTRATION_LIMIT_EXCEEDED]: 429,
  [DriverRegistrationErrorCode.VEHICLE_ALREADY_REGISTERED]: 409,
  [DriverRegistrationErrorCode.DRIVER_ALREADY_EXISTS]: 409,
  [DriverRegistrationErrorCode.INVALID_SERVICE_AREA]: 400,
  [DriverRegistrationErrorCode.DATABASE_ERROR]: 500,
  [DriverRegistrationErrorCode.EXTERNAL_SERVICE_ERROR]: 502,
  [DriverRegistrationErrorCode.FILE_STORAGE_ERROR]: 500,
  [DriverRegistrationErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [DriverRegistrationErrorCode.SERVICE_UNAVAILABLE]: 503,
  [DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR]: 500
};