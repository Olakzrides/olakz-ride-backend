import { supabase } from '../config/database';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { AutoMechNotificationService } from './auto-mech-notification.service';
import {
  AutoMechBooking,
  CreateBookingDto,
  PaginatedResult,
  PaymentMethod,
} from '../types';

export class BookingService {
  /**
   * Create a new mechanic booking (Book Now or Scheduled).
   */
  async createBooking(customerId: string, dto: CreateBookingDto): Promise<AutoMechBooking> {
    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('id, status')
      .eq('id', dto.vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.status !== 'approved') throw new Error('This vendor is not currently available');

    const { data: service } = await supabase
      .from('auto_mech_services')
      .select('id, price, price_min, price_max, duration_minutes, name')
      .eq('id', dto.serviceId)
      .eq('vendor_id', dto.vendorId)
      .eq('is_active', true)
      .single();

    if (!service) throw new Error('Service not found or unavailable');

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

      const slotStart = scheduledDate.toISOString();
      const slotEnd   = new Date(scheduledDate.getTime() + service.duration_minutes * 60000).toISOString();

      const { data: conflict } = await supabase
        .from('auto_mech_bookings')
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

    // Build the human-readable duration display (e.g. "60-180 minutes")
    // For range pricing services the duration is fixed; we just show the minutes.
    const durationDisplay = `${service.duration_minutes} minutes`;

    // Snapshot the cost estimate at booking time so the confirm screen is
    // always accurate even if the service price changes later.
    const estimatedCostMin = parseFloat(service.price_min ?? service.price);
    const estimatedCostMax = service.price_max ? parseFloat(service.price_max) : null;

    const { data, error } = await supabase
      .from('auto_mech_bookings')
      .insert({
        customer_id:          customerId,
        vendor_id:            dto.vendorId,
        service_id:           dto.serviceId,
        booking_type:         dto.bookingType,
        status:               'pending',
        scheduled_at:         dto.scheduledAt ?? null,
        service_address:      dto.serviceAddress,
        service_latitude:     dto.serviceLatitude,
        service_longitude:    dto.serviceLongitude,
        // structured vehicle fields
        vehicle_make:         dto.vehicleMake         ?? null,
        vehicle_model:        dto.vehicleModel        ?? null,
        vehicle_year:         dto.vehicleYear         ?? null,
        vehicle_plate_number: dto.vehiclePlateNumber  ?? null,
        vehicle_description:  dto.vehicleDescription  ?? null,
        vehicle_photo_urls:   [],
        notes:                dto.notes               ?? null,
        total_amount:         estimatedCostMin,
        estimated_cost_min:   estimatedCostMin,
        estimated_cost_max:   estimatedCostMax,
        duration_display:     durationDisplay,
        payment_method:       dto.paymentMethod,
        payment_status:       'pending',
      })
      .select('*')
      .single();

    if (error) {
      logger.error('Create booking error:', error);
      throw new Error(`Failed to create booking: ${error.message}`);
    }

    logger.info('Booking created', { bookingId: data.id, customerId, vendorId: dto.vendorId });

    // Notify vendor of new booking (non-blocking)
    const { data: notifyService } = await supabase
      .from('auto_mech_services').select('name').eq('id', dto.serviceId).single();
    const { data: notifyVendor } = await supabase
      .from('auto_mech_vendors').select('business_name').eq('id', dto.vendorId).single();

    AutoMechNotificationService.notifyNewBooking({
      bookingId:   data.id,
      customerId,
      vendorId:    dto.vendorId,
      bookingType: dto.bookingType,
      serviceName: (notifyService as any)?.name         ?? 'Mech Service',
      vendorName:  (notifyVendor  as any)?.business_name ?? 'Auto Mech',
      scheduledAt: dto.scheduledAt ?? null,
    }).catch(() => {});

    return this.mapRow(data);
  }

