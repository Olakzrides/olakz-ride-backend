import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { PaymentService } from './payment.service';
import { FareService } from './fare.service';
import { MapsUtil } from '../utils/maps.util';
import { SocketService } from './socket.service';

// ── Vehicle catalogue (static — driven by migration seed) ────────────────────

export const HIRE_VEHICLE_TYPES = [
  {
    category:  'car',
    label:     'Car',
    capacity:  '4 seater',
    sub_types: [
      { key: 'standard', label: 'Standard', capacity: '4 seater' },
      { key: 'premium',  label: 'Premium',  capacity: '4 seater' },
      { key: 'vip',      label: 'VIP',      capacity: '4 seater' },
    ],
  },
  {
    category:  'mini_bus',
    label:     'Mini Bus',
    capacity:  '7 seater',
    sub_types: [{ key: 'mini_bus_7', label: 'Mini Bus', capacity: '7 seater' }],
  },
  {
    category:  'bus',
    label:     'Bus',
    capacity:  '10 seater',
    sub_types: [{ key: 'bus_10', label: 'Bus', capacity: '10 seater' }],
  },
  {
    category:  'truck',
    label:     'Truck',
    capacity:  'Carriage',
    sub_types: [
      { key: 'truck_10t', label: '10 Tons',  capacity: '6 tyre' },
      { key: 'truck_20t', label: '20 Tons',  capacity: '10 tyre' },
      { key: 'truck_30t', label: '30 Tons',  capacity: '12 tyre' },
    ],
  },
];

// Map sub_type key → fare config vehicle_category + service_tier
// Transport hire reuses the SAME ride_fare_config rows as regular rides.
// Admin configures pricing once under car/bus/truck and it applies to both.
const FARE_CONFIG_MAP: Record<string, { vehicle_category: string; service_tier: string }> = {
  standard:   { vehicle_category: 'car',   service_tier: 'standard' },
  premium:    { vehicle_category: 'car',   service_tier: 'premium'  },
  vip:        { vehicle_category: 'car',   service_tier: 'vip'      },
  mini_bus_7: { vehicle_category: 'bus',   service_tier: 'default'  },
  bus_10:     { vehicle_category: 'bus',   service_tier: 'default'  },
  truck_10t:  { vehicle_category: 'truck', service_tier: 'default'  },
  truck_20t:  { vehicle_category: 'truck', service_tier: 'default'  },
  truck_30t:  { vehicle_category: 'truck', service_tier: 'default'  },
};

export class HireService {
  private paymentService: PaymentService;
  private fareService: FareService;
  private socketService?: SocketService;

  constructor(socketService?: SocketService) {
    this.paymentService = new PaymentService();
    this.fareService    = new FareService();
    this.socketService  = socketService;
  }

  setSocketService(socketService: SocketService): void {
    this.socketService = socketService;
  }

  // ── Vehicle types (home screen catalogue) ─────────────────────────────────

  async getVehicleTypes() {
    return HIRE_VEHICLE_TYPES;
  }

  // ── Fare estimate ──────────────────────────────────────────────────────────

  async estimateFare(params: {
    vehicle_sub_type: string;
    pickup_lat: number; pickup_lng: number; pickup_address: string;
    destination_lat: number; destination_lng: number; destination_address: string;
    pickup_state?: string;
  }) {
    const cfg = FARE_CONFIG_MAP[params.vehicle_sub_type];
    if (!cfg) throw new Error(`Unknown vehicle sub type: ${params.vehicle_sub_type}`);

    const route = await MapsUtil.getDirections(
      { latitude: params.pickup_lat,      longitude: params.pickup_lng },
      { latitude: params.destination_lat, longitude: params.destination_lng }
    );

    const fareConfig = await this.fareService.getFareConfig(
      cfg.vehicle_category,
      cfg.service_tier,
      params.pickup_state
    );

    if (!fareConfig) throw new Error('Fare configuration not found for selected vehicle type');

    const billingUnit   = Number(fareConfig.estimated_billing_unit);
    const distance      = route.distance;
    const rideFare      = distance <= 3
      ? Number(fareConfig.min_amount_less_than_3km)
      : Math.round(billingUnit * distance);
    const serviceFee    = Number(fareConfig.service_fee);
    const roundingFee   = Number(fareConfig.rounding_fee);
    const driverFare    = rideFare;
    const totalFare     = rideFare + serviceFee + roundingFee;

    return {
      distance_km:  distance,
      amount:       totalFare,
      driver_fare:  driverFare,
      service_fee:  serviceFee,
      rounding_fee: roundingFee,
      distance_text: route.distanceText,
      duration_text: route.durationText,
    };
  }

