// ─────────────────────────────────────────────────────────────
// Common
// ─────────────────────────────────────────────────────────────

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// ─────────────────────────────────────────────────────────────
// Car Wash Vendor
// ─────────────────────────────────────────────────────────────

export type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'inactive';

export interface CarWashVendor {
  id: string;
  userId: string;
  businessName: string;
  description: string | null;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  coverImageUrl: string | null;
  logoUrl: string | null;
  status: VendorStatus;
  rating: number;
  totalCustomers: number;
  totalHoursServed: number;
  operatingHours: OperatingHours;
  isOpenNow?: boolean;
  distanceKm?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperatingDay {
  open: string;   // e.g. "08:00"
  close: string;  // e.g. "19:00"
  closed: boolean;
}

export interface OperatingHours {
  monday: OperatingDay;
  tuesday: OperatingDay;
  wednesday: OperatingDay;
  thursday: OperatingDay;
  friday: OperatingDay;
  saturday: OperatingDay;
  sunday: OperatingDay;
}

// ─────────────────────────────────────────────────────────────
// Car Wash Service / Package
// ─────────────────────────────────────────────────────────────

export type WashCategory =
  | 'exterior_wash'
  | 'interior_wash'
  | 'engine_wash'
  | 'full_car_wash'
  | 'car_vacuuming'
  | 'wax_and_polish';

export interface CarWashService {
  id: string;
  vendorId: string;
  name: string;
  description: string | null;
  category: WashCategory | null;
  customCategoryId: string | null;
  durationMinutes: number;
  price: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// Car Wash Booking
// ─────────────────────────────────────────────────────────────

export type BookingType = 'book_now' | 'scheduled';
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';
export type PaymentMethod = 'wallet' | 'card' | 'cash';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface CarWashBooking {
  id: string;
  customerId: string;
  vendorId: string;
  serviceId: string;
  bookingType: BookingType;
  status: BookingStatus;
  scheduledAt: string | null;
  serviceAddress: string;
  serviceLatitude: number;
  serviceLongitude: number;
  vehicleDescription: string | null;
  vehiclePhotoUrls: string[];
  notes: string | null;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cancellationReason: string | null;
  cancelledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  customerRating: number | null;
  customerFeedback: string | null;
  vendorRating: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────
// Availability Slots
// ─────────────────────────────────────────────────────────────

export interface TimeSlot {
  time: string;        // "HH:MM" 24-hour
  displayTime: string; // "12:30 PM"
  available: boolean;
}

export interface DayAvailability {
  date: string;        // "YYYY-MM-DD"
  displayDate: string; // "Friday, August 14"
  slots: TimeSlot[];
}

// ─────────────────────────────────────────────────────────────
// Review / Rating
// ─────────────────────────────────────────────────────────────

export interface CarWashReview {
  id: string;
  bookingId: string;
  customerId: string;
  vendorId: string;
  rating: number;
  comment: string | null;
  customerName: string;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// Vendor DTOs
// ─────────────────────────────────────────────────────────────

export interface CreateVendorDto {
  businessName: string;
  description?: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  operatingHours?: Partial<OperatingHours>;
}

export interface UpdateVendorDto {
  businessName?: string;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  operatingHours?: Partial<OperatingHours>;
}

// ─────────────────────────────────────────────────────────────
// Service / Package DTOs
// ─────────────────────────────────────────────────────────────

export interface CreateCarWashServiceDto {
  name: string;
  description?: string;
  category?: WashCategory;
  customCategoryId?: string | null;
  durationMinutes: number;
  price: number;
}

export interface UpdateCarWashServiceDto {
  name?: string;
  description?: string;
  category?: WashCategory;
  customCategoryId?: string | null;
  durationMinutes?: number;
  price?: number;
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Booking DTOs
// ─────────────────────────────────────────────────────────────

export interface CreateBookingDto {
  vendorId: string;
  serviceId: string;
  bookingType: BookingType;
  scheduledAt?: string;  // ISO date string, required when bookingType = 'scheduled'
  serviceAddress: string;
  serviceLatitude: number;
  serviceLongitude: number;
  vehicleDescription?: string;
  notes?: string;
  paymentMethod: PaymentMethod;
}

export interface UpdateBookingStatusDto {
  status: BookingStatus;
  cancellationReason?: string;
}

// ─────────────────────────────────────────────────────────────
// Search / Discovery
// ─────────────────────────────────────────────────────────────

export interface SearchVendorsQuery extends PaginationQuery {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  category?: WashCategory;
  query?: string;
}

export type SortVendorsBy = 'distance' | 'rating' | 'newest';