  /**
   * Attach vehicle photos to an existing booking (before confirmation).
   */
  async attachVehiclePhotos(
    bookingId: string,
    customerId: string,
    photoUrls: string[]
  ): Promise<AutoMechBooking> {
    const { data: booking } = await supabase
      .from('auto_mech_bookings')
      .select('id, customer_id, status, vehicle_photo_urls')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');
    if (booking.customer_id !== customerId) throw new Error('Unauthorised');
    if (booking.status !== 'pending') throw new Error('Cannot update photos after booking is confirmed');

    const existing: string[] = booking.vehicle_photo_urls ?? [];
    const combined = [...existing, ...photoUrls].slice(0, config.booking.maxVehiclePhotos);

    const { data, error } = await supabase
      .from('auto_mech_bookings')
      .update({ vehicle_photo_urls: combined, updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Photo update failed: ${error.message}`);
    return this.mapRow(data);
  }

  /**
   * Get a single booking by ID.
   */
  async getBookingById(bookingId: string, requesterId: string): Promise<AutoMechBooking & { vendor: any; service: any; customer: any }> {
    const { data, error } = await supabase
      .from('auto_mech_bookings')
      .select('*, auto_mech_vendors(id, business_name, phone, address), auto_mech_services(id, name, category, duration_minutes, price, price_min, price_max)')
      .eq('id', bookingId)
      .single();

    if (error || !data) throw new Error('Booking not found');

    const isCustomer = data.customer_id === requesterId;
    const { data: vendorRow } = await supabase
      .from('auto_mech_vendors')
      .select('user_id')
      .eq('id', data.vendor_id)
      .single();
    const isVendorOwner = vendorRow?.user_id === requesterId;

    if (!isCustomer && !isVendorOwner) throw new Error('Unauthorised');

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
      vendor:   data.auto_mech_vendors,
      service:  data.auto_mech_services,
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
  ): Promise<PaginatedResult<AutoMechBooking & { vendor: any; service: any }>> {
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('auto_mech_bookings')
      .select(
        '*, auto_mech_vendors(id, business_name, phone, address, cover_image_url, logo_url, rating), auto_mech_services(id, name, category)',
        { count: 'exact' }
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch bookings: ${error.message}`);

    return {
      data: (data ?? []).map((row: any) => ({
        ...this.mapRow(row),
        vendor:  row.auto_mech_vendors,
        service: row.auto_mech_services,
      })),
      pagination: {
        total:      count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * List bookings for a vendor (vendor owner only).
   */
  async getVendorBookings(
    vendorId: string,
    userId: string,
    page = 1,
    limit = 20,
    status?: string
  ): Promise<PaginatedResult<AutoMechBooking & { service: any; customer: any }>> {
    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('user_id')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Vendor not found');
    if (vendor.user_id !== userId) throw new Error('Unauthorised');

    const offset = (page - 1) * limit;

    let query = supabase
      .from('auto_mech_bookings')
      .select('*, auto_mech_services(id, name, category, duration_minutes)', { count: 'exact' })
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to fetch bookings: ${error.message}`);

    const rows = data ?? [];

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
        service:  row.auto_mech_services,
        customer: customerMap.get(row.customer_id) ?? { name: 'Customer', phone: null, avatarUrl: null },
      })),
      pagination: {
        total:      count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Vendor declines a pending booking.
   */
  async declineBooking(bookingId: string, vendorUserId: string, reason: string): Promise<AutoMechBooking> {
    const { data: booking } = await supabase
      .from('auto_mech_bookings')
      .select('id, customer_id, vendor_id, status')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');
    if (!['pending', 'confirmed'].includes(booking.status)) {
      throw new Error(`Cannot decline a booking with status: ${booking.status}`);
    }

    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('user_id')
      .eq('id', booking.vendor_id)
      .single();

    if (!vendor || vendor.user_id !== vendorUserId) throw new Error('Unauthorised');

    const { data, error } = await supabase
      .from('auto_mech_bookings')
      .update({
        status:              'cancelled',
        cancellation_reason: reason,
        cancelled_at:        new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Decline failed: ${error.message}`);

    AutoMechNotificationService.notifyBookingStatusChanged({
      bookingId,
      customerId: booking.customer_id,
      vendorId:   booking.vendor_id,
      status:     'cancelled',
    }).catch(() => {});

    return this.mapRow(data);
  }

  async confirmBooking(bookingId: string, vendorUserId: string): Promise<AutoMechBooking> {
    return this.vendorUpdateBookingStatus(bookingId, vendorUserId, 'confirmed');
  }

  async startBooking(bookingId: string, vendorUserId: string): Promise<AutoMechBooking> {
    return this.vendorUpdateBookingStatus(bookingId, vendorUserId, 'in_progress', {
      started_at: new Date().toISOString(),
    });
  }

  async completeBooking(bookingId: string, vendorUserId: string): Promise<AutoMechBooking> {
    return this.vendorUpdateBookingStatus(bookingId, vendorUserId, 'completed', {
      completed_at:   new Date().toISOString(),
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
  ): Promise<AutoMechBooking> {
    const { data: booking } = await supabase
      .from('auto_mech_bookings')
      .select('id, customer_id, vendor_id, status, scheduled_at, booking_type')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');
    if (booking.customer_id !== customerId) throw new Error('Unauthorised');
    if (['completed', 'cancelled'].includes(booking.status)) {
      throw new Error(`Cannot cancel a ${booking.status} booking`);
    }

    if (booking.booking_type === 'scheduled' && booking.scheduled_at) {
      const hoursUntil = (new Date(booking.scheduled_at).getTime() - Date.now()) / 3600000;
      if (hoursUntil < config.booking.cancellationWindowHours) {
        throw new Error(
          `Bookings can only be cancelled at least ${config.booking.cancellationWindowHours} hours before the scheduled time`
        );
      }
    }

    const { data, error } = await supabase
      .from('auto_mech_bookings')
      .update({
        status:              'cancelled',
        cancellation_reason: reason,
        cancelled_at:        new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Cancel failed: ${error.message}`);

    AutoMechNotificationService.notifyBookingStatusChanged({
      bookingId,
      customerId,
      vendorId: booking.vendor_id,
      status:   'cancelled',
    }).catch(() => {});

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
  ): Promise<AutoMechBooking> {
    const { data: booking } = await supabase
      .from('auto_mech_bookings')
      .select('id, customer_id, status, vendor_id, customer_rating')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');
    if (booking.customer_id !== customerId) throw new Error('Unauthorised');
    if (booking.status !== 'completed') throw new Error('Can only rate completed bookings');
    if (booking.customer_rating !== null) throw new Error('You have already rated this booking');

    const { data, error } = await supabase
      .from('auto_mech_bookings')
      .update({
        customer_rating:   rating,
        customer_feedback: feedback ?? null,
        updated_at:        new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Rating failed: ${error.message}`);

    await this.recalculateVendorRating(booking.vendor_id);

    return this.mapRow(data);
  }

  // ─── Private helpers ───────────────────────────────────────

  private async vendorUpdateBookingStatus(
    bookingId: string,
    vendorUserId: string,
    newStatus: string,
    extra: Record<string, any> = {}
  ): Promise<AutoMechBooking> {
    const { data: booking } = await supabase
      .from('auto_mech_bookings')
      .select('id, customer_id, vendor_id, status')
      .eq('id', bookingId)
      .single();

    if (!booking) throw new Error('Booking not found');

    const { data: vendor } = await supabase
      .from('auto_mech_vendors')
      .select('user_id')
      .eq('id', booking.vendor_id)
      .single();

    if (!vendor || vendor.user_id !== vendorUserId) throw new Error('Unauthorised');

    const { data, error } = await supabase
      .from('auto_mech_bookings')
      .update({ status: newStatus, updated_at: new Date().toISOString(), ...extra })
      .eq('id', bookingId)
      .select('*')
      .single();

    if (error) throw new Error(`Status update failed: ${error.message}`);

    AutoMechNotificationService.notifyBookingStatusChanged({
      bookingId,
      customerId: booking.customer_id,
      vendorId:   booking.vendor_id,
      status:     newStatus,
    }).catch(() => {});

    return this.mapRow(data);
  }

  private async recalculateVendorRating(vendorId: string): Promise<void> {
    const { data } = await supabase
      .from('auto_mech_bookings')
      .select('customer_rating')
      .eq('vendor_id', vendorId)
      .not('customer_rating', 'is', null);

    if (!data || data.length === 0) return;

    const avg            = data.reduce((sum: number, b: any) => sum + (b.customer_rating ?? 0), 0) / data.length;
    const totalCustomers = data.length;

    await supabase
      .from('auto_mech_vendors')
      .update({
        rating:          parseFloat(avg.toFixed(2)),
        total_customers: totalCustomers,
        updated_at:      new Date().toISOString(),
      })
      .eq('id', vendorId);
  }

  private mapRow(row: any): AutoMechBooking {
    return {
      id:                  row.id,
      bookingReference:    row.booking_reference    ?? null,
      customerId:          row.customer_id,
      vendorId:            row.vendor_id,
      serviceId:           row.service_id,
      bookingType:         row.booking_type,
      status:              row.status,
      scheduledAt:         row.scheduled_at         ?? null,
      serviceAddress:      row.service_address,
      serviceLatitude:     parseFloat(row.service_latitude),
      serviceLongitude:    parseFloat(row.service_longitude),
      // structured vehicle fields
      vehicleMake:         row.vehicle_make         ?? null,
      vehicleModel:        row.vehicle_model        ?? null,
      vehicleYear:         row.vehicle_year         ?? null,
      vehiclePlateNumber:  row.vehicle_plate_number ?? null,
      vehicleDescription:  row.vehicle_description  ?? null,
      vehiclePhotoUrls:    row.vehicle_photo_urls   ?? [],
      notes:               row.notes                ?? null,
      totalAmount:         parseFloat(row.total_amount),
      estimatedCostMin:    row.estimated_cost_min != null ? parseFloat(row.estimated_cost_min) : null,
      estimatedCostMax:    row.estimated_cost_max != null ? parseFloat(row.estimated_cost_max) : null,
      durationDisplay:     row.duration_display     ?? null,
      paymentMethod:       row.payment_method as PaymentMethod,
      paymentStatus:       row.payment_status,
      cancellationReason:  row.cancellation_reason  ?? null,
      cancelledAt:         row.cancelled_at         ?? null,
      startedAt:           row.started_at           ?? null,
      completedAt:         row.completed_at         ?? null,
      customerRating:      row.customer_rating      ?? null,
      customerFeedback:    row.customer_feedback    ?? null,
      vendorRating:        row.vendor_rating        ?? null,
      createdAt:           row.created_at,
      updatedAt:           row.updated_at,
    };
  }
}