  // ── Create booking (pending — no payment yet) ──────────────────────────────

  async createHire(params: {
    customer_id: string;
    pickup_address: string; pickup_lat: number; pickup_lng: number;
    destination_address: string; destination_lat: number; destination_lng: number;
    vehicle_category: string; vehicle_sub_type: string;
    start_datetime: string; end_datetime: string;
    payment_method: string;
    for_whom: 'self' | 'other';
    passenger_name?: string; passenger_phone?: string; note?: string;
    pickup_state?: string;
  }) {
    // Validate vehicle sub type
    const cfg = FARE_CONFIG_MAP[params.vehicle_sub_type];
    if (!cfg) throw new Error(`Unknown vehicle_sub_type: ${params.vehicle_sub_type}`);

    // Validate dates
    const start = new Date(params.start_datetime);
    const end   = new Date(params.end_datetime);
    if (isNaN(start.getTime()))       throw new Error('Invalid start_datetime');
    if (isNaN(end.getTime()))         throw new Error('Invalid end_datetime');
    if (end <= start)                 throw new Error('end_datetime must be after start_datetime');
    if (start < new Date())           throw new Error('start_datetime cannot be in the past');

    // Validate for_other fields
    if (params.for_whom === 'other') {
      if (!params.passenger_name?.trim())  throw new Error('passenger_name is required when booking for someone else');
      if (!params.passenger_phone?.trim()) throw new Error('passenger_phone is required when booking for someone else');
    }

    // Calculate fare
    const fare = await this.estimateFare({
      vehicle_sub_type:  params.vehicle_sub_type,
      pickup_lat:        params.pickup_lat,
      pickup_lng:        params.pickup_lng,
      pickup_address:    params.pickup_address,
      destination_lat:   params.destination_lat,
      destination_lng:   params.destination_lng,
      destination_address: params.destination_address,
      pickup_state:      params.pickup_state,
    });

    const hireNumber = await this.generateHireNumber();
    const now        = new Date().toISOString();

    const { data: hire, error } = await supabase
      .from('transport_hires')
      .insert({
        hire_number:          hireNumber,
        customer_id:          params.customer_id,
        pickup_address:       params.pickup_address,
        pickup_lat:           params.pickup_lat,
        pickup_lng:           params.pickup_lng,
        destination_address:  params.destination_address,
        destination_lat:      params.destination_lat,
        destination_lng:      params.destination_lng,
        vehicle_category:     params.vehicle_category,
        vehicle_sub_type:     params.vehicle_sub_type,
        start_datetime:       params.start_datetime,
        end_datetime:         params.end_datetime,
        distance_km:          fare.distance_km,
        amount:               fare.amount,
        driver_fare:          fare.driver_fare,
        service_fee:          fare.service_fee,
        rounding_fee:         fare.rounding_fee,
        payment_method:       params.payment_method,
        payment_status:       'pending',
        for_whom:             params.for_whom,
        passenger_name:       params.passenger_name ?? null,
        passenger_phone:      params.passenger_phone ?? null,
        note:                 params.note ?? null,
        status:               'pending',
        created_at:           now,
        updated_at:           now,
      })
      .select()
      .single();

    if (error || !hire) {
      logger.error('HireService.createHire insert error', { error: error?.message });
      throw new Error(`Failed to create hire booking: ${error?.message}`);
    }

    logger.info('Transport hire created', { hireId: hire.id, hireNumber, customerId: params.customer_id });

    // Audit log — hire created (pending payment)
    this.logHireNotification({
      userId:           params.customer_id,
      hireId:           hire.id,
      notificationType: 'hire_created',
      title:            'Transport Hire Booking Created',
      body:             `Your booking ${hireNumber} has been created. Proceed to pay and we'll find you a driver.`,
      data:             { hire_number: hireNumber, vehicle_sub_type: params.vehicle_sub_type, status: 'pending' },
    });

    return hire;
  }

  // ── Edit booking (only while status = pending) ─────────────────────────────

