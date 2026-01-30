import { 
  DriverRegistrationErrorCode, 
  ValidationError 
} from '../types/error-codes.types';
import { VehicleValidationService } from './vehicle-validation.service';
import { VehicleTypeService } from './vehicle-type.service';

export interface CrossStepValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

export interface BusinessRuleValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  blockers?: string[];
}

export class ComprehensiveValidationService {
  private vehicleValidationService: VehicleValidationService;
  private vehicleTypeService: VehicleTypeService;

  constructor() {
    this.vehicleValidationService = new VehicleValidationService();
    this.vehicleTypeService = new VehicleTypeService();
  }

  /**
   * Validate complete registration data across all steps
   */
  async validateCompleteRegistration(registrationData: {
    vehicleType: string;
    serviceTypes: string[];
    personalInfo: any;
    vehicleDetails: any;
    documents: any;
  }): Promise<CrossStepValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    try {
      // 1. Validate vehicle-service combination
      const vehicleServiceValidation = await this.vehicleTypeService.validateVehicleServiceCombination(
        registrationData.vehicleType,
        registrationData.serviceTypes
      );

      if (!vehicleServiceValidation.isValid) {
        errors.push({
          field: 'vehicle_service_combination',
          code: DriverRegistrationErrorCode.INVALID_VEHICLE_SERVICE_COMBINATION,
          message: `Vehicle type ${registrationData.vehicleType} does not support services: ${registrationData.serviceTypes.join(', ')}`,
          value: {
            vehicle_type: registrationData.vehicleType,
            service_types: registrationData.serviceTypes
          }
        });
      }

      // 2. Validate personal information
      const personalInfoValidation = this.vehicleValidationService.validatePersonalInfo(registrationData.personalInfo);
      if (!personalInfoValidation.isValid) {
        personalInfoValidation.errors.forEach(error => {
          errors.push({
            field: error.field,
            code: this.mapValidationErrorToCode(error.field, error.message),
            message: error.message,
            value: registrationData.personalInfo[error.field]
          });
        });
      }

      // 3. Validate vehicle-specific data
      const vehicleDataValidation = this.vehicleValidationService.validateVehicleData(
        registrationData.vehicleType,
        registrationData.vehicleDetails
      );
      if (!vehicleDataValidation.isValid) {
        vehicleDataValidation.errors.forEach(error => {
          errors.push({
            field: error.field,
            code: this.mapValidationErrorToCode(error.field, error.message),
            message: error.message,
            value: registrationData.vehicleDetails[error.field]
          });
        });
      }

      // 4. Cross-step validation
      const crossStepErrors = this.performCrossStepValidation(registrationData);
      errors.push(...crossStepErrors);

      // 5. Business rule validation
      const businessRuleValidation = await this.validateBusinessRules(registrationData);
      errors.push(...businessRuleValidation.errors);
      if (businessRuleValidation.blockers) {
        warnings.push(...businessRuleValidation.blockers);
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error: any) {
      errors.push({
        field: 'system',
        code: DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Validation system error occurred',
        value: error.message
      });

      return {
        isValid: false,
        errors
      };
    }
  }

