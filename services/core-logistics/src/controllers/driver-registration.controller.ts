import { Request, Response } from 'express';
import { VehicleTypeService } from '../services/vehicle-type.service';
import { VehicleValidationService } from '../services/vehicle-validation.service';
import { RegistrationSessionService } from '../services/registration-session.service';
import { ComprehensiveValidationService } from '../services/comprehensive-validation.service';
import { DocumentService } from '../services/document.service';
import { StorageUtil } from '../utils/storage.util';
import { ResponseUtil } from '../utils/response.util';
import { DriverRegistrationErrorCode } from '../types/error-codes.types';
import { logger } from '../config/logger';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
}

export class DriverRegistrationController {
  private vehicleTypeService: VehicleTypeService;
  private vehicleValidationService: VehicleValidationService;
  private registrationSessionService: RegistrationSessionService;
  private comprehensiveValidationService: ComprehensiveValidationService;
  private documentService: DocumentService;

  constructor() {
    this.vehicleTypeService = new VehicleTypeService();
    this.vehicleValidationService = new VehicleValidationService();
    this.registrationSessionService = new RegistrationSessionService();
    this.comprehensiveValidationService = new ComprehensiveValidationService();
    this.documentService = new DocumentService();
  }

  getVehicleTypes = async (_req: Request, res: Response): Promise<void> => {
    try {
      const vehicleTypes = await this.vehicleTypeService.getVehicleTypesWithServices();

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
   * Upload documents with real file processing
   */
  uploadDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id: sessionId } = req.params;
      const userId = req.user?.id;
      
      // Handle both array and object formats from multer
      let files: Express.Multer.File[] = [];
      if (req.files) {
        if (Array.isArray(req.files)) {
          files = req.files;
        } else {
          // If files is an object, flatten all arrays into one
          files = Object.values(req.files).flat();
        }
      }

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      // Log the request for debugging
      logger.info('Document upload request:', {
        sessionId,
        userId,
        filesCount: files.length,
        body: req.body,
        hasFiles: files.length > 0,
      });

      // Validate files exist
      if (!files || files.length === 0) {
        logger.error('No files received in upload request:', {
          files: req.files,
          body: req.body,
          headers: req.headers['content-type'],
        });
        
        ResponseUtil.standardizedError(
          res,
          DriverRegistrationErrorCode.REQUIRED_FIELD_MISSING,
          'At least one document file is required. Please ensure you are sending files in multipart/form-data format.',
          'files'
        );
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

      // Process each uploaded file
      const uploadedDocuments = [];
      const uploadErrors = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          // Extract document type from fieldname or body
          const documentType = this.extractDocumentType(file, req.body, i);
          
          if (!documentType) {
            uploadErrors.push({
              fileName: file.originalname,
              error: 'Document type not specified. Please provide documentType field.',
            });
            continue;
          }

          // Validate document type
          if (!this.documentService.validateDocumentType(documentType)) {
            uploadErrors.push({
              fileName: file.originalname,
              error: `Invalid document type: ${documentType}. Valid types: drivers_license, vehicle_registration, vehicle_insurance, profile_photo, vehicle_photo, national_id, passport`,
            });
            continue;
          }

          // Generate storage path
          const folderPath = this.documentService.generateDocumentPath(userId, documentType);

          // Upload file to Supabase Storage with enhanced security
          const uploadResult = await StorageUtil.uploadFile(file, folderPath);

          // Save document metadata to database with access logging and OCR processing
          const document = await this.documentService.createDocument({
            sessionId,
            userId,
            documentType,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            documentUrl: uploadResult.url,
            signedUrl: uploadResult.signedUrl,
            filePath: uploadResult.path,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            fileBuffer: file.buffer, // Pass file buffer for OCR processing
          });

          uploadedDocuments.push({
            id: document.id,
            type: documentType,
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            url: uploadResult.signedUrl, // Use signed URL for security
            publicUrl: uploadResult.url, // Keep for backward compatibility
            status: 'pending',
            uploadedAt: document.created_at,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
          });

          logger.info('Document uploaded successfully:', {
            sessionId,
            userId,
            documentType,
            fileName: file.originalname,
            documentId: document.id,
          });

        } catch (uploadError: any) {
          logger.error('File upload error:', {
            fileName: file.originalname,
            error: uploadError.message,
            userId,
            sessionId,
          });

          uploadErrors.push({
            fileName: file.originalname,
            error: uploadError.message,
          });
        }
      }

      // Check if any documents were successfully uploaded
      if (uploadedDocuments.length === 0) {
        ResponseUtil.standardizedError(
          res,
          DriverRegistrationErrorCode.DOCUMENT_UPLOAD_FAILED,
          'No documents were uploaded successfully',
          'files',
          { errors: uploadErrors }
        );
        return;
      }

      // Enhanced document validation (check completeness)
      const documentValidationErrors = await this.comprehensiveValidationService.validateDocumentCompleteness(
        session.vehicleType,
        uploadedDocuments
      );