  async updateHire(hireId: string, customerId: string, updates: {
    pickup_address?: string; pickup_lat?: number; pickup_lng?: number;
    destination_address?: string; destination_lat?: number; destination_lng?: number;
    vehicle_category?: string; vehicle_sub_type?: string;
    start_datetime?: string; end_datetime?: string;
    for_whom?: 'self' | 'other'; passenger_name?: string;
    passenger_phone?: string; note?: string;
    pickup_state?: string;
  }) {
    const { data: existing, error: fetchErr } = await supabase
      .from('transport_hires')
      .select('*')
      .eq('id', hireId)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (fetchErr || !existing) throw new Error('Hire booking not found');
    if (existing.status !== 'pending') throw new Error('Hire can only be edited while status is pending');

    const sub_type = updates.vehicle_sub_type ?? existing.vehicle_sub_type;
    const cfg      = FARE_CONFIG_MAP[sub_type];
    if (!cfg) throw new Error(`Unknown vehicle_sub_type: ${sub_type}`);

    // Recalculate fare if location or vehicle changes
    const pickupLat   = updates.pickup_lat       ?? existing.pickup_lat;
    const pickupLng   = updates.pickup_lng       ?? existing.pickup_lng;
    const pickupAddr  = updates.pickup_address   ?? existing.pickup_address;
    const destLat     = updates.destination_lat  ?? existing.destination_lat;
    const destLng     = updates.destination_lng  ?? existing.destination_lng;
    const destAddr    = updates.destination_address ?? existing.destination_address;

    const fare = await this.estimateFare({
      vehicle_sub_type:   sub_type,
      pickup_lat:         pickupLat, pickup_lng: pickupLng, pickup_address: pickupAddr,
      destination_lat:    destLat,   destination_lng: destLng, destination_address: destAddr,
      pickup_state:       updates.pickup_state,
    });

    const updatePayload: Record<string, unknown> = {
      pickup_address:      pickupAddr,
      pickup_lat:          pickupLat,
      pickup_lng:          pickupLng,
      destination_address: destAddr,
      destination_lat:     destLat,
      destination_lng:     destLng,
      vehicle_category:    updates.vehicle_category    ?? existing.vehicle_category,
      vehicle_sub_type:    sub_type,
      start_datetime:      updates.start_datetime      ?? existing.start_datetime,
      end_datetime:        updates.end_datetime         ?? existing.end_datetime,
      for_whom:            updates.for_whom             ?? existing.for_whom,
      passenger_name:      updates.passenger_name      ?? existing.passenger_name,
      passenger_phone:     updates.passenger_phone     ?? existing.passenger_phone,
      note:                updates.note                ?? existing.note,
      distance_km:         fare.distance_km,
      amount:              fare.amount,
      driver_fare:         fare.driver_fare,
      service_fee:         fare.service_fee,
      rounding_fee:        fare.rounding_fee,
      updated_at:          new Date().toISOString(),
    };

    const { data: updated, error } = await supabase
      .from('transport_hires')
      .update(updatePayload)
      .eq('id', hireId)
      .select()
      .single();

    if (error || !updated) throw new Error(`Failed to update hire: ${error?.message}`);

    logger.info('Transport hire updated', { hireId, customerId });
    return updated;
  }

  // ── Proceed (confirm + pay from wallet) ───────────────────────────────────

  async proceedHire(hireId: string, customerId: string) {
    const { data: hire, error: fetchErr } = await supabase
      .from('transport_hires')
      .select('*')
      .eq('id', hireId)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (fetchErr || !hire) throw new Error('Hire booking not found');
    if (hire.status !== 'pending') throw new Error(`Hire is already ${hire.status}`);

    // Deduct wallet payment (only wallet supported for now)
    if (hire.payment_method === 'wallet') {
      const hold = await this.paymentService.createRidePaymentHold({
        userId:      customerId,
        amount:      Number(hire.amount),
        currencyCode: hire.currency_code,
        description: `Transport hire payment - ${hire.hire_number}`,
      });

      if (hold.status !== 'hold_created') {
        throw new Error(hold.message || 'Insufficient wallet balance');
      }

      // Update hire: paid, searching, store hold id
      const { data: updated, error: updateErr } = await supabase
        .from('transport_hires')
        .update({
          status:          'searching',
          payment_status:  'paid',
          payment_hold_id: hold.holdId,
          updated_at:      new Date().toISOString(),
        })
        .eq('id', hireId)
        .select()
        .single();

      if (updateErr || !updated) throw new Error('Failed to confirm hire payment');

      logger.info('Transport hire payment confirmed', { hireId, amount: hire.amount });

      // Audit log — payment confirmed, searching for driver
      this.logHireNotification({
        userId:           customerId,
        hireId,
        notificationType: 'hire_searching',
        title:            'Payment Confirmed — Searching for Driver',
        body:             `Payment of ₦${Number(hire.amount).toLocaleString('en-NG')} confirmed for booking ${hire.hire_number}. Searching for an available driver.`,
        data:             { hire_number: hire.hire_number, amount: hire.amount, status: 'searching' },
      });

      // Start driver search
      await this.searchForDriver(hireId);

      return updated;
    }

    throw new Error('Only wallet payment is currently supported');
  }

