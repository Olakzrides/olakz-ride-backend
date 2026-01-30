import { Request, Response } from 'express';
import { VehicleTypeService } from '../services/vehicle-type.service';
import { VehicleValidationService } from '../services/vehicle-validation.service';
import { RegistrationSessionService } from '../services/registration-session.service';
import { ComprehensiveValidationService } from '../services/comprehensive-validation.service';
import { ResponseUtil } from '../utils/response.util';
import { DriverRegistrationErrorCode } from '../types/error-codes.types';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export class DriverRegistrationController {
  private vehicleTypeService: VehicleTypeService;
  private vehicleValidationService: VehicleValidationService;
  private registrationSessionService: RegistrationSessionService;
  private comprehensiveValidationService: ComprehensiveValidationService;

  constructor() {
    this.vehicleTypeService = new VehicleTypeService();
    this.vehicleValidationService = new VehicleValidationService();
    this.registrationSessionService = new RegistrationSessionService();
    this.comprehensiveValidationService = new ComprehensiveValidationService();
  }

  /**
   * Get all vehicle types with service capabilities
   * GET /api/driver-registration/vehicle-types
   */
  getVehicleTypes = async (_req: Request, res: Response): Promise<void> => {
    try {
      const vehicleTypes = await this.vehicleTypeService.getVehicleTypesWithServices();

      // Transform to match frontend expectation exactly
      const response = {
        vehicle_types: vehicleTypes.map(vt => ({
          id: vt.id,
          name: vt.name,
          description: vt.description,
          available_services: vt.availableServices,
          icon_url: vt.iconUrl,
          requirements: {
            license_required: vt.requirements.licenseRequired,
            insurance_required: vt.requirements.insuranceRequired,
            registration_required: vt.requirements.registrationRequired,
          },
        })),
      };

      ResponseUtil.success(res, response);
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Validate vehicle-service combination
   */
  validateVehicleService = async (
    vehicleType: string,
    serviceTypes: string[]
  ): Promise<{ isValid: boolean; error?: any }> => {
    try {
      const validation = await this.vehicleTypeService.validateVehicleServiceCombination(
        vehicleType,
        serviceTypes
      );

      if (!validation.isValid) {
        const errorResponse = {
          code: validation.error,
          message: this.getErrorMessage(validation.error!, vehicleType, serviceTypes),
          details: {
            vehicle_type: vehicleType,
            invalid_services: serviceTypes.filter(s => 
              !validation.allowedServices?.includes(s)
            ),
            allowed_services: validation.allowedServices || [],
          },
        };

        return { isValid: false, error: errorResponse };
      }

      return { isValid: true };
    } catch (error: any) {
      return {
        isValid: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
      };
    }
  };

  /**
   * Get document requirements for vehicle type
   */
  getDocumentRequirements = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id: sessionId } = req.params;
      let vehicleType = req.query.vehicleType as string;
      
      // If session ID is provided, get vehicle type from session
      if (sessionId && sessionId !== 'requirements') {
        try {
          const session = await this.registrationSessionService.getSessionById(sessionId);
          if (session) {
            vehicleType = session.vehicleType;
          }
        } catch (error) {
          // If session not found, fall back to query param
        }
      }
      
      if (!vehicleType) {
        ResponseUtil.badRequest(res, 'Vehicle type is required');
        return;
      }

      const requirements = await this.vehicleTypeService.getDocumentRequirements(vehicleType);
      ResponseUtil.success(res, requirements);
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Get form configuration for vehicle type
   */
  getVehicleFormConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { vehicleType } = req.params;
      
      if (!vehicleType) {
        ResponseUtil.badRequest(res, 'Vehicle type is required');
        return;
      }

      const formConfig = await this.vehicleTypeService.getVehicleFormConfig(vehicleType);
      ResponseUtil.success(res, formConfig);
    } catch (error: any) {
      ResponseUtil.error(res, error.message);
    }
  };

  /**
   * Initiate driver registration session (Enhanced Phase 4)
   */
  initiateRegistration = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { vehicle_type, service_types } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      if (!vehicle_type || !service_types || !Array.isArray(service_types)) {
        ResponseUtil.standardizedError(
          res,
          DriverRegistrationErrorCode.REQUIRED_FIELD_MISSING,
          'vehicle_type and service_types are required',
          'vehicle_type'
        );
        return;
      }

      // Check for existing active session
      const existingSession = await this.registrationSessionService.getActiveSessionByUserId(userId);
      if (existingSession && !this.registrationSessionService.isSessionExpired(existingSession)) {
        ResponseUtil.sessionAlreadyExists(res);
        return;
      }

      // Enhanced validation with comprehensive service
      const validation = await this.validateVehicleService(vehicle_type, service_types);
      if (!validation.isValid) {
        ResponseUtil.invalidVehicleServiceCombination(
          res,
          vehicle_type,
          service_types,
          validation.error?.details?.allowed_services || []
        );
        return;
      }

      // Create registration session
      const session = await this.registrationSessionService.createSession({
        userId,
        vehicleType: vehicle_type,
        serviceTypes: service_types,
      });

      ResponseUtil.success(res, {
        registration_id: session.id,
        status: session.status,
        current_step: session.currentStep,
        progress_percentage: session.progressPercentage,
        expires_at: session.expiresAt,
        next_action: {
          step: 'personal_info',
          endpoint: `/api/driver-registration/register/${session.id}/personal-info`,
          method: 'POST',
        },
      });
    } catch (error: any) {
      console.error('Error initiating registration:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to initiate registration'
      );
    }
  };

  /**
   * Submit personal information (Enhanced Phase 4)
   */
  submitPersonalInfo = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id: sessionId } = req.params;
      const userId = req.user?.id;
      const personalInfo = req.body;

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      // Get and validate session
      const session = await this.registrationSessionService.getSessionById(sessionId);
      if (!session) {
        ResponseUtil.sessionNotFound(res);
        return;
      }

      if (session.userId !== userId) {
        ResponseUtil.accessDenied(res);
        return;
      }

      if (this.registrationSessionService.isSessionExpired(session)) {
        ResponseUtil.sessionExpired(res);
        return;
      }

      // Enhanced validation using comprehensive validation service
      const validation = this.vehicleValidationService.validatePersonalInfo(personalInfo);
      if (!validation.isValid) {
        const validationErrors = validation.errors.map((error: any) => ({
          field: error.field,
          code: this.mapValidationErrorToCode(error.field, error.message),
          message: error.message,
          value: personalInfo[error.field]
        }));

        ResponseUtil.validationError(res, validationErrors);
        return;
      }

      // Additional age validation based on vehicle type
      if (personalInfo.date_of_birth) {
        const ageError = this.comprehensiveValidationService.validateAgeRequirement(
          personalInfo.date_of_birth,
          session.vehicleType
        );
        if (ageError) {
          ResponseUtil.validationError(res, [ageError]);
          return;
        }
      }

      // Update session with personal info
      const updatedSession = await this.registrationSessionService.updateSession(sessionId, {
        personalInfoData: personalInfo,
        currentStep: 'vehicle_details',
        progressPercentage: 50,
        status: 'in_progress',
      });

      ResponseUtil.success(res, {
        registration_id: updatedSession.id,
        status: updatedSession.status,
        current_step: updatedSession.currentStep,
        progress_percentage: updatedSession.progressPercentage,
        next_action: {
          step: 'vehicle_details',
          endpoint: `/api/driver-registration/register/${sessionId}/vehicle-details`,
          method: 'POST',
        },
      });
    } catch (error: any) {
      console.error('Error submitting personal info:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to submit personal information'
      );
    }
  };

  /**
   * Submit vehicle details (Enhanced Phase 4)
   */
  submitVehicleDetails = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id: sessionId } = req.params;
      const userId = req.user?.id;
      const vehicleDetails = req.body;

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      // Get and validate session
      const session = await this.registrationSessionService.getSessionById(sessionId);
      if (!session) {
        ResponseUtil.sessionNotFound(res);
        return;
      }

      if (session.userId !== userId) {
        ResponseUtil.accessDenied(res);
        return;
      }

      if (this.registrationSessionService.isSessionExpired(session)) {
        ResponseUtil.sessionExpired(res);
        return;
      }

      // Validate that personal info is completed
      if (!session.personalInfoCompletedAt) {
        ResponseUtil.previousStepIncomplete(res, 'personal_info');
        return;
      }

      // Enhanced vehicle-specific validation
      const validation = this.vehicleValidationService.validateVehicleData(session.vehicleType, vehicleDetails);
      if (!validation.isValid) {
        const validationErrors = validation.errors.map((error: any) => ({
          field: error.field,
          code: this.mapValidationErrorToCode(error.field, error.message),
          message: error.message,
          value: vehicleDetails[error.field]
        }));

        ResponseUtil.validationError(res, validationErrors);
        return;
      }

      // Update session with vehicle details
      const updatedSession = await this.registrationSessionService.updateSession(sessionId, {
        vehicleDetailsData: vehicleDetails,
        currentStep: 'documents',
        progressPercentage: 75,
      });

      // Get enhanced document requirements for next step
      const documentRequirements = await this.vehicleTypeService.getDocumentRequirements(session.vehicleType);

      ResponseUtil.success(res, {
        registration_id: updatedSession.id,
        status: updatedSession.status,
        current_step: updatedSession.currentStep,
        progress_percentage: updatedSession.progressPercentage,
        document_requirements: documentRequirements,
        next_action: {
          step: 'documents',
          endpoint: `/api/driver-registration/register/${sessionId}/documents`,
          method: 'POST',
        },
      });
    } catch (error: any) {
      console.error('Error submitting vehicle details:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to submit vehicle details'
      );
    }
  };

  /**
   * Upload documents (Enhanced Phase 4)
   */
  uploadDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id: sessionId } = req.params;
      const userId = req.user?.id;
      const { documents } = req.body;

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      // Get and validate session
      const session = await this.registrationSessionService.getSessionById(sessionId);
      if (!session) {
        ResponseUtil.sessionNotFound(res);
        return;
      }

      if (session.userId !== userId) {
        ResponseUtil.accessDenied(res);
        return;
      }

      if (this.registrationSessionService.isSessionExpired(session)) {
        ResponseUtil.sessionExpired(res);
        return;
      }

      // Validate that vehicle details are completed
      if (!session.vehicleDetailsCompletedAt) {
        ResponseUtil.previousStepIncomplete(res, 'vehicle_details');
        return;
      }

      if (!documents || !Array.isArray(documents) || documents.length === 0) {
        ResponseUtil.standardizedError(
          res,
          DriverRegistrationErrorCode.REQUIRED_FIELD_MISSING,
          'At least one document is required',
          'documents'
        );
        return;
      }

      // Enhanced document validation
      const documentValidationErrors = await this.comprehensiveValidationService.validateDocumentCompleteness(
        session.vehicleType,
        documents
      );

      if (documentValidationErrors.length > 0) {
        ResponseUtil.validationError(res, documentValidationErrors);
        return;
      }

      // Update session with documents
      const updatedSession = await this.registrationSessionService.updateSession(sessionId, {
        documentsData: { documents, uploaded_at: new Date().toISOString() },
        currentStep: 'review',
        progressPercentage: 90,
      });

      ResponseUtil.success(res, {
        registration_id: updatedSession.id,
        status: updatedSession.status,
        current_step: updatedSession.currentStep,
        progress_percentage: updatedSession.progressPercentage,
        documents_validated: documents.length,
        next_action: {
          step: 'review',
          endpoint: `/api/driver-registration/register/${sessionId}/submit`,
          method: 'POST',
        },
      });
    } catch (error: any) {
      console.error('Error uploading documents:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to upload documents'
      );
    }
  };

  /**
   * Submit registration for review (Enhanced Phase 4)
   */
  submitRegistration = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id: sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      // Get and validate session
      const session = await this.registrationSessionService.getSessionById(sessionId);
      if (!session) {
        ResponseUtil.sessionNotFound(res);
        return;
      }

      if (session.userId !== userId) {
        ResponseUtil.accessDenied(res);
        return;
      }

      if (this.registrationSessionService.isSessionExpired(session)) {
        ResponseUtil.sessionExpired(res);
        return;
      }

      // Validate that all steps are completed
      if (!session.personalInfoCompletedAt || !session.vehicleDetailsCompletedAt || !session.documentsCompletedAt) {
        const missingSteps = [];
        if (!session.personalInfoCompletedAt) missingSteps.push('personal_info');
        if (!session.vehicleDetailsCompletedAt) missingSteps.push('vehicle_details');
        if (!session.documentsCompletedAt) missingSteps.push('documents');

        ResponseUtil.standardizedError(
          res,
          DriverRegistrationErrorCode.PREVIOUS_STEP_INCOMPLETE,
          `Complete all steps before submission: ${missingSteps.join(', ')}`,
          'steps',
          { missing_steps: missingSteps }
        );
        return;
      }

      // Perform comprehensive validation before final submission
      const completeValidation = await this.comprehensiveValidationService.validateCompleteRegistration({
        vehicleType: session.vehicleType,
        serviceTypes: session.serviceTypes,
        personalInfo: session.personalInfoData,
        vehicleDetails: session.vehicleDetailsData,
        documents: session.documentsData
      });

      if (!completeValidation.isValid) {
        ResponseUtil.validationError(res, completeValidation.errors);
        return;
      }

      // Complete the session
      const completedSession = await this.registrationSessionService.completeSession(sessionId);

      const response: any = {
        registration_id: completedSession.id,
        status: completedSession.status,
        current_step: completedSession.currentStep,
        progress_percentage: completedSession.progressPercentage,
        submitted_at: completedSession.submittedAt,
        message: 'Registration submitted successfully. You will be notified once your application is reviewed.',
      };

      // Add warnings if any
      if (completeValidation.warnings && completeValidation.warnings.length > 0) {
        response.warnings = completeValidation.warnings;
      }

      ResponseUtil.success(res, response);
    } catch (error: any) {
      console.error('Error submitting registration:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to submit registration'
      );
    }
  };

  /**
   * Get registration status
   */
  getRegistrationStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id: sessionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      // Get session
      const session = await this.registrationSessionService.getSessionById(sessionId);
      if (!session) {
        ResponseUtil.sessionNotFound(res);
        return;
      }

      if (session.userId !== userId) {
        ResponseUtil.accessDenied(res);
        return;
      }

      // Calculate current progress and next step
      const currentProgress = this.registrationSessionService.calculateProgress(session);
      const nextStep = this.registrationSessionService.getNextStep(session);
      const isExpired = this.registrationSessionService.isSessionExpired(session);

      const response: any = {
        registration_id: session.id,
        status: isExpired ? 'expired' : session.status,
        current_step: session.currentStep,
        progress_percentage: currentProgress,
        vehicle_type: session.vehicleType,
        service_types: session.serviceTypes,
        created_at: session.createdAt,
        expires_at: session.expiresAt,
        is_expired: isExpired,
      };

      // Add step completion info
      if (session.personalInfoCompletedAt) {
        response.personal_info_completed_at = session.personalInfoCompletedAt;
      }
      if (session.vehicleDetailsCompletedAt) {
        response.vehicle_details_completed_at = session.vehicleDetailsCompletedAt;
      }
      if (session.documentsCompletedAt) {
        response.documents_completed_at = session.documentsCompletedAt;
      }
      if (session.submittedAt) {
        response.submitted_at = session.submittedAt;
      }

      // Add next action if not completed
      if (session.status !== 'completed' && !isExpired) {
        response.next_action = {
          step: nextStep,
          endpoint: `/api/driver-registration/register/${sessionId}/${nextStep.replace('_', '-')}`,
          method: 'POST',
        };
      }

      ResponseUtil.success(res, response);
    } catch (error: any) {
      console.error('Error getting registration status:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to get registration status'
      );
    }
  };

  /**
   * Resume registration
   */
  resumeRegistration = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      // Get active session for user
      const session = await this.registrationSessionService.getActiveSessionByUserId(userId);
      if (!session) {
        ResponseUtil.sessionNotFound(res);
        return;
      }

      // Check if expired
      if (this.registrationSessionService.isSessionExpired(session)) {
        ResponseUtil.sessionExpired(res);
        return;
      }

      // Calculate current progress and next step
      const currentProgress = this.registrationSessionService.calculateProgress(session);
      const nextStep = this.registrationSessionService.getNextStep(session);

      ResponseUtil.success(res, {
        registration_id: session.id,
        status: session.status,
        current_step: session.currentStep,
        progress_percentage: currentProgress,
        vehicle_type: session.vehicleType,
        service_types: session.serviceTypes,
        next_action: {
          step: nextStep,
          endpoint: `/api/driver-registration/register/${session.id}/${nextStep.replace('_', '-')}`,
          method: 'POST',
        },
      });
    } catch (error: any) {
      console.error('Error resuming registration:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to resume registration'
      );
    }
  };

  /**
   * Get error message for validation failures
   */
  private getErrorMessage(errorCode: string, vehicleType: string, serviceTypes: string[]): string {
    switch (errorCode) {
      case 'INVALID_VEHICLE_TYPE':
        return `Unsupported vehicle type: ${vehicleType}`;
      case 'INVALID_VEHICLE_SERVICE_COMBINATION':
        if (vehicleType === 'motorcycle' && serviceTypes.includes('ride')) {
          return 'Motorcycles can only be used for delivery services';
        }
        if (vehicleType === 'bicycle' && serviceTypes.includes('ride')) {
          return 'Bicycles can only be used for delivery services';
        }
        return `Vehicle type ${vehicleType} does not support the requested services: ${serviceTypes.join(', ')}`;
      default:
        return 'Invalid vehicle-service combination';
    }
  }

  /**
   * Map validation error messages to standardized error codes (Phase 4)
   */
  private mapValidationErrorToCode(field: string, message: string): DriverRegistrationErrorCode {
    // Age-related errors
    if (field === 'date_of_birth' && message.includes('18 years old')) {
      return DriverRegistrationErrorCode.AGE_REQUIREMENT_NOT_MET;
    }

    // Phone format errors
    if (field.includes('phone') && message.includes('valid phone')) {
      return DriverRegistrationErrorCode.INVALID_PHONE_FORMAT;
    }

    // Email format errors
    if (field.includes('email') && message.includes('valid email')) {
      return DriverRegistrationErrorCode.INVALID_EMAIL_FORMAT;
    }

    // Date format errors
    if (field.includes('date') && message.includes('date')) {
      return DriverRegistrationErrorCode.INVALID_DATE_FORMAT;
    }

    // VIN format errors
    if (field === 'vin' && message.includes('17 characters')) {
      return DriverRegistrationErrorCode.INVALID_VIN_FORMAT;
    }

    // Engine capacity errors
    if (field === 'engine_capacity') {
      return DriverRegistrationErrorCode.INVALID_ENGINE_CAPACITY;
    }

    // Seating capacity errors
    if (field === 'seating_capacity') {
      return DriverRegistrationErrorCode.INVALID_SEATING_CAPACITY;
    }

    // Load capacity errors
    if (field === 'load_capacity') {
      return DriverRegistrationErrorCode.INVALID_LOAD_CAPACITY;
    }

    // Required field errors
    if (message.includes('required') || message.includes('must be')) {
      return DriverRegistrationErrorCode.REQUIRED_FIELD_MISSING;
    }

    // Length validation errors
    if (message.includes('at least') && message.includes('characters')) {
      return DriverRegistrationErrorCode.FIELD_TOO_SHORT;
    }

    if (message.includes('maximum') || message.includes('too long')) {
      return DriverRegistrationErrorCode.FIELD_TOO_LONG;
    }

    // Default to generic validation failed
    return DriverRegistrationErrorCode.VALIDATION_FAILED;
  }
}