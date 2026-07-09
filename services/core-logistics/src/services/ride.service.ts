import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { Location } from '../types';
import { RideMatchingService } from './ride-matching.service';
import { RideStateMachineService, RideStatus } from './ride-state-machine.service';
import { PaymentService } from './payment.service';

export class RideService {
  private rideMatchingService?: RideMatchingService;
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  /**
   * Set ride matching service (injected after initialization)
   */
  setRideMatchingService(rideMatchingService: RideMatchingService): void {
    this.rideMatchingService = rideMatchingService;
  }

  /**
   * Check if user has any active rides (concurrent prevention)
   */
  async hasActiveRide(userId: string): Promise<{ hasActive: boolean; activeRideId?: string; status?: string }> {
    try {
      const activeStatuses = [
        RideStatus.SEARCHING,
        RideStatus.DRIVER_ASSIGNED,
        RideStatus.DRIVER_ARRIVED,
        RideStatus.IN_PROGRESS,
      ];

      const { data: activeRide, error } = await supabase
        .from('rides')
        .select('id, status')
        .eq('user_id', userId)
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        logger.error('Check active ride error:', error);
        return { hasActive: false };
      }

      if (activeRide) {
        return {
          hasActive: true,
          activeRideId: activeRide.id,
          status: activeRide.status,
        };
      }

      return { hasActive: false };
    } catch (error) {
      logger.error('Check active ride error:', error);
      return { hasActive: false };
    }
  }

  /**
   * Create a new ride with payment method routing
   */
  async createRide(data: {
    cart_id?: string;
    user_id: string;
    user_email?: string;
    variant_id: string;
    pickup_location: Location;
    dropoff_location: Location;
    estimated_distance: number;
    estimated_duration: number;
    estimated_fare: number;
    driver_fare?: number;
    service_fee?: number;
    rounding_fee?: number;
    shared_discount?: number;
    currency_code: string;
    payment_method: string;
    payment_details?: {
      type: 'wallet' | 'cash' | 'card';
      cardId?: string;
      cardDetails?: any;
    };
    scheduled_at?: Date | null;
    booking_type?: string;
    recipient_name?: string;
    recipient_phone?: string;
    metadata?: any;
  }): Promise<{ success: boolean; ride?: any; rideId?: string; error?: string; errorCode?: string; authorization?: any; flw_ref?: string }> {
    try {
      // Route to appropriate payment flow
      if (data.payment_method === 'wallet') {
        return await this.createRideWithWalletPayment(data);
      } else if (data.payment_method === 'cash') {
        return await this.createRideWithCashPayment(data);
      } else if (data.payment_method === 'card') {
        return await this.createRideWithCardPayment(data);
      }

      return {
        success: false,
        error: 'Invalid payment method',
        errorCode: 'INVALID_PAYMENT_METHOD',
      };
    } catch (error: any) {
      logger.error('Create ride error:', error);
      return {
        success: false,
        error: error.message || 'Failed to create ride',
        errorCode: 'RIDE_CREATION_FAILED',
      };
    }
  }

  /**
   * Create ride with wallet payment (existing flow - uses database function)
   */
  private async createRideWithWalletPayment(data: any): Promise<any> {
    // Use database function for atomic transaction with balance check
    const { data: result, error: rideError } = await supabase.rpc('create_ride_with_payment_hold', {
      p_cart_id: data.cart_id,
      p_user_id: data.user_id,
      p_variant_id: data.variant_id,
      p_pickup_latitude: data.pickup_location.latitude,
      p_pickup_longitude: data.pickup_location.longitude,
      p_pickup_address: data.pickup_location.address,
      p_dropoff_latitude: data.dropoff_location.latitude,
      p_dropoff_longitude: data.dropoff_location.longitude,
      p_dropoff_address: data.dropoff_location.address,
      p_estimated_distance: data.estimated_distance,
      p_estimated_duration: data.estimated_duration,
      p_estimated_fare: data.estimated_fare,
      p_currency_code: data.currency_code,
      p_payment_method: data.payment_method,
      p_scheduled_at: data.scheduled_at,
      p_booking_type: data.booking_type || 'for_me',
      p_recipient_name: data.recipient_name,
      p_recipient_phone: data.recipient_phone,
      p_metadata: data.metadata || {},
    });

    if (rideError || !result || result.length === 0) {
      logger.error('Create ride with payment hold error:', rideError);
      return {
        success: false,
        error: 'Failed to create ride and payment hold',
        errorCode: 'RIDE_CREATION_FAILED',
      };
    }

    const rideResult = result[0];

    if (!rideResult.success) {
      if (rideResult.error_message?.includes('Insufficient wallet balance')) {
        return {
          success: false,
          error: rideResult.error_message,
          errorCode: 'INSUFFICIENT_BALANCE',
        };
      }
      if (rideResult.error_message?.includes('already has an active ride')) {
        return {
          success: false,
          error: rideResult.error_message,
          errorCode: 'CONCURRENT_RIDE_EXISTS',
        };
      }
      return {
        success: false,
        error: rideResult.error_message || 'Unknown error occurred',
        errorCode: 'RIDE_CREATION_FAILED',
      };
    }

    logger.info('Ride created with wallet payment:', {
      rideId: rideResult.ride_id,
      paymentHoldId: rideResult.payment_hold_id,
    });

    return await this.finalizeRideCreation(rideResult.ride_id, data);
  }

  /**
   * Create ride with cash payment (no payment hold)
   */
  private async createRideWithCashPayment(data: any): Promise<any> {
    // Check for concurrent rides
    const activeCheck = await this.hasActiveRide(data.user_id);
    if (activeCheck.hasActive) {
      return {
        success: false,
        error: `You already have an active ride (${activeCheck.status})`,
        errorCode: 'CONCURRENT_RIDE_EXISTS',
      };
    }

    // Create ride without payment hold
    const { data: ride, error: rideError } = await supabase
      .from('rides')
      .insert({
        cart_id: data.cart_id,
        user_id: data.user_id,
        variant_id: data.variant_id,
        pickup_latitude: data.pickup_location.latitude,
        pickup_longitude: data.pickup_location.longitude,
        pickup_address: data.pickup_location.address,
        dropoff_latitude: data.dropoff_location.latitude,
        dropoff_longitude: data.dropoff_location.longitude,
        dropoff_address: data.dropoff_location.address,
        estimated_distance: data.estimated_distance,
        estimated_duration: data.estimated_duration,
        estimated_fare: data.estimated_fare,
        driver_fare: data.driver_fare ?? data.estimated_fare,
        service_fee: data.service_fee ?? 0,
        rounding_fee: data.rounding_fee ?? 0,
        shared_discount: data.shared_discount ?? 0,
        currency_code: data.currency_code,
        payment_method: 'cash',
        status: data.scheduled_at ? 'scheduled' : RideStatus.SEARCHING,
        scheduled_at: data.scheduled_at,
        booking_type: data.booking_type || 'for_me',
        recipient_name: data.recipient_name,
        recipient_phone: data.recipient_phone,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (rideError || !ride) {
      logger.error('Create ride with cash payment error:', rideError);
      return {
        success: false,
        error: 'Failed to create ride',
        errorCode: 'RIDE_CREATION_FAILED',
      };
    }

    logger.info('Ride created with cash payment:', { rideId: ride.id });

    return await this.finalizeRideCreation(ride.id, data);
  }

  /**
   * Create ride with card payment (charge card first - NOT FULLY IMPLEMENTED)
   */
  private async createRideWithCardPayment(data: any): Promise<any> {
    // Check for concurrent rides
    const activeCheck = await this.hasActiveRide(data.user_id);
    if (activeCheck.hasActive) {
      return {
        success: false,
        error: `You already have an active ride (${activeCheck.status})`,
        errorCode: 'CONCURRENT_RIDE_EXISTS',
      };
    }

    // For now, card payment for rides is not fully implemented
    // Return error directing user to use wallet or cash
    return {
      success: false,
      error: 'Card payment for rides is not yet available. Please use wallet or cash payment.',
      errorCode: 'CARD_PAYMENT_NOT_IMPLEMENTED',
    };
  }

  /**
   * Finalize ride creation (start driver matching, etc.)
   */
  private async finalizeRideCreation(rideId: string, data: any): Promise<any> {
    // Get the created ride
    const { data: ride, error: fetchError } = await supabase
      .from('rides')
      .select('*')
      .eq('id', rideId)
      .single();

    if (fetchError || !ride) {
      return {
        success: false,
        error: 'Failed to fetch created ride',
        errorCode: 'RIDE_FETCH_FAILED',
      };
    }

    // Start driver matching if not scheduled
    if (!data.scheduled_at && this.rideMatchingService) {
      logger.info('🚀 Starting driver matching for ride:', rideId);

      const { data: variant } = await supabase
        .from('ride_variants')
        .select('vehicle_type_id, title')
        .eq('id', data.variant_id)
        .single();

      if (variant) {
        // Map variant title to service tier ID
        // service_tier_id on drivers: standard=...0011, premium=...0012, vip=...0013
        const serviceTierMap: Record<string, string> = {
          standard: '00000000-0000-0000-0000-000000000011',
          premium:  '00000000-0000-0000-0000-000000000012',
          vip:      '00000000-0000-0000-0000-000000000013',
        };
        const variantTitle = (variant.title || '').toLowerCase();
        const serviceTierId = serviceTierMap[variantTitle] || serviceTierMap['standard'];

        logger.info('🎯 Resolved service tier for matching:', {
          variantTitle: variant.title,
          serviceTierId,
        });

        const matchingResult = await this.rideMatchingService.findAndNotifyDriversForRide(rideId, {
          pickupLatitude: data.pickup_location.latitude,
          pickupLongitude: data.pickup_location.longitude,
          serviceTierId,
          maxDistance: 30,
          maxDrivers: 10,
        });

        logger.info('✅ Driver matching completed:', {
          rideId,
          driversNotified: matchingResult.driversNotified,
        });
      }
    }

    return {
      success: true,
      ride,
    };
  }

  /**
   * Update ride status with state machine validation
   */
  async updateRideStatus(
    rideId: string,
    newStatus: RideStatus,
    reason?: string,
    metadata?: any
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current ride status
      const { data: currentRide, error: fetchError } = await supabase
        .from('rides')
        .select('status, user_id, metadata')
        .eq('id', rideId)
        .single();

      if (fetchError || !currentRide) {
        return { success: false, error: 'Ride not found' };
      }

      const currentStatus = currentRide.status as RideStatus;

      // Validate state transition
      const transitionValidation = RideStateMachineService.validateTransition({
        from: currentStatus,
        to: newStatus,
        reason,
        metadata,
      });

      if (!transitionValidation.isValid) {
        return { success: false, error: transitionValidation.error };
      }

      // Update ride status
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
          metadata: {
            ...currentRide.metadata,
            ...metadata,
            status_history: [
              ...(currentRide.metadata?.status_history || []),
              {
                from: currentStatus,
                to: newStatus,
                reason,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Update ride status error:', updateError);
        return { success: false, error: 'Failed to update ride status' };
      }

      logger.info('Ride status updated:', {
        rideId,
        from: currentStatus,
        to: newStatus,
        reason,
      });

      return { success: true };
    } catch (error: any) {
      logger.error('Update ride status error:', error);
      return { success: false, error: 'Failed to update ride status' };
    }
  }

  /**
   * Get user's recent rides
   */
  async getUserRecentRides(userId: string, limit: number = 10): Promise<any[]> {
    try {
      const { data: rides, error } = await supabase
        .from('rides')
        .select(`
          id,
          status,
          pickup_address,
          dropoff_address,
          estimated_fare,
          created_at,
          updated_at,
          ride_variants (
            title,
            vehicle_types (
              name,
              display_name
            )
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Get user recent rides error:', error);
        return [];
      }

      return rides || [];
    } catch (error: any) {
      logger.error('Get user recent rides error:', error);
      return [];
    }
  }

  /**
   * Get paginated ride history for a customer with full details.
   */
  async getCustomerRideHistory(userId: string, options: {
    page?:       number;
    limit?:      number;
    status?:     string;
    dateFrom?:   string;
    dateTo?:     string;
  } = {}): Promise<{
    rides:      any[];
    total:      number;
    page:       number;
    limit:      number;
    totalPages: number;
  }> {
    const page   = Math.max(1, options.page  ?? 1);
    const limit  = Math.min(50, options.limit ?? 10);
    const offset = (page - 1) * limit;

    try {
      let query = supabase
        .from('rides')
        .select(`
          id, status, booking_type, payment_method, payment_status,
          pickup_address,  pickup_latitude,  pickup_longitude,
          dropoff_address, dropoff_latitude, dropoff_longitude,
          estimated_fare, driver_fare, service_fee, rounding_fee, final_fare,
          currency_code,
          driver_id,
          created_at, updated_at, scheduled_at,
          recipient_name, recipient_phone,
          ride_variants (title, vehicle_types (name, display_name))
        `, { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (options.status)   query = query.eq('status', options.status);
      if (options.dateFrom) query = query.gte('created_at', options.dateFrom);
      if (options.dateTo)   query = query.lte('created_at', options.dateTo);

      const { data: rides, count, error } = await query;

      if (error) {
        logger.error('getCustomerRideHistory query error:', error);
        return { rides: [], total: 0, page, limit, totalPages: 0 };
      }

      const rideList = rides ?? [];

      // Enrich with driver details for completed/in-progress rides
      const driverIds = [...new Set(
        rideList.map((r: any) => r.driver_id).filter(Boolean)
      )];

      const driverMap = new Map<string, {
        name: string; phone: string | null; photo: string | null; rating: number;
        vehicle: { model: string; color: string; plate_number: string } | null;
      }>();

      if (driverIds.length > 0) {
        const { data: drivers } = await supabase
          .from('drivers')
          .select(`
            id, rating,
            user:users!drivers_user_id_fkey(first_name, last_name, phone, avatar_url),
            vehicles:driver_vehicles(manufacturer, model, color, plate_number, is_active)
          `)
          .in('id', driverIds);

        for (const d of drivers ?? []) {
          const dr = d as Record<string, any>;
          const u  = dr.user as Record<string, any> | null;
          const vehicles = (dr.vehicles as any[]) ?? [];
          const active   = vehicles.find(v => v.is_active) ?? vehicles[0] ?? null;
          driverMap.set(dr.id, {
            name:    u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Driver' : 'Driver',
            phone:   u?.phone   ?? null,
            photo:   u?.avatar_url ?? null,
            rating:  parseFloat(String(dr.rating ?? 0)),
            vehicle: active ? {
              model:        `${active.manufacturer} ${active.model}`,
              color:        active.color,
              plate_number: active.plate_number,
            } : null,
          });
        }
      }

      const enriched = rideList.map((ride: any) => ({
        id:               ride.id,
        status:           ride.status,
        booking_type:     ride.booking_type,
        payment_method:   ride.payment_method,
        payment_status:   ride.payment_status,
        pickup: {
          address:   ride.pickup_address,
          latitude:  ride.pickup_latitude,
          longitude: ride.pickup_longitude,
        },
        dropoff: {
          address:   ride.dropoff_address,
          latitude:  ride.dropoff_latitude,
          longitude: ride.dropoff_longitude,
        },
        fare: {
          estimated:    ride.estimated_fare,
          final:        ride.final_fare   ?? ride.estimated_fare,
          driver_fare:  ride.driver_fare  ?? null,
          service_fee:  ride.service_fee  ?? null,
          rounding_fee: ride.rounding_fee ?? null,
          currency:     ride.currency_code ?? 'NGN',
        },
        vehicle:       ride.ride_variants ?? null,
        driver:        ride.driver_id ? (driverMap.get(ride.driver_id) ?? null) : null,
        recipient:     ride.booking_type === 'for_someone' ? {
          name:  ride.recipient_name  ?? null,
          phone: ride.recipient_phone ?? null,
        } : null,
        scheduled_at:  ride.scheduled_at  ?? null,
        created_at:    ride.created_at,
        updated_at:    ride.updated_at,
      }));

      return {
        rides:      enriched,
        total:      count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      };
    } catch (error: any) {
      logger.error('getCustomerRideHistory error:', error);
      return { rides: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  /**
   * Get ride by ID
   */
  async getRideById(rideId: string): Promise<any | null> {
    try {
      const { data: ride, error } = await supabase
        .from('rides')
        .select(`
          *,
          ride_variants (
            title,
            vehicle_types (
              name,
              display_name
            )
          )
        `)
        .eq('id', rideId)
        .single();

      if (error) {
        logger.error('Get ride by ID error:', error);
        return null;
      }

      return ride;
    } catch (error: any) {
      logger.error('Get ride by ID error:', error);
      return null;
    }
  }

  /**
   * Cancel ride with proper state validation and payment release
   */
  async cancelRide(
    rideId: string,
    userId: string,
    reason: string
  ): Promise<{ success: boolean; error?: string; cancellationFee?: number }> {
    try {
      // Get ride details
      const ride = await this.getRideById(rideId);
      if (!ride) {
        return { success: false, error: 'Ride not found' };
      }

      if (ride.user_id !== userId) {
        return { success: false, error: 'Unauthorized to cancel this ride' };
      }

      const currentStatus = ride.status as RideStatus;

      // Check if ride can be cancelled
      if (!RideStateMachineService.canBeCancelled(currentStatus)) {
        return { 
          success: false, 
          error: `Ride cannot be cancelled in ${currentStatus} status` 
        };
      }

      // Get cancellation fee policy
      const feePolicy = RideStateMachineService.getCancellationFeePolicy(currentStatus);
      let cancellationFee = 0;

      if (feePolicy.feeApplies) {
        cancellationFee = (ride.estimated_fare * feePolicy.feePercentage) / 100;
      }

      // Update ride status to cancelled
      const statusUpdate = await this.updateRideStatus(
        rideId,
        RideStatus.CANCELLED,
        reason,
        {
          cancelled_by: 'user',
          cancellation_fee: cancellationFee,
          fee_policy: feePolicy,
        }
      );

      if (!statusUpdate.success) {
        return { success: false, error: statusUpdate.error };
      }

      // Handle payment based on cancellation fee
      if (ride.payment_hold_id) {
        if (cancellationFee > 0) {
          // Convert partial amount to payment (cancellation fee)
          await this.paymentService.convertHoldToPayment({
            holdId: ride.payment_hold_id,
            actualAmount: cancellationFee,
            description: `Cancellation fee for ride ${rideId}`,
            metadata: {
              cancellation_reason: reason,
              original_fare: ride.estimated_fare,
            },
          });
        } else {
          // Release full payment hold
          await this.paymentService.releasePaymentHold({
            holdId: ride.payment_hold_id,
            reason: `Ride cancelled: ${reason}`,
          });
        }
      }

      logger.info('Ride cancelled successfully:', {
        rideId,
        userId,
        reason,
        cancellationFee,
        status: currentStatus,
      });

      return {
        success: true,
        cancellationFee: cancellationFee > 0 ? cancellationFee : undefined,
      };
    } catch (error: any) {
      logger.error('Cancel ride error:', error);
      return { success: false, error: 'Failed to cancel ride' };
    }
  }
}