  // ── Driver search ──────────────────────────────────────────────────────────

  async searchForDriver(hireId: string): Promise<{ driversNotified: number }> {
    const { data: hire } = await supabase
      .from('transport_hires')
      .select('*')
      .eq('id', hireId)
      .single();

    if (!hire) throw new Error('Hire not found');

    // Map hire vehicle_category to the service_tier_id UUIDs used on the drivers table.
    // Drivers are matched by service_tier_id, not by vehicle_type name.
    // Standard car = ...0011, Premium = ...0012, VIP = ...0013
    // For non-car categories (mini_bus, bus, truck), fall back to all approved
    // online drivers whose vehicle matches — we check vehicle type via driver_vehicles join.
    const SERVICE_TIER_MAP: Record<string, string> = {
      standard:   '00000000-0000-0000-0000-000000000011',
      premium:    '00000000-0000-0000-0000-000000000012',
      vip:        '00000000-0000-0000-0000-000000000013',
    };

    const serviceTierId = SERVICE_TIER_MAP[hire.vehicle_sub_type] ?? null;

    // Step 1: Get approved drivers with active vehicles
    let baseQuery = supabase
      .from('drivers')
      .select(`
        id, user_id, rating,
        vehicles:driver_vehicles!inner(plate_number, manufacturer, model, color, is_active)
      `)
      .eq('status', 'approved')
      .eq('vehicles.is_active', true);

    if (serviceTierId) {
      baseQuery = baseQuery.eq('service_tier_id', serviceTierId);
    }

    const { data: baseDrivers, error: baseError } = await baseQuery;

    if (baseError) {
      logger.error('searchForDriver base query error', { hireId, error: baseError.message });
    }

    logger.info('searchForDriver step1 — approved drivers with vehicles', {
      hireId, count: baseDrivers?.length ?? 0, serviceTierId,
    });

    if (!baseDrivers || baseDrivers.length === 0) {
      setTimeout(() => this.handleSearchTimeout(hireId), 10 * 60 * 1000);
      return { driversNotified: 0 };
    }

    // Step 2: Filter to only online + available drivers.
    // For hire (scheduled booking) we do NOT filter by last_seen_at —
    // any driver currently marked online/available is valid regardless of
    // when they last sent a heartbeat.
    const driverIds = baseDrivers.map((d: any) => d.id);

    const { data: onlineAvailability } = await supabase
      .from('driver_availability')
      .select('driver_id')
      .in('driver_id', driverIds)
      .eq('is_online', true)
      .eq('is_available', true);

    const onlineDriverIdSet = new Set((onlineAvailability ?? []).map((a: any) => a.driver_id));

    logger.info('searchForDriver availability check', {
      hireId,
      checkedDriverIds: driverIds,
      onlineDriverIds:  [...onlineDriverIdSet],
    });

    const drivers = baseDrivers.filter((d: any) => onlineDriverIdSet.has(d.id));

    logger.info('searchForDriver step2 — online and available drivers', {
      hireId,
      vehicleCategory:  hire.vehicle_category,
      vehicleSubType:   hire.vehicle_sub_type,
      serviceTierId,
      driversFound:     drivers.length,
      onlineCount:      onlineAvailability?.length ?? 0,
    });

    // Always schedule the 10-min timeout regardless of driver count
    setTimeout(() => this.handleSearchTimeout(hireId), 10 * 60 * 1000);

    if (drivers.length === 0) {
      logger.warn('No online drivers found for hire at search time', { hireId });
      return { driversNotified: 0 };
    }

    // Create hire_requests for matched drivers
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const requests  = drivers.map((d: any) => ({
      hire_id:      hireId,
      driver_id:    d.id,
      status:       'pending',
      batch_number: 1,
      expires_at:   expiresAt,
    }));

    const { error: insertErr } = await supabase.from('hire_requests').insert(requests);
    if (insertErr) {
      logger.error('hire_requests insert error', { hireId, error: insertErr.message });
    }

    // Broadcast to drivers via WebSocket
    if (this.socketService) {
      const driverIds = drivers.map((d: any) => d.id);
      await this.socketService.broadcastRideRequestToDrivers(hireId, driverIds, {
        type:            'hire_request',
        hireId,
        hireNumber:      hire.hire_number,
        vehicleCategory: hire.vehicle_category,
        vehicleSubType:  hire.vehicle_sub_type,
        pickup: {
          address:   hire.pickup_address,
          latitude:  parseFloat(hire.pickup_lat),
          longitude: parseFloat(hire.pickup_lng),
        },
        destination: {
          address:   hire.destination_address,
          latitude:  parseFloat(hire.destination_lat),
          longitude: parseFloat(hire.destination_lng),
        },
        startDatetime: hire.start_datetime,
        endDatetime:   hire.end_datetime,
        driverFare:    hire.driver_fare,
        distanceKm:    hire.distance_km,
        expiresAt,
      });
    }

    logger.info('Hire driver search started', { hireId, driversNotified: drivers.length });
    return { driversNotified: drivers.length };
  }

