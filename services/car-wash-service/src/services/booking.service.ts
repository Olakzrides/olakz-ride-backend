import { supabase } from '../config/database';
import { config } from '../config/env';
import { logger } from '../config/logger';
import {
  CarWashBooking,
  CreateBookingDto,
  PaginatedResult,
  PaymentMethod,
} from '../types';

export class BookingService {
  /**
   * Create a new wash booking (Book Now or Scheduled).
   */
  async createBooking(customerId: string, dto: CreateBookingDto): Promise<CarWashBooking> {
    // Validate vendor exists and is approved
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('id, status')
      .eq('id', dto.vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.status !== 'approved') throw new Error('This vendor is not currently available');

    // Validate service belongs to vendor and is active
    const { data: service } = await supabase
      .from('car_wash_services')
      .select('id, price, duration_minutes, name')
      .eq('id', dto.serviceId)
      .eq('vendor_id', dto.vendorId)
      .eq('is_active', true)
      .single();

    if (!service) throw new Error('Service not found or unavailable');

    // For scheduled bookings validate slot
    if (dto.bookingType === 'scheduled') {
      if (!dto.scheduledAt) throw new Error('scheduledAt is required for scheduled bookings');

      const scheduledDate = new Date(dto.scheduledAt);
      const now = new Date();
      if (scheduledDate <= now) throw new Error('Scheduled time must be in the future');

      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + config.booking.maxScheduledDaysAhead);
      if (scheduledDate > maxDate) {
        throw new Error(`Cannot schedule more than ${config.booking.maxScheduledDaysAhead} days ahead`);
      }

      // Check slot conflict
      const slotStart = scheduledDate.toISOString();
      const slotEnd = new Date(scheduledDate.getTime() + service.duration_minutes * 60000).toISOString();

      const { data: conflict } = await supabase
        .from('car_wash_bookings')
        .select('id')
        .eq('vendor_id', dto.vendorId)
        .in('status', ['pending', 'confirmed', 'in_progress'])
        .gte('scheduled_at', slotStart)
        .lt('scheduled_at', slotEnd)
        .limit(1);

      if (conflict && conflict.length > 0) {
        throw new Error('This time slot is no longer available. Please choose another slot.');
      }
    }

    const { data, error } = await supabase
      .from('car_wash_bookings')
      .insert({
        customer_id: customerId,
        vendor_id: dto.vendorId,
        service_id: dto.serviceId,
        booking_type: dto.bookingType,
        status: 'pending',
        scheduled_at: dto.scheduledAt ?? null,
        service_address: dto.serviceAddress,
        service_latitude: dto.serviceLatitude,
        service_longitude: dto.serviceLongitude,
        vehicle_description: dto.vehicleDescription ?? null,
        vehicle_photo_urls: [],
        notes: dto.notes ?? null,
        total_amount: parseFloat(service.price),
        payment_method: dto.paymentMethod,
        payment_status: 'pending',
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Create booking error:', error);
      throw new Error(`Failed to create booking: ${error.message}`);
    }

    logger.info('Booking created', { bookingId: data.id, customerId, vendorId: dto.vendorId });
    return this.mapRow(data);
  }

