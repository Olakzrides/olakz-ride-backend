/**
 * Delivery Models
 * Type definitions for delivery-related data structures
 */

export interface Delivery {
  id: string;
  order_number: string;
  customer_id: string;
  courier_id?: string;
  recipient_name: string;
  recipient_phone: string;
  pickup_latitude: string;
  pickup_longitude: string;
  pickup_address: string;
  dropoff_latitude: string;
  dropoff_longitude: string;
  dropoff_address: string;
  package_description?: string;
  package_photo_url?: string;
  pickup_photo_url?: string;
  delivery_photo_url?: string;
  vehicle_type_id: string;
  delivery_type: 'instant' | 'scheduled';
  scheduled_pickup_at?: string;
  pickup_code: string;
  delivery_code: string;
  estimated_fare: string;
  final_fare?: string;
  currency_code: string;
  distance_km: number;
  payment_method: 'cash' | 'wallet' | 'card';
  payment_status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  region_id: string;
  service_channel_id: string;
  status: DeliveryStatus;
  created_at: string;
  updated_at: string;
  assigned_at?: string;
  searching_at?: string;
  courier_arrived_pickup_at?: string;
  picked_up_at?: string;
  courier_arrived_delivery_at?: string;
  delivered_at?: string;
  cancelled_at?: string;
}

export type DeliveryStatus =
  | 'pending'
  | 'searching'
  | 'assigned'
  | 'arrived_pickup'
  | 'picked_up'
  | 'in_transit'
  | 'arrived_delivery'
  | 'delivered'
  | 'cancelled';

export interface DeliveryStatusHistory {
  id: string;
  delivery_id: string;
  status: DeliveryStatus;
  location_latitude?: string;
  location_longitude?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

export interface DeliveryFareConfig {
  id: string;
  vehicle_type_id: string;
  region_id: string;
  base_fare: string;
  per_km_rate: string;
  minimum_fare: string;
  scheduled_delivery_surcharge_percent: number;
  currency_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeliveryWithRelations extends Delivery {
  vehicle_type?: {
    id: string;
    name: string;
    display_name: string;
    icon_url?: string;
  };
  courier?: {
    id: string;
    user_id: string;
    license_number: string;
    rating: number;
    total_deliveries: number;
    delivery_rating?: number;
  };
  region?: {
    id: string;
    name: string;
    currency_code: string;
  };
}

export interface CreateDeliveryParams {
  customerId: string;
  recipientName: string;
  recipientPhone: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  dropoffAddress: string;
  packageDescription?: string;
  packagePhotoUrl?: string;
  vehicleTypeId: string;
  deliveryType: 'instant' | 'scheduled';
  scheduledPickupAt?: string;
  paymentMethod: 'cash' | 'wallet' | 'card';
  regionId: string;
  serviceChannelId?: string;
}

export interface UpdateDeliveryStatusParams {
  deliveryId: string;
  status: DeliveryStatus;
  location?: {
    latitude: number;
    longitude: number;
  };
  notes?: string;
  updatedBy?: string;
}

export interface DeliveryFareCalculation {
  baseFare: number;
  distanceFare: number;
  scheduledSurcharge: number;
  totalBeforeSurge: number;
  finalFare: number;
  distance: number;
  currencyCode: string;
  breakdown: {
    base_fare: number;
    distance_fare: number;
    scheduled_surcharge: number;
    minimum_fare: number;
  };
}

export interface DeliveryQueryOptions {
  limit?: number;
  offset?: number;
  status?: DeliveryStatus;
}

export interface AvailableDeliveriesQuery {
  vehicleTypeId?: string;
  regionId?: string;
  limit?: number;
}

// State machine for delivery status transitions
export const DELIVERY_STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ['searching', 'cancelled'],
  searching: ['assigned', 'cancelled'],
  assigned: ['arrived_pickup', 'cancelled'],
  arrived_pickup: ['picked_up', 'cancelled'],
  picked_up: ['in_transit'],
  in_transit: ['arrived_delivery'],
  arrived_delivery: ['delivered'],
  delivered: [],
  cancelled: [],
};

// Helper function to check if status transition is valid
export function isValidStatusTransition(
  currentStatus: DeliveryStatus,
  newStatus: DeliveryStatus
): boolean {
  return DELIVERY_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
}

// Expected actions for each status
export const DELIVERY_EXPECTED_ACTIONS: Record<DeliveryStatus, string> = {
  pending: 'Waiting for system to start courier search',
  searching: 'Searching for available courier',
  assigned: 'Courier is on the way to pickup location',
  arrived_pickup: 'Courier has arrived at pickup location. Verify pickup code.',
  picked_up: 'Package picked up. Courier is heading to delivery location.',
  in_transit: 'Package is in transit to delivery location',
  arrived_delivery: 'Courier has arrived at delivery location. Verify delivery code.',
  delivered: 'Delivery completed',
  cancelled: 'Delivery cancelled',
};