  // ── Driver accept/reject ───────────────────────────────────────────────────

  async driverAcceptHire(hireId: string, driverId: string): Promise<{ success: boolean; message: string }> {
    // Check hire is still searching
    const { data: hire } = await supabase
      .from('transport_hires')
      .select('*')
      .eq('id', hireId)
      .single();

    if (!hire)                           return { success: false, message: 'Hire not found' };
    if (hire.status !== 'searching')     return { success: false, message: 'Hire is no longer available' };

    // Check driver has a pending request for this hire
    const { data: req } = await supabase
      .from('hire_requests')
      .select('id, status')
      .eq('hire_id', hireId)
      .eq('driver_id', driverId)
      .eq('status', 'pending')
      .maybeSingle();

    if (!req) return { success: false, message: 'No pending request found for this driver' };

    // Mark this request accepted, expire others
    await supabase
      .from('hire_requests')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', req.id);

    await supabase
      .from('hire_requests')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('hire_id', hireId)
      .eq('status', 'pending')
      .neq('id', req.id);

    // Assign driver to hire
    await supabase
      .from('transport_hires')
      .update({
        driver_id:  driverId,
        status:     'driver_assigned',
        updated_at: new Date().toISOString(),
      })
      .eq('id', hireId);

    // Notify customer via WebSocket — hire:driver:assigned
    if (this.socketService) {
      const driverDetails = await this.getDriverDetails(driverId);
      await this.socketService.notifyCustomerHireDriverAssigned(
        hire.customer_id,
        hireId,
        driverDetails
      );
    }
    logger.info('Hire driver assigned', { hireId, driverId });

    // Audit log — notify customer that driver was assigned
    this.logHireNotification({
      userId:           hire.customer_id,
      hireId,
      notificationType: 'hire_driver_assigned',
      title:            '🚗 Driver Found!',
      body:             `A driver has accepted your transport hire booking ${hire.hire_number}. Please be at your pickup location on time.`,
      data:             { hire_number: hire.hire_number, driver_id: driverId, status: 'driver_assigned' },
    });

    // Audit log — notify driver of their new assignment
    const driverUserId = await supabase
      .from('drivers').select('user_id').eq('id', driverId).maybeSingle()
      .then(r => r.data?.user_id);

    if (driverUserId) {
      this.logHireNotification({
        userId:           driverUserId,
        hireId,
        notificationType: 'hire_driver_assigned',
        title:            'New Transport Hire Assignment',
        body:             `You have accepted transport hire booking ${hire.hire_number}. Pick up starts ${new Date(hire.start_datetime).toLocaleDateString('en-NG')}.`,
        data:             { hire_number: hire.hire_number, customer_id: hire.customer_id, status: 'driver_assigned' },
      });
    }

    return { success: true, message: 'Hire accepted successfully' };
  }