  /**
   * Attach vehicle photos to an existing booking (before confirmation).
   */
  async attachVehiclePhotos(
    bookingId: string,
    customerId: string,
    photoUrls: string[]
  ): Promise<CarWashBooking> {
    const { data: booking } = await supabase
      .from('car_wash_bookings')
      .select('id, customer_id, status, vehicle_photo_urls')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');
    if (booking.customer_id !== customerId) throw new Error('Unauthorised');
    if (booking.status !== 'pending') throw new Error('Cannot update photos after booking is confirmed');

    const existing: string[] = booking.vehicle_photo_urls ?? [];
    const combined = [...existing, ...photoUrls].slice(0, config.booking.maxVehiclePhotos);

    const { data, error } = await supabase
      .from('car_wash_bookings')
      .update({ vehicle_photo_urls: combined, updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Photo update failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Get a single booking by ID.
   * Includes full customer details (name, phone, avatar) and service info.
   */
  async getBookingById(bookingId: string, requesterId: string): Promise<CarWashBooking & { vendor: any; service: any; customer: any }> {
    const { data, error } = await supabase
      .from('car_wash_bookings')
      .select('*, car_wash_vendors(id, business_name, phone, address), car_wash_services(id, name, category, duration_minutes, price)')
      .eq('id', bookingId)
      .single();

    if (error || !data) throw new Error('Booking not found');

    // Only customer or vendor owner can view
    const isCustomer = data.customer_id === requesterId;
    const { data: vendorRow } = await supabase
      .from('car_wash_vendors')
      .select('user_id')
      .eq('id', data.vendor_id)
      .single();
    const isVendorOwner = vendorRow?.user_id === requesterId;

    if (!isCustomer && !isVendorOwner) throw new Error('Unauthorised');

    // Fetch customer details
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, phone, avatar_url')
      .eq('id', data.customer_id)
      .single();

    const customer = user ? {
      id:        (user as any).id,
      name:      `${(user as any).first_name ?? ''} ${(user as any).last_name ?? ''}`.trim() || 'Customer',
      phone:     (user as any).phone ?? null,
      avatarUrl: (user as any).avatar_url ?? null,
    } : { id: data.customer_id, name: 'Customer', phone: null, avatarUrl: null };

    return {
      ...this.mapRow(data),
      vendor:   data.car_wash_vendors,
      service:  data.car_wash_services,
      customer,
    };
  }

  /**
   * List bookings for the authenticated customer.
   */
  async getCustomerBookings(
    customerId: string,
    page = 1,
    limit = 20
  ): Promise<PaginatedResult<CarWashBooking & { vendor: any; service: any }>> {
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('car_wash_bookings')
      .select(
        '*, car_wash_vendors(id, business_name, cover_image_url, rating), car_wash_services(id, name, category)',
        { count: 'exact' }
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch bookings: ${error.message}`);

    return {
      data: (data ?? []).map((row: any) => ({
        ...this.mapRow(row),
        vendor: row.car_wash_vendors,
        service: row.car_wash_services,
      })),
      pagination: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * List bookings for a vendor (vendor owner only).
   * Includes customer name, phone, and avatar for each booking.
   */
  async getVendorBookings(
    vendorId: string,
    userId: string,
    page = 1,
    limit = 20,
    status?: string
  ): Promise<PaginatedResult<CarWashBooking & { service: any; customer: any }>> {
    // Verify ownership
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('user_id')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.user_id !== userId) throw new Error('Unauthorised');

    const offset = (page - 1) * limit;

    let query = supabase
      .from('car_wash_bookings')
      .select('*, car_wash_services(id, name, category, duration_minutes)', { count: 'exact' })
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch bookings: ${error.message}`);

    const rows = data ?? [];

    // Batch-fetch customer details from users table
    const customerIds = [...new Set(rows.map((r: any) => r.customer_id).filter(Boolean))];
    const customerMap = new Map<string, { name: string; phone: string | null; avatarUrl: string | null }>();

    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone, avatar_url')
        .in('id', customerIds);

      for (const u of users ?? []) {
        const user = u as any;
        customerMap.set(user.id, {
          name:      `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
          phone:     user.phone ?? null,
          avatarUrl: user.avatar_url ?? null,
        });
      }
    }

    return {
      data: rows.map((row: any) => ({
        ...this.mapRow(row),
        service: row.car_wash_services,
        customer: customerMap.get(row.customer_id) ?? {
          name:      'Customer',
          phone:     null,
          avatarUrl: null,
        },
      })),
      pagination: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Vendor confirms a pending booking.
   */
  async confirmBooking(bookingId: string, vendorUserId: string): Promise<CarWashBooking> {
    return this.vendorUpdateBookingStatus(bookingId, vendorUserId, 'confirmed');
  }

  /**
   * Vendor marks booking as in_progress (service started).
   */
  async startBooking(bookingId: string, vendorUserId: string): Promise<CarWashBooking> {
    return this.vendorUpdateBookingStatus(bookingId, vendorUserId, 'in_progress', {
      started_at: new Date().toISOString(),
    });
  }

  /**
   * Vendor marks booking as completed.
   */
  async completeBooking(bookingId: string, vendorUserId: string): Promise<CarWashBooking> {
    return this.vendorUpdateBookingStatus(bookingId, vendorUserId, 'completed', {
      completed_at: new Date().toISOString(),
      payment_status: 'paid',
    });
  }

  /**
   * Customer cancels a booking (within cancellation window).
   */
  async cancelBookingByCustomer(
    bookingId: string,
    customerId: string,
    reason: string
  ): Promise<CarWashBooking> {
    const { data: booking } = await supabase
      .from('car_wash_bookings')
      .select('id, customer_id, status, scheduled_at, booking_type')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');
    if (booking.customer_id !== customerId) throw new Error('Unauthorised');
    if (['completed', 'cancelled'].includes(booking.status)) {
      throw new Error(`Cannot cancel a ${booking.status} booking`);
    }

    // Enforce cancellation window for scheduled bookings
    if (booking.booking_type === 'scheduled' && booking.scheduled_at) {
      const hoursUntil = (new Date(booking.scheduled_at).getTime() - Date.now()) / 3600000;
      if (hoursUntil < config.booking.cancellationWindowHours) {
        throw new Error(
          `Bookings can only be cancelled at least ${config.booking.cancellationWindowHours} hours before the scheduled time`
        );
      }
    }

    const { data, error } = await supabase
      .from('car_wash_bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Cancel failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Customer submits a rating after completion.
   */
  async rateBooking(
    bookingId: string,
    customerId: string,
    rating: number,
    feedback?: string
  ): Promise<CarWashBooking> {
    const { data: booking } = await supabase
      .from('car_wash_bookings')
      .select('id, customer_id, status, vendor_id, customer_rating')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');
    if (booking.customer_id !== customerId) throw new Error('Unauthorised');
    if (booking.status !== 'completed') throw new Error('Can only rate completed bookings');
    if (booking.customer_rating !== null) throw new Error('You have already rated this booking');

    const { data, error } = await supabase
      .from('car_wash_bookings')
      .update({
        customer_rating: rating,
        customer_feedback: feedback ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Rating failed: ${error.message}`);

    // Update vendor aggregate rating
    await this.recalculateVendorRating(booking.vendor_id);

    return this.mapRow(data);
  }

  // ─── Private helpers ───────────────────────────────────────

  private async vendorUpdateBookingStatus(
    bookingId: string,
    vendorUserId: string,
    newStatus: string,
    extra: Record<string, any> = {}
  ): Promise<CarWashBooking> {
    const { data: booking } = await supabase
      .from('car_wash_bookings')
      .select('id, vendor_id, status')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');

    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('user_id')
      .eq('id', booking.vendor_id)
      .single();

    if (!vendor || vendor.user_id !== vendorUserId) throw new Error('Unauthorised');

    const { data, error } = await supabase
      .from('car_wash_bookings')
      .update({ status: newStatus, updated_at: new Date().toISOString(), ...extra })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Status update failed: ${error.message}`);
    return this.mapRow(data);
  }

  private async recalculateVendorRating(vendorId: string): Promise<void> {
    const { data } = await supabase
      .from('car_wash_bookings')
      .select('customer_rating')
      .eq('vendor_id', vendorId)
      .not('customer_rating', 'is', null);

    if (!data || data.length === 0) return;

    const avg = data.reduce((sum: number, b: any) => sum + (b.customer_rating ?? 0), 0) / data.length;
    const totalCustomers = data.length;

    await supabase
      .from('car_wash_vendors')
      .update({
        rating: parseFloat(avg.toFixed(2)),
        total_customers: totalCustomers,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId);
  }

  private mapRow(row: any): CarWashBooking {
    return {
      id: row.id,
      customerId: row.customer_id,
      vendorId: row.vendor_id,
      serviceId: row.service_id,
      bookingType: row.booking_type,
      status: row.status,
      scheduledAt: row.scheduled_at,
      serviceAddress: row.service_address,
      serviceLatitude: parseFloat(row.service_latitude),
      serviceLongitude: parseFloat(row.service_longitude),
      vehicleDescription: row.vehicle_description,
      vehiclePhotoUrls: row.vehicle_photo_urls ?? [],
      notes: row.notes,
      totalAmount: parseFloat(row.total_amount),
      paymentMethod: row.payment_method as PaymentMethod,
      paymentStatus: row.payment_status,
      cancellationReason: row.cancellation_reason,
      cancelledAt: row.cancelled_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      customerRating: row.customer_rating,
      customerFeedback: row.customer_feedback,
      vendorRating: row.vendor_rating,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
