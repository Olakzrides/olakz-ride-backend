// ============================================
// PHASE 1: SERVICE ARCHITECTURE TYPES
// ============================================

export interface ServiceType {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  isActive: boolean;
}

export interface VehicleServiceCapability {
  vehicleTypeId: string;
  serviceTypeId: string;
  isAvailable: boolean;
}

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

export interface ServiceValidationRequest {
  vehicleType: string;
  serviceTypes: string[];
}

export interface ServiceValidationResult {
  isValid: boolean;
  error?: string;
  allowedServices?: string[];
}

// ============================================
// LOCATION AND CART TYPES
// ============================================

// Location types
export interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

// Cart types
export interface CreateCartRequest {
  productId: string;
  salesChannelId: string;
  passengers?: number;
  searchRadius?: number;
  pickupPoint: Location;
}

export interface UpdateDropoffRequest {
  dropoffPoint: Location;
}

export interface AddLineItemRequest {
  variantId: string;
  quantity: number;
}

// Ride types
export interface RideRequestRequest {
  cartId: string;
  pickupLocation: Location;
  dropoffLocation: Location;
  vehicleVariantId: string;
  paymentMethod: {
    type: 'wallet';
    walletId?: string;
  };
  scheduledAt?: string;
  specialRequests?: string;
}

export interface RideStatus {
  id: string;
  status: 'searching' | 'driver_assigned' | 'driver_arriving' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled';
  estimatedFare: number;
  currency: string;
  estimatedDistance?: string;
  estimatedDuration?: string;
  pickupLocation: Location;
  dropoffLocation?: Location;
}

// Fare calculation types
export interface FareCalculation {
  totalFare: number;
  distance: number;
  duration: number;
  distanceText: string;
  durationText: string;
  fareBreakdown: {
    baseFare: number;
    distanceFare: number;
    timeFare: number;
    totalBeforeSurge: number;
  };
}

// Route information
export interface RouteInfo {
  distance: number; // km
  duration: number; // minutes
  distanceText: string;
  durationText: string;
  polyline?: string;
}

// Variant with calculated price
export interface VariantWithPrice {
  id: string;
  title: string;
  sku: string;
  product_id: string;
  calculated_price: {
    calculated_amount: number; // in cents
    currency_code: string;
  };
  metadata?: {
    distance_km?: number;
    duration_minutes?: number;
    fare_breakdown?: {
      base_fare: number;
      distance_fare: number;
      time_fare: number;
      minimum_fare: number;
    };
    estimatedWaitTime?: string;
    description?: string;
  };
}

// Payment types
export interface PaymentHoldResult {
  status: 'hold_created' | 'insufficient_funds' | 'failed';
  holdId?: string;
  message: string;
  availableBalance?: number;
}

export interface PaymentProcessResult {
  success: boolean;
  paymentId?: string;
  refundAmount?: number;
  message: string;
}

// Express Request with user
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// PHASE 2: DRIVER TYPES
// ============================================

export interface DriverRegistrationRequest {
  identificationType: 'drivers_license' | 'national_id' | 'passport';
  identificationNumber: string;
  licenseNumber?: string; // Optional for bicycle/e-scooter
  vehicleTypeId: string;
  vehicle: {
    plateNumber: string;
    manufacturer: string;
    model: string;
    year: number;
    color: string;
  };
}

export interface DriverProfileUpdateRequest {
  identificationType?: 'drivers_license' | 'national_id' | 'passport';
  identificationNumber?: string;
  licenseNumber?: string;
  vehicleTypeId?: string;
}

export interface DriverVehicleRequest {
  vehicleTypeId: string;
  plateNumber: string;
  manufacturer: string;
  model: string;
  year: number;
  color: string;
}

export interface DriverDocumentMetadata {
  documentType: 'license' | 'insurance' | 'vehicle_registration' | 'profile_photo' | 'vehicle_photo';
  fileName: string;
  fileSize: number;
  mimeType: string;
  expiryDate?: string;
}

export interface DriverStatusUpdateRequest {
  isOnline: boolean;
  isAvailable?: boolean;
}

export interface DriverLocationUpdateRequest {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
}

export interface DriverApprovalRequest {
  status: 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface DocumentVerificationRequest {
  status: 'approved' | 'rejected';
  notes?: string;
}

export interface NearbyDriversQuery {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  vehicleTypeId?: string;
  limit?: number;
}

export interface DriverWithDetails {
  id: string;
  userId: string;
  licenseNumber: string;
  vehicleType: {
    id: string;
    name: string;
  };
  status: string;
  rating: number;
  totalRides: number;
  totalEarnings: number;
  vehicles: any[];
  documents: any[];
  availability?: {
    isOnline: boolean;
    isAvailable: boolean;
    lastSeenAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}