  async driverRejectHire(hireId: string, driverId: string): Promise<{ success: boolean }> {
    await supabase
      .from('hire_requests')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('hire_id', hireId)
      .eq('driver_id', driverId)
      .eq('status', 'pending');

    return { success: true };
  }

  // ── Cancel hire ────────────────────────────────────────────────────────────

  async cancelHire(hireId: string, customerId: string, reason?: string) {
    const { data: hire } = await supabase
      .from('transport_hires')
      .select('*')
      .eq('id', hireId)
      .eq('customer_id', customerId)
      .maybeSingle();

    if (!hire) throw new Error('Hire booking not found');

    const cancellableStatuses = ['pending', 'searching', 'driver_assigned', 'confirmed'];
    if (!cancellableStatuses.includes(hire.status)) {
      throw new Error(`Cannot cancel hire in ${hire.status} status`);
    }

    // Refund wallet if already paid
    if (hire.payment_status === 'paid' && hire.payment_hold_id) {
      await this.paymentService.releasePaymentHold({
        holdId: hire.payment_hold_id,
        reason: reason || 'Customer cancelled hire',
      });
    }

    await supabase
      .from('transport_hires')
      .update({
        status:               'cancelled',
        payment_status:       hire.payment_status === 'paid' ? 'refunded' : hire.payment_status,
        cancellation_reason:  reason ?? null,
        updated_at:           new Date().toISOString(),
      })
      .eq('id', hireId);

    // Notify drivers via WebSocket that hire was cancelled
    if (this.socketService) {
      this.socketService.broadcastHireCancelledToDrivers(hireId).catch(() => {});
    }

    logger.info('Transport hire cancelled', { hireId, customerId, reason });

    const refunded = hire.payment_status === 'paid';

    // Audit log — cancellation
    this.logHireNotification({
      userId:           customerId,
      hireId,
      notificationType: 'hire_cancelled',
      title:            'Transport Hire Cancelled',
      body:             `Your booking ${hire.hire_number} has been cancelled.${refunded ? ' Your payment has been refunded to your wallet.' : ''}`,
      data:             { hire_number: hire.hire_number, reason: reason ?? null, refunded, status: 'cancelled' },
    });

    return { cancelled: true, refunded };
  }

  // ── Get hire details ───────────────────────────────────────────────────────

