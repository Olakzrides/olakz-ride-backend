// Phase 3: Vehicle-Specific Data Types

export interface BaseVehicleData {
  plate_number: string;
  manufacturer: string;
  model: string;
  year: number;
  color: string;
}

// Car-specific fields
export interface CarVehicleData extends BaseVehicleData {
  vin: string;
  seating_capacity: number;
  fuel_type: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
  transmission: 'manual' | 'automatic' | 'cvt';
  engine_size?: string; // e.g., "2.0L", "1.6L"
  doors: number;
  air_conditioning: boolean;
}

// Motorcycle-specific fields
export interface MotorcycleVehicleData extends BaseVehicleData {
  engine_capacity: number; // in CC
  engine_number: string;
  bike_type: 'sport' | 'cruiser' | 'touring' | 'standard' | 'scooter' | 'dirt';
  fuel_type: 'gasoline' | 'electric';
  has_storage_box: boolean;
}

// Bicycle-specific fields
export interface BicycleVehicleData extends Omit<BaseVehicleData, 'plate_number'> {
  frame_number: string;
  gear_system: 'single_speed' | 'multi_speed' | 'automatic';
  bike_type: 'mountain' | 'road' | 'hybrid' | 'electric' | 'bmx' | 'folding';
  is_electric: boolean;
  battery_capacity?: number; // for electric bikes, in Wh
  max_range?: number; // for electric bikes, in km
  has_basket: boolean;
  has_cargo_rack: boolean;
}

// Truck-specific fields
export interface TruckVehicleData extends BaseVehicleData {
  vin: string;
  load_capacity: number; // in kg
  truck_type: 'pickup' | 'van' | 'box_truck' | 'flatbed' | 'refrigerated';
  fuel_type: 'gasoline' | 'diesel';
  transmission: 'manual' | 'automatic';
  has_lift_gate: boolean;
  cargo_dimensions: {
    length: number; // in meters
    width: number;
    height: number;
  };
}

// Bus-specific fields
export interface BusVehicleData extends BaseVehicleData {
  vin: string;
  seating_capacity: number;
  fuel_type: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
  transmission: 'manual' | 'automatic';
  bus_type: 'minibus' | 'standard' | 'articulated';
  wheelchair_accessible: boolean;
  air_conditioning: boolean;
}

// Minibus-specific fields (similar to bus but smaller)
export interface MinibusVehicleData extends BaseVehicleData {
  vin: string;
  seating_capacity: number;
  fuel_type: 'gasoline' | 'diesel' | 'electric' | 'hybrid';
  transmission: 'manual' | 'automatic';
  has_luggage_compartment: boolean;
  air_conditioning: boolean;
}

// Union type for all vehicle data
export type VehicleSpecificData = 
  | CarVehicleData 
  | MotorcycleVehicleData 
  | BicycleVehicleData 
  | TruckVehicleData 
  | BusVehicleData 
  | MinibusVehicleData;

// Enhanced Personal Information
export interface EnhancedPersonalInfo {
  // Basic info
  first_name: string;
  last_name: string;
  middle_name?: string;
  phone: string;
  email?: string;
  date_of_birth: string; // ISO date string
  gender?: 'male' | 'female' | 'other';
  
  // Address structure
  address: {
    street: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    apartment?: string;
    landmark?: string;
  };
  
  // Emergency contact
  emergency_contact: {
    name: string;
    relationship: string;
    phone: string;
    email?: string;
  };
  
  // Additional info
  preferred_language?: string;
  has_driving_experience: boolean;
  years_of_experience?: number;
}

// Document types per vehicle
export interface DocumentRequirement {
  type: string;
  name: string;
  description: string;
  required: boolean;
  formats: string[];
  maxSize: string;
  count?: number;
  validationRules?: {
    expiryRequired?: boolean;
    minValidityMonths?: number;
    specificRequirements?: string[];
  };
}

// Vehicle-specific document requirements
export interface VehicleDocumentRequirements {
  vehicleType: string;
  requiredDocuments: DocumentRequirement[];
  optionalDocuments: DocumentRequirement[];
  additionalNotes?: string[];
}

// Form field definitions for dynamic forms
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'date' | 'email' | 'tel';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    minLength?: number;
    maxLength?: number;
  };
  helpText?: string;
  dependsOn?: {
    field: string;
    value: any;
  };
}

// Vehicle-specific form configurations
export interface VehicleFormConfig {
  vehicleType: string;
  personalInfoFields: FormField[];
  vehicleDetailsFields: FormField[];
  additionalValidation?: {
    [fieldName: string]: (value: any, allData: any) => string | null;
  };
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errors: {
    field: string;
    message: string;
  }[];
  warnings?: {
    field: string;
    message: string;
  }[];
}