  /**
   * Validate step progression and dependencies
   */
  validateStepProgression(
    currentStep: string,
    targetStep: string,
    completedSteps: string[]
  ): CrossStepValidationResult {
    const errors: ValidationError[] = [];
    const stepOrder = ['initiate', 'personal_info', 'vehicle_details', 'documents', 'submit'];
    
    const currentIndex = stepOrder.indexOf(currentStep);
    const targetIndex = stepOrder.indexOf(targetStep);

    // Check if target step exists
    if (targetIndex === -1) {
      errors.push({
        field: 'step',
        code: DriverRegistrationErrorCode.INVALID_STEP_TRANSITION,
        message: `Invalid step: ${targetStep}`,
        value: targetStep
      });
    }

    // Check if trying to skip steps
    if (targetIndex > currentIndex + 1) {
      errors.push({
        field: 'step',
        code: DriverRegistrationErrorCode.STEP_OUT_OF_ORDER,
        message: `Cannot skip to ${targetStep}. Complete ${stepOrder[currentIndex + 1]} first.`,
        value: { current: currentStep, target: targetStep, required: stepOrder[currentIndex + 1] }
      });
    }

    // Check if previous steps are completed
    for (let i = 0; i < targetIndex; i++) {
      const requiredStep = stepOrder[i];
      if (!completedSteps.includes(requiredStep)) {
        errors.push({
          field: 'step',
          code: DriverRegistrationErrorCode.PREVIOUS_STEP_INCOMPLETE,
          message: `Step ${requiredStep} must be completed before ${targetStep}`,
          value: { incomplete_step: requiredStep, target_step: targetStep }
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate age requirements
   */
  validateAgeRequirement(dateOfBirth: string, vehicleType: string): ValidationError | null {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    // Adjust age if birthday hasn't occurred this year
    const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate()) 
      ? age - 1 
      : age;

    // Different age requirements for different vehicle types
    const ageRequirements: { [key: string]: number } = {
      'bicycle': 16,
      'motorcycle': 18,
      'car': 18,
      'truck': 21,
      'bus': 25,
      'minibus': 23
    };

    const requiredAge = ageRequirements[vehicleType.toLowerCase()] || 18;

    if (actualAge < requiredAge) {
      return {
        field: 'date_of_birth',
        code: DriverRegistrationErrorCode.AGE_REQUIREMENT_NOT_MET,
        message: `You must be at least ${requiredAge} years old to drive a ${vehicleType}. Current age: ${actualAge}`,
        value: { current_age: actualAge, required_age: requiredAge, vehicle_type: vehicleType }
      };
    }

    return null;
  }

  /**
   * Validate document completeness and requirements
   */
  async validateDocumentCompleteness(
    vehicleType: string,
    uploadedDocuments: any[]
  ): Promise<ValidationError[]> {
    const errors: ValidationError[] = [];

    try {
      const requirements = await this.vehicleTypeService.getDocumentRequirements(vehicleType);
      const requiredDocTypes = requirements.required_documents.map((doc: any) => doc.type);
      const uploadedDocTypes = uploadedDocuments.map((doc: any) => doc.type);

      // Check for missing required documents
      for (const requiredType of requiredDocTypes) {
        if (!uploadedDocTypes.includes(requiredType)) {
          const docInfo = requirements.required_documents.find((doc: any) => doc.type === requiredType);
          errors.push({
            field: 'documents',
            code: DriverRegistrationErrorCode.DOCUMENT_REQUIRED,
            message: `Required document missing: ${docInfo?.name || requiredType}`,
            value: { missing_document_type: requiredType, document_name: docInfo?.name }
          });
        }
      }

      // Validate document formats and sizes
      for (const doc of uploadedDocuments) {
        const requirement = requirements.required_documents.find((req: any) => req.type === doc.type);
        if (requirement) {
          // Check format
          if (doc.filename && requirement.formats) {
            const fileExtension = doc.filename.split('.').pop()?.toLowerCase();
            if (fileExtension && !requirement.formats.includes(fileExtension)) {
              errors.push({
                field: 'documents',
                code: DriverRegistrationErrorCode.DOCUMENT_FORMAT_INVALID,
                message: `Invalid format for ${requirement.name}. Allowed: ${requirement.formats.join(', ')}`,
                value: { 
                  document_type: doc.type, 
                  provided_format: fileExtension, 
                  allowed_formats: requirement.formats 
                }
              });
            }
          }

          // Check size (if provided)
          if (doc.size && requirement.maxSize) {
            const maxSizeBytes = this.parseMaxSize(requirement.maxSize);
            if (doc.size > maxSizeBytes) {
              errors.push({
                field: 'documents',
                code: DriverRegistrationErrorCode.DOCUMENT_SIZE_EXCEEDED,
                message: `Document ${requirement.name} exceeds maximum size of ${requirement.maxSize}`,
                value: { 
                  document_type: doc.type, 
                  size: doc.size, 
                  max_size: maxSizeBytes 
                }
              });
            }
          }
        }
      }

    } catch (error: any) {
      errors.push({
        field: 'documents',
        code: DriverRegistrationErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Error validating document requirements',
        value: error.message
      });
    }

    return errors;
  }

  /**
   * Perform cross-step validation checks
   */
  private performCrossStepValidation(registrationData: any): ValidationError[] {
    const errors: ValidationError[] = [];

    // 1. Age validation based on vehicle type
    if (registrationData.personalInfo?.date_of_birth) {
      const ageError = this.validateAgeRequirement(
        registrationData.personalInfo.date_of_birth,
        registrationData.vehicleType
      );
      if (ageError) {
        errors.push(ageError);
      }
    }

    // 2. Phone number consistency
    if (registrationData.personalInfo?.phone && registrationData.personalInfo?.emergency_contact?.phone) {
      if (registrationData.personalInfo.phone === registrationData.personalInfo.emergency_contact.phone) {
        errors.push({
          field: 'emergency_contact.phone',
          code: DriverRegistrationErrorCode.INVALID_FIELD_VALUE,
          message: 'Emergency contact phone cannot be the same as your phone number',
          value: registrationData.personalInfo.emergency_contact.phone
        });
      }
    }

    // 3. Vehicle year validation
    if (registrationData.vehicleDetails?.year) {
      const currentYear = new Date().getFullYear();
      const vehicleYear = parseInt(registrationData.vehicleDetails.year);
      
      if (vehicleYear > currentYear + 1) {
        errors.push({
          field: 'year',
          code: DriverRegistrationErrorCode.VEHICLE_YEAR_OUT_OF_RANGE,
          message: `Vehicle year cannot be in the future. Maximum allowed: ${currentYear + 1}`,
          value: { provided_year: vehicleYear, max_year: currentYear + 1 }
        });
      }

      // Minimum year requirements by vehicle type
      const minYearRequirements: { [key: string]: number } = {
        'car': 2000,
        'motorcycle': 2000,
        'bicycle': 2010,
        'truck': 2000,
        'bus': 2005,
        'minibus': 2005
      };

      const minYear = minYearRequirements[registrationData.vehicleType.toLowerCase()] || 2000;
      if (vehicleYear < minYear) {
        errors.push({
          field: 'year',
          code: DriverRegistrationErrorCode.VEHICLE_YEAR_OUT_OF_RANGE,
          message: `${registrationData.vehicleType} must be ${minYear} or newer`,
          value: { provided_year: vehicleYear, min_year: minYear, vehicle_type: registrationData.vehicleType }
        });
      }
    }

    return errors;
  }

  /**
   * Validate business rules
   */
  private async validateBusinessRules(registrationData: any): Promise<BusinessRuleValidationResult> {
    const errors: ValidationError[] = [];
    const blockers: string[] = [];

    // This would typically check against database for existing registrations
    // For now, we'll implement basic business rule validations

    // 1. Check for duplicate VIN (for vehicles that have VIN)
    if (registrationData.vehicleDetails?.vin) {
      // TODO: Check database for existing VIN
      // This is a placeholder for actual database check
      const vinExists = false; // await this.checkVinExists(registrationData.vehicleDetails.vin);
      
      if (vinExists) {
        errors.push({
          field: 'vin',
          code: DriverRegistrationErrorCode.VEHICLE_ALREADY_REGISTERED,
          message: 'This vehicle is already registered with another driver',
          value: registrationData.vehicleDetails.vin
        });
      }
    }

    // 2. Check for duplicate plate number
    if (registrationData.vehicleDetails?.plate_number) {
      // TODO: Check database for existing plate number
      const plateExists = false; // await this.checkPlateExists(registrationData.vehicleDetails.plate_number);
      
      if (plateExists) {
        errors.push({
          field: 'plate_number',
          code: DriverRegistrationErrorCode.VEHICLE_ALREADY_REGISTERED,
          message: 'This license plate is already registered',
          value: registrationData.vehicleDetails.plate_number
        });
      }
    }

    // 3. Service area validation (placeholder)
    if (registrationData.personalInfo?.address?.city) {
      const supportedCities = ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan']; // Example
      if (!supportedCities.includes(registrationData.personalInfo.address.city)) {
        blockers.push(`Service not yet available in ${registrationData.personalInfo.address.city}. Currently available in: ${supportedCities.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      blockers: blockers.length > 0 ? blockers : undefined
    };
  }

  /**
   * Map validation error messages to standardized error codes
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
   * Parse max size string to bytes
   */
  private parseMaxSize(maxSize: string): number {
    const size = parseFloat(maxSize);
    const unit = maxSize.toLowerCase().replace(/[0-9.]/g, '');

    switch (unit) {
      case 'kb':
        return size * 1024;
      case 'mb':
        return size * 1024 * 1024;
      case 'gb':
        return size * 1024 * 1024 * 1024;
      default:
        return size; // Assume bytes
    }
  }
}