      // Update session with documents
      const documentsData = {
        documents: uploadedDocuments,
        uploaded_at: new Date().toISOString(),
        upload_errors: uploadErrors.length > 0 ? uploadErrors : undefined,
      };

      const updatedSession = await this.registrationSessionService.updateSession(sessionId, {
        documentsData,
        currentStep: 'review',
        progressPercentage: 90,
      });

      const response: any = {
        registration_id: updatedSession.id,
        status: updatedSession.status,
        current_step: updatedSession.currentStep,
        progress_percentage: updatedSession.progressPercentage,
        documents_uploaded: uploadedDocuments.length,
        documents: uploadedDocuments,
        next_action: {
          step: 'review',
          endpoint: `/api/driver-registration/register/${sessionId}/submit`,
          method: 'POST',
        },
      };

      // Add warnings if validation errors exist
      if (documentValidationErrors.length > 0) {
        response.validation_warnings = documentValidationErrors;
      }

      // Add upload errors if any
      if (uploadErrors.length > 0) {
        response.upload_errors = uploadErrors;
        response.message = `${uploadedDocuments.length} documents uploaded successfully, ${uploadErrors.length} failed`;
      } else {
        response.message = 'All documents uploaded successfully';
      }

      ResponseUtil.success(res, response);

    } catch (error: any) {
      logger.error('Upload documents error:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to upload documents'
      );
    }
  };

  /**
   * Submit registration for review 
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
   * Extract document type from file or request body
   */
  private extractDocumentType(file: Express.Multer.File, body: any, fileIndex?: number): string | null {
    // Try to get document type from fieldname (e.g., 'drivers_license', 'vehicle_registration')
    if (file.fieldname && file.fieldname !== 'documents') {
      return file.fieldname;
    }

    // Try to get from body.documentType (single document)
    if (body.documentType) {
      return this.normalizeDocumentType(body.documentType);
    }

    // Try to get from body.documentTypes array (multiple documents)
    if (body.documentTypes && Array.isArray(body.documentTypes) && typeof fileIndex === 'number') {
      return this.normalizeDocumentType(body.documentTypes[fileIndex]);
    }

    // Try to get from body based on file index
    if (typeof fileIndex === 'number' && body[`documentType${fileIndex}`]) {
      return this.normalizeDocumentType(body[`documentType${fileIndex}`]);
    }

    // Try to infer from filename
    const fileName = file.originalname.toLowerCase();
    if (fileName.includes('license') || fileName.includes('licence')) {
      return 'drivers_license';
    }
    if (fileName.includes('registration')) {
      return 'vehicle_registration';
    }
    if (fileName.includes('insurance')) {
      return 'vehicle_insurance';
    }
    if (fileName.includes('profile') || fileName.includes('selfie')) {
      return 'profile_photo';
    }
    if (fileName.includes('vehicle') || fileName.includes('car')) {
      return 'vehicle_photo';
    }

    return null;
  }

  /**
   * Normalize document type names
   */
  private normalizeDocumentType(documentType: string): string {
    const normalized = documentType.toLowerCase().replace(/\s+/g, '_');
    
    // Handle common variations
    const mappings: { [key: string]: string } = {
      'driver_licence': 'drivers_license',
      'driver_license': 'drivers_license',
      'driving_license': 'drivers_license',
      'driving_licence': 'drivers_license',
      'license': 'drivers_license',
      'licence': 'drivers_license',
      'vehicle_reg': 'vehicle_registration',
      'car_registration': 'vehicle_registration',
      'registration': 'vehicle_registration',
      'insurance': 'vehicle_insurance',
      'car_insurance': 'vehicle_insurance',
      'profile': 'profile_photo',
      'selfie': 'profile_photo',
      'photo': 'profile_photo',
      'vehicle': 'vehicle_photo',
      'car_photo': 'vehicle_photo',
      'id': 'national_id',
      'national_id_card': 'national_id',
    };

    return mappings[normalized] || normalized;
  }

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

  /**
   * Get secure document URL for viewing
   */
  getDocumentUrl = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        ResponseUtil.authenticationRequired(res);
        return;
      }

      // Validate document access
      const hasAccess = await this.documentService.validateDocumentAccess(documentId, userId);
      if (!hasAccess) {
        ResponseUtil.accessDenied(res);
        return;
      }

      // Generate secure signed URL
      const signedUrl = await this.documentService.getSecureDocumentUrl(
        documentId,
        userId,
        24 * 60 * 60, // 24 hours
        req.ip,
        req.get('user-agent') || undefined
      );

      ResponseUtil.success(res, {
        documentId,
        signedUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        message: 'Secure document URL generated. This URL will expire in 24 hours.',
      });

    } catch (error: any) {
      logger.error('Get document URL error:', error);
      ResponseUtil.standardizedError(
        res,
        DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        'Failed to generate document URL'
      );
    }
  };
}