import { supabase } from '../config/database';
import { VehicleValidationService } from './vehicle-validation.service';

export interface VehicleTypeWithServices {
  id: string;
  name: string;
  displayName: string;
  description: string;
  capacity: number;
  iconUrl: string;
  availableServices: string[];
  requirements: {
    licenseRequired: boolean;
    insuranceRequired: boolean;
    registrationRequired: boolean;
  };
}

export interface ServiceValidationResult {
  isValid: boolean;
  error?: string;
  allowedServices?: string[];
}

export class VehicleTypeService {
  private vehicleValidationService: VehicleValidationService;

  constructor() {
    this.vehicleValidationService = new VehicleValidationService();
  }
  /**
   * Get all vehicle types with their service capabilities
   * Matches frontend API expectation exactly
   */
  async getVehicleTypesWithServices(): Promise<VehicleTypeWithServices[]> {
    const { data: vehicleTypes, error } = await supabase
      .from('vehicle_types')
      .select(`
        id,
        name,
        display_name,
        description,
        capacity,
        icon_url,
        license_required,
        insurance_required,
        registration_required,
        is_active,
        service_capabilities:vehicle_service_capabilities(
          is_available,
          service_type:service_types(
            name,
            display_name
          )
        )
      `)
      .eq('is_active', true)
      .in('name', ['car', 'motorcycle', 'bicycle', 'truck', 'bus', 'minibus']) // Only actual vehicle types
      .order('name');

    if (error) {
      throw new Error(`Failed to fetch vehicle types: ${error.message}`);
    }

    return vehicleTypes.map((vt: any) => ({
      id: vt.name, // Use name as ID for frontend compatibility
      name: vt.display_name,
      displayName: vt.display_name,
      description: vt.description,
      capacity: vt.capacity,
      iconUrl: vt.icon_url,
      availableServices: vt.service_capabilities
        .filter((sc: any) => sc.is_available)
        .map((sc: any) => sc.service_type.name),
      requirements: {
        licenseRequired: vt.license_required,
        insuranceRequired: vt.insurance_required,
        registrationRequired: vt.registration_required,
      },
    }));
  }

  /**
   * Validate if a vehicle type supports specific services
   */
  async validateVehicleServiceCombination(
    vehicleTypeName: string,
    requestedServices: string[]
  ): Promise<ServiceValidationResult> {
    const { data: vehicleType, error } = await supabase
      .from('vehicle_types')
      .select(`
        name,
        display_name,
        service_capabilities:vehicle_service_capabilities(
          is_available,
          service_type:service_types(name)
        )
      `)
      .eq('name', vehicleTypeName)
      .eq('is_active', true)
      .single();

    if (error || !vehicleType) {
      return {
        isValid: false,
        error: 'INVALID_VEHICLE_TYPE',
      };
    }

    const allowedServices = vehicleType.service_capabilities
      .filter((sc: any) => sc.is_available)
      .map((sc: any) => sc.service_type.name);

    const invalidServices = requestedServices.filter(
      (service) => !allowedServices.includes(service)
    );

    if (invalidServices.length > 0) {
      return {
        isValid: false,
        error: 'INVALID_VEHICLE_SERVICE_COMBINATION',
        allowedServices,
      };
    }

    return {
      isValid: true,
      allowedServices,
    };
  }

  /**
   * Get vehicle type by name with full details
   */
  async getVehicleTypeByName(name: string): Promise<any> {
    const { data: vehicleType, error } = await supabase
      .from('vehicle_types')
      .select(`
        *,
        service_capabilities:vehicle_service_capabilities(
          is_available,
          service_type:service_types(*)
        )
      `)
      .eq('name', name)
      .eq('is_active', true)
      .single();

    if (error) {
      throw new Error(`Failed to fetch vehicle type: ${error.message}`);
    }

    return vehicleType;
  }

  /**
   * Get document requirements for a specific vehicle type (Enhanced for Phase 3)
   */
  async getDocumentRequirements(vehicleTypeName: string): Promise<any> {
    try {
      // Use the enhanced vehicle validation service for document requirements
      const documentRequirements = this.vehicleValidationService.getVehicleDocumentRequirements(vehicleTypeName);
      
      return {
        vehicle_type: vehicleTypeName,
        required_documents: documentRequirements.requiredDocuments,
        optional_documents: documentRequirements.optionalDocuments,
        additional_notes: documentRequirements.additionalNotes || [],
        total_required: documentRequirements.requiredDocuments.length,
        total_optional: documentRequirements.optionalDocuments.length,
      };
    } catch (error: any) {
      throw new Error(`Failed to get document requirements: ${error.message}`);
    }
  }

  /**
   * Get form configuration for vehicle type (Phase 3)
   */
  async getVehicleFormConfig(vehicleTypeName: string): Promise<any> {
    try {
      const formConfig = this.vehicleValidationService.getVehicleFormConfig(vehicleTypeName);
      
      return {
        vehicle_type: vehicleTypeName,
        personal_info_fields: formConfig.personalInfoFields,
        vehicle_details_fields: formConfig.vehicleDetailsFields,
        field_count: {
          personal_info: formConfig.personalInfoFields.length,
          vehicle_details: formConfig.vehicleDetailsFields.length,
        },
      };
    } catch (error: any) {
      throw new Error(`Failed to get form configuration: ${error.message}`);
    }
  }

  /**
   * Validate personal information (Phase 3)
   */
  validatePersonalInfo(data: any): any {
    return this.vehicleValidationService.validatePersonalInfo(data);
  }

  /**
   * Validate vehicle-specific data (Phase 3)
   */
  validateVehicleData(vehicleType: string, data: any): any {
    return this.vehicleValidationService.validateVehicleData(vehicleType, data);
  }
}