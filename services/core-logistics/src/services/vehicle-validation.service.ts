import {
  ValidationResult,
  FormField,
  VehicleFormConfig,
  DocumentRequirement,
  VehicleDocumentRequirements,
  CarVehicleData,
  MotorcycleVehicleData,
  BicycleVehicleData,
  TruckVehicleData,
  BusVehicleData,
  MinibusVehicleData,
} from '../types/vehicle-specific.types';

export class VehicleValidationService {
  /**
   * Get form configuration for a specific vehicle type
   */
  getVehicleFormConfig(vehicleType: string): VehicleFormConfig {
    const basePersonalInfoFields: FormField[] = [
      {
        name: 'first_name',
        label: 'First Name',
        type: 'text',
        required: true,
        validation: { minLength: 2, maxLength: 50 }
      },
      {
        name: 'last_name',
        label: 'Last Name',
        type: 'text',
        required: true,
        validation: { minLength: 2, maxLength: 50 }
      },
      {
        name: 'middle_name',
        label: 'Middle Name',
        type: 'text',
        required: false,
        validation: { maxLength: 50 }
      },
      {
        name: 'phone',
        label: 'Phone Number',
        type: 'tel',
        required: true,
        placeholder: '+1234567890',
        validation: { pattern: '^\\+?[1-9]\\d{1,14}$' }
      },
      {
        name: 'email',
        label: 'Email Address',
        type: 'email',
        required: false
      },
      {
        name: 'date_of_birth',
        label: 'Date of Birth',
        type: 'date',
        required: true
      },
      {
        name: 'gender',
        label: 'Gender',
        type: 'select',
        required: false,
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'other', label: 'Other' }
        ]
      },
      // Address fields
      {
        name: 'address.street',
        label: 'Street Address',
        type: 'text',
        required: true,
        validation: { minLength: 5, maxLength: 200 }
      },
      {
        name: 'address.city',
        label: 'City',
        type: 'text',
        required: true,
        validation: { minLength: 2, maxLength: 100 }
      },
      {
        name: 'address.state',
        label: 'State/Province',
        type: 'text',
        required: true,
        validation: { minLength: 2, maxLength: 100 }
      },
      {
        name: 'address.postal_code',
        label: 'Postal Code',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 20 }
      },
      {
        name: 'address.country',
        label: 'Country',
        type: 'text',
        required: true,
        validation: { minLength: 2, maxLength: 100 }
      },
      // Emergency contact
      {
        name: 'emergency_contact.name',
        label: 'Emergency Contact Name',
        type: 'text',
        required: true,
        validation: { minLength: 2, maxLength: 100 }
      },
      {
        name: 'emergency_contact.relationship',
        label: 'Relationship',
        type: 'select',
        required: true,
        options: [
          { value: 'spouse', label: 'Spouse' },
          { value: 'parent', label: 'Parent' },
          { value: 'sibling', label: 'Sibling' },
          { value: 'child', label: 'Child' },
          { value: 'friend', label: 'Friend' },
          { value: 'other', label: 'Other' }
        ]
      },
      {
        name: 'emergency_contact.phone',
        label: 'Emergency Contact Phone',
        type: 'tel',
        required: true,
        validation: { pattern: '^\\+?[1-9]\\d{1,14}$' }
      },
      {
        name: 'has_driving_experience',
        label: 'Do you have driving experience?',
        type: 'boolean',
        required: true
      },
      {
        name: 'years_of_experience',
        label: 'Years of Experience',
        type: 'number',
        required: false,
        dependsOn: { field: 'has_driving_experience', value: true },
        validation: { min: 0, max: 50 }
      }
    ];

    switch (vehicleType.toLowerCase()) {
      case 'car':
        return {
          vehicleType: 'car',
          personalInfoFields: basePersonalInfoFields,
          vehicleDetailsFields: this.getCarVehicleFields()
        };
      case 'motorcycle':
        return {
          vehicleType: 'motorcycle',
          personalInfoFields: basePersonalInfoFields,
          vehicleDetailsFields: this.getMotorcycleVehicleFields()
        };
      case 'bicycle':
        return {
          vehicleType: 'bicycle',
          personalInfoFields: basePersonalInfoFields,
          vehicleDetailsFields: this.getBicycleVehicleFields()
        };
      case 'truck':
        return {
          vehicleType: 'truck',
          personalInfoFields: basePersonalInfoFields,
          vehicleDetailsFields: this.getTruckVehicleFields()
        };
      case 'bus':
        return {
          vehicleType: 'bus',
          personalInfoFields: basePersonalInfoFields,
          vehicleDetailsFields: this.getBusVehicleFields()
        };
      case 'minibus':
        return {
          vehicleType: 'minibus',
          personalInfoFields: basePersonalInfoFields,
          vehicleDetailsFields: this.getMinibusVehicleFields()
        };
      default:
        throw new Error(`Unsupported vehicle type: ${vehicleType}`);
    }
  }

  /**
   * Get vehicle-specific document requirements
   */
  getVehicleDocumentRequirements(vehicleType: string): VehicleDocumentRequirements {
    const baseDocuments: DocumentRequirement[] = [
      {
        type: 'national_id',
        name: 'National ID',
        description: 'Government issued ID',
        required: true,
        formats: ['jpg', 'png', 'pdf'],
        maxSize: '5MB',
        validationRules: {
          expiryRequired: true,
          minValidityMonths: 6
        }
      },
      {
        type: 'passport_photo',
        name: 'Passport Photo',
        description: 'Recent passport-style photo',
        required: true,
        formats: ['jpg', 'png'],
        maxSize: '2MB'
      },
      {
        type: 'vehicle_photos',
        name: 'Vehicle Photos',
        description: '4 photos: front, back, left side, right side',
        required: true,
        formats: ['jpg', 'png'],
        maxSize: '5MB',
        count: 4
      }
    ];

    switch (vehicleType.toLowerCase()) {
      case 'car':
        return {
          vehicleType: 'car',
          requiredDocuments: [
            ...baseDocuments,
            {
              type: 'driver_license',
              name: "Driver's License",
              description: 'Valid driver\'s license for cars',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 3,
                specificRequirements: ['Must be valid for passenger vehicles']
              }
            },
            {
              type: 'vehicle_registration',
              name: 'Vehicle Registration',
              description: 'Vehicle registration certificate',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 1
              }
            },
            {
              type: 'insurance_certificate',
              name: 'Insurance Certificate',
              description: 'Valid vehicle insurance',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 1
              }
            }
          ],
          optionalDocuments: [
            {
              type: 'roadworthiness_certificate',
              name: 'Roadworthiness Certificate',
              description: 'Vehicle inspection certificate',
              required: false,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB'
            }
          ],
          additionalNotes: [
            'All documents must be clear and readable',
            'Vehicle photos should show the entire vehicle',
            'Insurance must cover commercial use'
          ]
        };

      case 'motorcycle':
        return {
          vehicleType: 'motorcycle',
          requiredDocuments: [
            ...baseDocuments,
            {
              type: 'motorcycle_license',
              name: 'Motorcycle License',
              description: 'Valid motorcycle license',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 3,
                specificRequirements: ['Must be valid for motorcycles']
              }
            },
            {
              type: 'vehicle_registration',
              name: 'Motorcycle Registration',
              description: 'Motorcycle registration certificate',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB'
            },
            {
              type: 'insurance_certificate',
              name: 'Insurance Certificate',
              description: 'Valid motorcycle insurance',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 1
              }
            }
          ],
          optionalDocuments: [
            {
              type: 'helmet_photo',
              name: 'Helmet Photo',
              description: 'Photo of safety helmet',
              required: false,
              formats: ['jpg', 'png'],
              maxSize: '2MB'
            }
          ],
          additionalNotes: [
            'Helmet is mandatory for motorcycle drivers',
            'Insurance must cover delivery services'
          ]
        };

      case 'bicycle':
        return {
          vehicleType: 'bicycle',
          requiredDocuments: [
            {
              type: 'national_id',
              name: 'National ID',
              description: 'Government issued ID',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB'
            },
            {
              type: 'passport_photo',
              name: 'Passport Photo',
              description: 'Recent passport-style photo',
              required: true,
              formats: ['jpg', 'png'],
              maxSize: '2MB'
            },
            {
              type: 'bicycle_photos',
              name: 'Bicycle Photos',
              description: '2 photos: side view and serial number',
              required: true,
              formats: ['jpg', 'png'],
              maxSize: '5MB',
              count: 2
            }
          ],
          optionalDocuments: [
            {
              type: 'helmet_photo',
              name: 'Helmet Photo',
              description: 'Photo of safety helmet',
              required: false,
              formats: ['jpg', 'png'],
              maxSize: '2MB'
            }
          ],
          additionalNotes: [
            'No license required for bicycles',
            'Safety helmet recommended',
            'Bicycle must be in good working condition'
          ]
        };

      case 'truck':
        return {
          vehicleType: 'truck',
          requiredDocuments: [
            ...baseDocuments,
            {
              type: 'commercial_license',
              name: 'Commercial Driver License',
              description: 'Valid commercial driver license',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 6,
                specificRequirements: ['Must be valid for commercial vehicles']
              }
            },
            {
              type: 'vehicle_registration',
              name: 'Truck Registration',
              description: 'Commercial vehicle registration',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB'
            },
            {
              type: 'commercial_insurance',
              name: 'Commercial Insurance',
              description: 'Commercial vehicle insurance',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 1
              }
            },
            {
              type: 'goods_transport_permit',
              name: 'Goods Transport Permit',
              description: 'Permit for goods transportation',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB'
            }
          ],
          optionalDocuments: [],
          additionalNotes: [
            'Commercial license required for trucks',
            'Must have goods transport permit',
            'Insurance must cover commercial cargo'
          ]
        };

      case 'bus':
      case 'minibus':
        return {
          vehicleType,
          requiredDocuments: [
            ...baseDocuments,
            {
              type: 'passenger_license',
              name: 'Passenger Vehicle License',
              description: 'Valid license for passenger vehicles',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 6
              }
            },
            {
              type: 'vehicle_registration',
              name: 'Vehicle Registration',
              description: 'Passenger vehicle registration',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB'
            },
            {
              type: 'passenger_insurance',
              name: 'Passenger Insurance',
              description: 'Insurance covering passengers',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB',
              validationRules: {
                expiryRequired: true,
                minValidityMonths: 1
              }
            },
            {
              type: 'route_permit',
              name: 'Route Permit',
              description: 'Permit for passenger transport',
              required: true,
              formats: ['jpg', 'png', 'pdf'],
              maxSize: '5MB'
            }
          ],
          optionalDocuments: [],
          additionalNotes: [
            'Passenger vehicle license required',
            'Must have route permit',
            'Insurance must cover all passengers'
          ]
        };

      default:
        throw new Error(`Unsupported vehicle type: ${vehicleType}`);
    }
  }

  /**
   * Validate personal information
   */
  validatePersonalInfo(data: any): ValidationResult {
    const errors: { field: string; message: string }[] = [];

    // Basic validation
    if (!data.first_name || data.first_name.length < 2) {
      errors.push({ field: 'first_name', message: 'First name must be at least 2 characters' });
    }
    if (!data.last_name || data.last_name.length < 2) {
      errors.push({ field: 'last_name', message: 'Last name must be at least 2 characters' });
    }
    if (!data.phone || !/^\+?[1-9]\d{1,14}$/.test(data.phone)) {
      errors.push({ field: 'phone', message: 'Please provide a valid phone number' });
    }
    if (!data.date_of_birth) {
      errors.push({ field: 'date_of_birth', message: 'Date of birth is required' });
    } else {
      // Check if user is at least 18 years old
      const birthDate = new Date(data.date_of_birth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < 18) {
        errors.push({ field: 'date_of_birth', message: 'You must be at least 18 years old' });
      }
    }

    // Address validation
    if (!data.address?.street) {
      errors.push({ field: 'address.street', message: 'Street address is required' });
    }
    if (!data.address?.city) {
      errors.push({ field: 'address.city', message: 'City is required' });
    }
    if (!data.address?.state) {
      errors.push({ field: 'address.state', message: 'State is required' });
    }
    if (!data.address?.postal_code) {
      errors.push({ field: 'address.postal_code', message: 'Postal code is required' });
    }

    // Emergency contact validation
    if (!data.emergency_contact?.name) {
      errors.push({ field: 'emergency_contact.name', message: 'Emergency contact name is required' });
    }
    if (!data.emergency_contact?.phone) {
      errors.push({ field: 'emergency_contact.phone', message: 'Emergency contact phone is required' });
    }
    if (!data.emergency_contact?.relationship) {
      errors.push({ field: 'emergency_contact.relationship', message: 'Relationship is required' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate vehicle-specific data
   */
  validateVehicleData(vehicleType: string, data: any): ValidationResult {
    switch (vehicleType.toLowerCase()) {
      case 'car':
        return this.validateCarData(data);
      case 'motorcycle':
        return this.validateMotorcycleData(data);
      case 'bicycle':
        return this.validateBicycleData(data);
      case 'truck':
        return this.validateTruckData(data);
      case 'bus':
        return this.validateBusData(data);
      case 'minibus':
        return this.validateMinibusData(data);
      default:
        return {
          isValid: false,
          errors: [{ field: 'vehicle_type', message: `Unsupported vehicle type: ${vehicleType}` }]
        };
    }
  }

  // Private methods for vehicle-specific field definitions
  private getCarVehicleFields(): FormField[] {
    return [
      {
        name: 'plate_number',
        label: 'License Plate Number',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 15 }
      },
      {
        name: 'manufacturer',
        label: 'Manufacturer',
        type: 'select',
        required: true,
        options: [
          { value: 'toyota', label: 'Toyota' },
          { value: 'honda', label: 'Honda' },
          { value: 'nissan', label: 'Nissan' },
          { value: 'hyundai', label: 'Hyundai' },
          { value: 'kia', label: 'Kia' },
          { value: 'volkswagen', label: 'Volkswagen' },
          { value: 'other', label: 'Other' }
        ]
      },
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        required: true,
        validation: { minLength: 1, maxLength: 50 }
      },
      {
        name: 'year',
        label: 'Year',
        type: 'number',
        required: true,
        validation: { min: 2000, max: new Date().getFullYear() + 1 }
      },
      {
        name: 'color',
        label: 'Color',
        type: 'select',
        required: true,
        options: [
          { value: 'white', label: 'White' },
          { value: 'black', label: 'Black' },
          { value: 'silver', label: 'Silver' },
          { value: 'gray', label: 'Gray' },
          { value: 'blue', label: 'Blue' },
          { value: 'red', label: 'Red' },
          { value: 'other', label: 'Other' }
        ]
      },
      {
        name: 'vin',
        label: 'VIN (Vehicle Identification Number)',
        type: 'text',
        required: true,
        validation: { minLength: 17, maxLength: 17 },
        helpText: '17-character unique identifier'
      },
      {
        name: 'seating_capacity',
        label: 'Seating Capacity',
        type: 'number',
        required: true,
        validation: { min: 2, max: 8 }
      },
      {
        name: 'fuel_type',
        label: 'Fuel Type',
        type: 'select',
        required: true,
        options: [
          { value: 'gasoline', label: 'Gasoline' },
          { value: 'diesel', label: 'Diesel' },
          { value: 'electric', label: 'Electric' },
          { value: 'hybrid', label: 'Hybrid' }
        ]
      },
      {
        name: 'transmission',
        label: 'Transmission',
        type: 'select',
        required: true,
        options: [
          { value: 'manual', label: 'Manual' },
          { value: 'automatic', label: 'Automatic' },
          { value: 'cvt', label: 'CVT' }
        ]
      },
      {
        name: 'doors',
        label: 'Number of Doors',
        type: 'select',
        required: true,
        options: [
          { value: '2', label: '2 Doors' },
          { value: '4', label: '4 Doors' },
          { value: '5', label: '5 Doors' }
        ]
      },
      {
        name: 'air_conditioning',
        label: 'Air Conditioning',
        type: 'boolean',
        required: true
      }
    ];
  }

  private getMotorcycleVehicleFields(): FormField[] {
    return [
      {
        name: 'plate_number',
        label: 'License Plate Number',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 15 }
      },
      {
        name: 'manufacturer',
        label: 'Manufacturer',
        type: 'select',
        required: true,
        options: [
          { value: 'honda', label: 'Honda' },
          { value: 'yamaha', label: 'Yamaha' },
          { value: 'suzuki', label: 'Suzuki' },
          { value: 'kawasaki', label: 'Kawasaki' },
          { value: 'bajaj', label: 'Bajaj' },
          { value: 'tvs', label: 'TVS' },
          { value: 'other', label: 'Other' }
        ]
      },
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        required: true,
        validation: { minLength: 1, maxLength: 50 }
      },
      {
        name: 'year',
        label: 'Year',
        type: 'number',
        required: true,
        validation: { min: 2000, max: new Date().getFullYear() + 1 }
      },
      {
        name: 'color',
        label: 'Color',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 30 }
      },
      {
        name: 'engine_capacity',
        label: 'Engine Capacity (CC)',
        type: 'number',
        required: true,
        validation: { min: 50, max: 2000 }
      },
      {
        name: 'engine_number',
        label: 'Engine Number',
        type: 'text',
        required: true,
        validation: { minLength: 5, maxLength: 20 }
      },
      {
        name: 'bike_type',
        label: 'Bike Type',
        type: 'select',
        required: true,
        options: [
          { value: 'scooter', label: 'Scooter' },
          { value: 'standard', label: 'Standard' },
          { value: 'sport', label: 'Sport' },
          { value: 'cruiser', label: 'Cruiser' },
          { value: 'touring', label: 'Touring' },
          { value: 'dirt', label: 'Dirt Bike' }
        ]
      },
      {
        name: 'fuel_type',
        label: 'Fuel Type',
        type: 'select',
        required: true,
        options: [
          { value: 'gasoline', label: 'Gasoline' },
          { value: 'electric', label: 'Electric' }
        ]
      },
      {
        name: 'has_storage_box',
        label: 'Has Storage Box',
        type: 'boolean',
        required: true
      }
    ];
  }

  private getBicycleVehicleFields(): FormField[] {
    return [
      {
        name: 'manufacturer',
        label: 'Manufacturer',
        type: 'text',
        required: true,
        validation: { minLength: 2, maxLength: 50 }
      },
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        required: true,
        validation: { minLength: 1, maxLength: 50 }
      },
      {
        name: 'year',
        label: 'Year',
        type: 'number',
        required: true,
        validation: { min: 2010, max: new Date().getFullYear() + 1 }
      },
      {
        name: 'color',
        label: 'Color',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 30 }
      },
      {
        name: 'frame_number',
        label: 'Frame Number',
        type: 'text',
        required: true,
        validation: { minLength: 5, maxLength: 30 }
      },
      {
        name: 'gear_system',
        label: 'Gear System',
        type: 'select',
        required: true,
        options: [
          { value: 'single_speed', label: 'Single Speed' },
          { value: 'multi_speed', label: 'Multi Speed' },
          { value: 'automatic', label: 'Automatic' }
        ]
      },
      {
        name: 'bike_type',
        label: 'Bike Type',
        type: 'select',
        required: true,
        options: [
          { value: 'mountain', label: 'Mountain Bike' },
          { value: 'road', label: 'Road Bike' },
          { value: 'hybrid', label: 'Hybrid' },
          { value: 'electric', label: 'Electric Bike' },
          { value: 'bmx', label: 'BMX' },
          { value: 'folding', label: 'Folding Bike' }
        ]
      },
      {
        name: 'is_electric',
        label: 'Is Electric Bike',
        type: 'boolean',
        required: true
      },
      {
        name: 'battery_capacity',
        label: 'Battery Capacity (Wh)',
        type: 'number',
        required: false,
        dependsOn: { field: 'is_electric', value: true },
        validation: { min: 100, max: 2000 }
      },
      {
        name: 'max_range',
        label: 'Maximum Range (km)',
        type: 'number',
        required: false,
        dependsOn: { field: 'is_electric', value: true },
        validation: { min: 10, max: 200 }
      },
      {
        name: 'has_basket',
        label: 'Has Basket',
        type: 'boolean',
        required: true
      },
      {
        name: 'has_cargo_rack',
        label: 'Has Cargo Rack',
        type: 'boolean',
        required: true
      }
    ];
  }

  private getTruckVehicleFields(): FormField[] {
    return [
      {
        name: 'plate_number',
        label: 'License Plate Number',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 15 }
      },
      {
        name: 'manufacturer',
        label: 'Manufacturer',
        type: 'select',
        required: true,
        options: [
          { value: 'ford', label: 'Ford' },
          { value: 'chevrolet', label: 'Chevrolet' },
          { value: 'isuzu', label: 'Isuzu' },
          { value: 'mitsubishi', label: 'Mitsubishi' },
          { value: 'mercedes', label: 'Mercedes-Benz' },
          { value: 'other', label: 'Other' }
        ]
      },
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        required: true,
        validation: { minLength: 1, maxLength: 50 }
      },
      {
        name: 'year',
        label: 'Year',
        type: 'number',
        required: true,
        validation: { min: 2000, max: new Date().getFullYear() + 1 }
      },
      {
        name: 'color',
        label: 'Color',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 30 }
      },
      {
        name: 'vin',
        label: 'VIN (Vehicle Identification Number)',
        type: 'text',
        required: true,
        validation: { minLength: 17, maxLength: 17 }
      },
      {
        name: 'load_capacity',
        label: 'Load Capacity (kg)',
        type: 'number',
        required: true,
        validation: { min: 500, max: 50000 }
      },
      {
        name: 'truck_type',
        label: 'Truck Type',
        type: 'select',
        required: true,
        options: [
          { value: 'pickup', label: 'Pickup Truck' },
          { value: 'van', label: 'Van' },
          { value: 'box_truck', label: 'Box Truck' },
          { value: 'flatbed', label: 'Flatbed' },
          { value: 'refrigerated', label: 'Refrigerated' }
        ]
      },
      {
        name: 'fuel_type',
        label: 'Fuel Type',
        type: 'select',
        required: true,
        options: [
          { value: 'gasoline', label: 'Gasoline' },
          { value: 'diesel', label: 'Diesel' }
        ]
      },
      {
        name: 'transmission',
        label: 'Transmission',
        type: 'select',
        required: true,
        options: [
          { value: 'manual', label: 'Manual' },
          { value: 'automatic', label: 'Automatic' }
        ]
      },
      {
        name: 'has_lift_gate',
        label: 'Has Lift Gate',
        type: 'boolean',
        required: true
      }
    ];
  }

  private getBusVehicleFields(): FormField[] {
    return [
      {
        name: 'plate_number',
        label: 'License Plate Number',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 15 }
      },
      {
        name: 'manufacturer',
        label: 'Manufacturer',
        type: 'select',
        required: true,
        options: [
          { value: 'mercedes', label: 'Mercedes-Benz' },
          { value: 'volvo', label: 'Volvo' },
          { value: 'scania', label: 'Scania' },
          { value: 'man', label: 'MAN' },
          { value: 'other', label: 'Other' }
        ]
      },
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        required: true,
        validation: { minLength: 1, maxLength: 50 }
      },
      {
        name: 'year',
        label: 'Year',
        type: 'number',
        required: true,
        validation: { min: 2000, max: new Date().getFullYear() + 1 }
      },
      {
        name: 'color',
        label: 'Color',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 30 }
      },
      {
        name: 'vin',
        label: 'VIN (Vehicle Identification Number)',
        type: 'text',
        required: true,
        validation: { minLength: 17, maxLength: 17 }
      },
      {
        name: 'seating_capacity',
        label: 'Seating Capacity',
        type: 'number',
        required: true,
        validation: { min: 15, max: 80 }
      },
      {
        name: 'fuel_type',
        label: 'Fuel Type',
        type: 'select',
        required: true,
        options: [
          { value: 'diesel', label: 'Diesel' },
          { value: 'electric', label: 'Electric' },
          { value: 'hybrid', label: 'Hybrid' }
        ]
      },
      {
        name: 'transmission',
        label: 'Transmission',
        type: 'select',
        required: true,
        options: [
          { value: 'manual', label: 'Manual' },
          { value: 'automatic', label: 'Automatic' }
        ]
      },
      {
        name: 'bus_type',
        label: 'Bus Type',
        type: 'select',
        required: true,
        options: [
          { value: 'standard', label: 'Standard Bus' },
          { value: 'articulated', label: 'Articulated Bus' }
        ]
      },
      {
        name: 'wheelchair_accessible',
        label: 'Wheelchair Accessible',
        type: 'boolean',
        required: true
      },
      {
        name: 'air_conditioning',
        label: 'Air Conditioning',
        type: 'boolean',
        required: true
      }
    ];
  }

  private getMinibusVehicleFields(): FormField[] {
    return [
      {
        name: 'plate_number',
        label: 'License Plate Number',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 15 }
      },
      {
        name: 'manufacturer',
        label: 'Manufacturer',
        type: 'select',
        required: true,
        options: [
          { value: 'toyota', label: 'Toyota' },
          { value: 'nissan', label: 'Nissan' },
          { value: 'ford', label: 'Ford' },
          { value: 'mercedes', label: 'Mercedes-Benz' },
          { value: 'other', label: 'Other' }
        ]
      },
      {
        name: 'model',
        label: 'Model',
        type: 'text',
        required: true,
        validation: { minLength: 1, maxLength: 50 }
      },
      {
        name: 'year',
        label: 'Year',
        type: 'number',
        required: true,
        validation: { min: 2000, max: new Date().getFullYear() + 1 }
      },
      {
        name: 'color',
        label: 'Color',
        type: 'text',
        required: true,
        validation: { minLength: 3, maxLength: 30 }
      },
      {
        name: 'vin',
        label: 'VIN (Vehicle Identification Number)',
        type: 'text',
        required: true,
        validation: { minLength: 17, maxLength: 17 }
      },
      {
        name: 'seating_capacity',
        label: 'Seating Capacity',
        type: 'number',
        required: true,
        validation: { min: 8, max: 20 }
      },
      {
        name: 'fuel_type',
        label: 'Fuel Type',
        type: 'select',
        required: true,
        options: [
          { value: 'gasoline', label: 'Gasoline' },
          { value: 'diesel', label: 'Diesel' },
          { value: 'electric', label: 'Electric' },
          { value: 'hybrid', label: 'Hybrid' }
        ]
      },
      {
        name: 'transmission',
        label: 'Transmission',
        type: 'select',
        required: true,
        options: [
          { value: 'manual', label: 'Manual' },
          { value: 'automatic', label: 'Automatic' }
        ]
      },
      {
        name: 'has_luggage_compartment',
        label: 'Has Luggage Compartment',
        type: 'boolean',
        required: true
      },
      {
        name: 'air_conditioning',
        label: 'Air Conditioning',
        type: 'boolean',
        required: true
      }
    ];
  }

  // Private validation methods for each vehicle type
  private validateCarData(data: CarVehicleData): ValidationResult {
    const errors: { field: string; message: string }[] = [];

    if (!data.vin || data.vin.length !== 17) {
      errors.push({ field: 'vin', message: 'VIN must be exactly 17 characters' });
    }
    if (!data.seating_capacity || data.seating_capacity < 2 || data.seating_capacity > 8) {
      errors.push({ field: 'seating_capacity', message: 'Seating capacity must be between 2 and 8' });
    }
    if (!data.fuel_type || !['gasoline', 'diesel', 'electric', 'hybrid'].includes(data.fuel_type)) {
      errors.push({ field: 'fuel_type', message: 'Invalid fuel type' });
    }
    if (!data.transmission || !['manual', 'automatic', 'cvt'].includes(data.transmission)) {
      errors.push({ field: 'transmission', message: 'Invalid transmission type' });
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateMotorcycleData(data: MotorcycleVehicleData): ValidationResult {
    const errors: { field: string; message: string }[] = [];

    if (!data.engine_capacity || data.engine_capacity < 50 || data.engine_capacity > 2000) {
      errors.push({ field: 'engine_capacity', message: 'Engine capacity must be between 50 and 2000 CC' });
    }
    if (!data.engine_number || data.engine_number.length < 5) {
      errors.push({ field: 'engine_number', message: 'Engine number must be at least 5 characters' });
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateBicycleData(data: BicycleVehicleData): ValidationResult {
    const errors: { field: string; message: string }[] = [];

    if (!data.frame_number || data.frame_number.length < 5) {
      errors.push({ field: 'frame_number', message: 'Frame number must be at least 5 characters' });
    }
    if (data.is_electric && (!data.battery_capacity || data.battery_capacity < 100)) {
      errors.push({ field: 'battery_capacity', message: 'Battery capacity is required for electric bikes' });
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateTruckData(data: TruckVehicleData): ValidationResult {
    const errors: { field: string; message: string }[] = [];

    if (!data.vin || data.vin.length !== 17) {
      errors.push({ field: 'vin', message: 'VIN must be exactly 17 characters' });
    }
    if (!data.load_capacity || data.load_capacity < 500) {
      errors.push({ field: 'load_capacity', message: 'Load capacity must be at least 500 kg' });
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateBusData(data: BusVehicleData): ValidationResult {
    const errors: { field: string; message: string }[] = [];

    if (!data.vin || data.vin.length !== 17) {
      errors.push({ field: 'vin', message: 'VIN must be exactly 17 characters' });
    }
    if (!data.seating_capacity || data.seating_capacity < 15) {
      errors.push({ field: 'seating_capacity', message: 'Bus seating capacity must be at least 15' });
    }

    return { isValid: errors.length === 0, errors };
  }

  private validateMinibusData(data: MinibusVehicleData): ValidationResult {
    const errors: { field: string; message: string }[] = [];

    if (!data.vin || data.vin.length !== 17) {
      errors.push({ field: 'vin', message: 'VIN must be exactly 17 characters' });
    }
    if (!data.seating_capacity || data.seating_capacity < 8 || data.seating_capacity > 20) {
      errors.push({ field: 'seating_capacity', message: 'Minibus seating capacity must be between 8 and 20' });
    }

    return { isValid: errors.length === 0, errors };
  }
}