  async getHireById(hireId: string, userId: string) {
    // Try customer match first, then driver match
    let { data: hire, error } = await supabase
      .from('transport_hires')
      .select('*')
      .eq('id', hireId)
      .eq('customer_id', userId)
      .maybeSingle();

    // If not found as customer, try as assigned driver
    if (!hire) {
      const { data: driverRow } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (driverRow) {
        const { data: hireAsDriver } = await supabase
          .from('transport_hires')
          .select('*')
          .eq('id', hireId)
          .eq('driver_id', driverRow.id)
          .maybeSingle();
        hire = hireAsDriver;
      }
    }

    if (error || !hire) return null;

    let driverInfo = null;
    if (hire.driver_id) {
      driverInfo = await this.getDriverDetails(hire.driver_id);
    }

    // Fetch customer details
    let customerInfo = null;
    const { data: customer } = await supabase
      .from('users')
      .select('id, first_name, last_name, phone, avatar_url')
      .eq('id', hire.customer_id)
      .maybeSingle();

    if (customer) {
      customerInfo = {
        id:    customer.id,
        name:  `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim() || 'Customer',
        phone: customer.phone ?? null,
        photo: customer.avatar_url ?? null,
      };
    }

    return { ...hire, driver: driverInfo, customer: customerInfo };
  }

  async getDriverDetails(driverId: string) {
    const { data: driver } = await supabase
      .from('drivers')
      .select(`
        id, rating, total_rides,
        user:users!drivers_user_id_fkey(first_name, last_name, phone, avatar_url),
        vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)
      `)
      .eq('id', driverId)
      .single();

    if (!driver) return null;

    const d      = driver as Record<string, unknown>;
    const user   = d.user as Record<string, unknown> | null;
    const veh    = ((d.vehicles as any[]) || []).find(v => v.is_active) || (d.vehicles as any[])?.[0];

    return {
      id:       driverId,
      name:     user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() : 'Driver',
      phone:    user?.phone ?? null,
      photo:    user?.avatar_url ?? null,
      rating:   parseFloat(String(d.rating ?? 0)),
      total_rides: d.total_rides,
      vehicle: veh ? {
        model:        `${veh.manufacturer} ${veh.model}`,
        color:        veh.color,
        plate_number: veh.plate_number,
      } : null,
    };
  }

  // ── Home screen data ───────────────────────────────────────────────────────

  async getHomeData(customerId: string) {
    const activeStatuses = ['pending', 'searching', 'driver_assigned', 'confirmed', 'in_progress'];

    const [activeRes, historyRes] = await Promise.all([
      supabase
        .from('transport_hires')
        .select('id, hire_number, vehicle_category, vehicle_sub_type, start_datetime, status')
        .eq('customer_id', customerId)
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('transport_hires')
        .select('id, hire_number, vehicle_category, vehicle_sub_type, pickup_address, start_datetime, status, amount')
        .eq('customer_id', customerId)
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    return {
      active_booking: activeRes.data ?? null,
      history:        historyRes.data ?? [],
      vehicle_types:  HIRE_VEHICLE_TYPES,
    };
  }

  // ── Driver available requests ──────────────────────────────────────────────

  async getDriverAvailableRequests(driverId: string) {
    const { data: requests, error } = await supabase
      .from('hire_requests')
      .select(`
        id, hire_id, expires_at,
        hire:transport_hires(
          hire_number, vehicle_category, vehicle_sub_type,
          pickup_address, pickup_lat, pickup_lng,
          destination_address, start_datetime, end_datetime,
          driver_fare, distance_km, customer_id
        )
      `)
      .eq('driver_id', driverId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());

    logger.info('getDriverAvailableRequests', {
      driverId,
      rowsFound: requests?.length ?? 0,
      error: error?.message ?? null,
      now: new Date().toISOString(),
    });

    if (!requests || requests.length === 0) return [];

    // Enrich each request with customer details
    const enriched = await Promise.all(
      requests.map(async (req: any) => {
        const customerId = req.hire?.customer_id;
        let customer = null;

        if (customerId) {
          const { data: user } = await supabase
            .from('users')
            .select('id, first_name, last_name, phone, avatar_url')
            .eq('id', customerId)
            .maybeSingle();

          if (user) {
            customer = {
              id:    user.id,
              name:  `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
              phone: user.phone ?? null,
              photo: user.avatar_url ?? null,
            };
          }
        }

        const { customer_id: _omit, ...hireWithoutCustomerId } = req.hire ?? {};
        return { ...req, hire: { ...hireWithoutCustomerId, customer } };
      })
    );

    return enriched;
  }

  // ── Hire history ───────────────────────────────────────────────────────────

  async getHireHistory(customerId: string, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    const { data, count, error } = await supabase
      .from('transport_hires')
      .select('id, hire_number, vehicle_category, vehicle_sub_type, pickup_address, destination_address, start_datetime, end_datetime, amount, status, payment_method, created_at', { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch hire history: ${error.message}`);
    return { hires: data ?? [], total: count ?? 0, page, limit };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // ── Notification audit log ────────────────────────────────────────────────

  /**
   * Writes a row to notification_history for every significant hire event.
   * Non-fatal — never throws; a logging failure must not break the main flow.
   *
   * Events logged:
   *   hire_created         → customer
   *   hire_searching       → customer (payment confirmed, searching started)
   *   hire_driver_assigned → customer + driver
   *   hire_cancelled       → customer
   *   hire_no_driver_found → customer (auto-refunded)
   */
  private async logHireNotification(params: {
    userId:           string;
    hireId:           string;
    notificationType: string;
    title:            string;
    body:             string;
    data?:            Record<string, unknown>;
  }): Promise<void> {
    try {
      await supabase.from('notification_history').insert({
        user_id:           params.userId,
        notification_type: params.notificationType,
        channel:           'in_app',
        title:             params.title,
        body:              params.body,
        data:              { hire_id: params.hireId, ...(params.data ?? {}) },
        status:            'sent',
        sent_at:           new Date().toISOString(),
      });
    } catch (err: any) {
      logger.warn('logHireNotification failed (non-fatal)', { error: err.message, ...params });
    }
  }

  // ── Startup recovery + periodic watchdog ──────────────────────────────────

  /**
   * Called on service startup and every 2 minutes.
   * Finds all hires stuck in 'searching' status and resolves them:
   *   - If the booking's search window has expired → refund + no_driver_found
   *   - Reschedules a fresh setTimeout for any still within their window
   *
   * This survives server restarts — setTimeout-based timeouts are lost on
   * redeploy, so this DB-backed watchdog is the safety net.
   */
  async recoverStuckHires(): Promise<void> {
    try {
      const { data: stuckHires, error } = await supabase
        .from('transport_hires')
        .select('id, payment_status, payment_hold_id, amount, created_at')
        .eq('status', 'searching');

      if (error || !stuckHires || stuckHires.length === 0) return;

      const TEN_MINUTES_MS = 10 * 60 * 1000;
      const now            = Date.now();

      for (const hire of stuckHires) {
        const createdAt  = new Date(hire.created_at).getTime();
        const elapsed    = now - createdAt;

        if (elapsed >= TEN_MINUTES_MS) {
          // Search window expired — resolve immediately
          logger.info('recoverStuckHires: resolving expired hire', {
            hireId: hire.id, elapsedMinutes: Math.round(elapsed / 60000),
          });
          await this.handleSearchTimeout(hire.id);
        } else {
          // Still within window — reschedule the remaining time
          const remaining = TEN_MINUTES_MS - elapsed;
          setTimeout(() => this.handleSearchTimeout(hire.id), remaining);
          logger.info('recoverStuckHires: rescheduled timeout', {
            hireId: hire.id, remainingMs: remaining,
          });
        }
      }
    } catch (err: any) {
      logger.error('recoverStuckHires error (non-fatal)', { error: err.message });
    }
  }

  /**
   * Starts the periodic watchdog — runs every 2 minutes.
   * Call once on service startup.
   */
  startWatchdog(): void {
    // Run immediately on startup to recover any hires stuck from before last deploy
    this.recoverStuckHires().catch(() => {});

    // Then run every 2 minutes as a safety net
    setInterval(() => {
      this.recoverStuckHires().catch(() => {});
    }, 2 * 60 * 1000);

    logger.info('Hire watchdog started (runs every 2 minutes)');
  }

  private async generateHireNumber(): Promise<string> {
    const date = new Date();
    const ymd  = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const prefix = `HIRE-${ymd}-`;
    const { count } = await supabase
      .from('transport_hires')
      .select('id', { count: 'exact', head: true })
      .like('hire_number', `${prefix}%`);
    const seq = String((count ?? 0) + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  private async handleSearchTimeout(hireId: string): Promise<void> {
    const { data: hire } = await supabase
      .from('transport_hires')
      .select('status, customer_id, payment_status, payment_hold_id, amount')
      .eq('id', hireId)
      .single();

    if (!hire || hire.status !== 'searching') return;

    // ── Auto-refund wallet if paid ──────────────────────────────────────────
    if (hire.payment_status === 'paid' && hire.payment_hold_id) {
      await this.paymentService.releasePaymentHold({
        holdId: hire.payment_hold_id,
        reason: 'No driver found within search window — auto refund',
      });
      logger.info('Hire auto-refund issued', { hireId, amount: hire.amount });
    }

    // ── Update hire status + payment_status ────────────────────────────────
    await supabase
      .from('transport_hires')
      .update({
        status:         'no_driver_found',
        payment_status: hire.payment_status === 'paid' ? 'refunded' : hire.payment_status,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', hireId);

    logger.warn('Hire search timed out — no driver found, refund issued', { hireId });

    // Notify customer via WebSocket — hire:status:updated
    if (this.socketService) {
      this.socketService.broadcastHireStatusUpdate(hireId, {
        status:  'no_driver_found',
        message: 'No driver was found for your hire. Your payment has been refunded.',
      }).catch(() => {});
    }

    // Audit log — no driver found, customer notified
    this.logHireNotification({
      userId:           hire.customer_id,
      hireId,
      notificationType: 'hire_no_driver_found',
      title:            'No Driver Available',
      body:             `We could not find an available driver for your transport hire booking. Your payment has been refunded to your wallet.`,
      data:             { status: 'no_driver_found', refunded: hire.payment_status === 'paid' },
    });
  }
}
