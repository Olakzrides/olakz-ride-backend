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
   * Create a new ride with transaction atomicity and balance verification (Database function approach)
   */
  async createRide(data: {
    cart_id?: string;
    user_id: string;
    variant_id: string;
    pickup_location: Location;
    dropoff_location: Location;
    estimated_distance: number;
    estimated_duration: number;
    estimated_fare: number;
    currency_code: string;
    payment_method: string;
    scheduled_at?: Date | null;
    metadata?: any;
  }): Promise<{ success: boolean; ride?: any; error?: string; errorCode?: string }> {
    try {
      // Use database function for atomic transaction
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
        // Handle specific error cases
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

      logger.info('Ride created successfully with payment hold:', {
        rideId: rideResult.ride_id,
        userId: data.user_id,
        fare: data.estimated_fare,
        paymentHoldId: rideResult.payment_hold_id,
      });

      // Start driver matching if not scheduled
      if (!data.scheduled_at && this.rideMatchingService) {
        // Get vehicle type for driver matching
        const { data: variant } = await supabase
          .from('ride_variants')
          .select('vehicle_type_id')
          .eq('id', data.variant_id)
          .single();

        if (variant) {
          await this.rideMatchingService.findAndNotifyDriversForRide(rideResult.ride_id, {
            pickupLatitude: data.pickup_location.latitude,
            pickupLongitude: data.pickup_location.longitude,
            vehicleTypeId: variant.vehicle_type_id,
            maxDistance: 15, // 15km radius
            maxDrivers: 5,
          });
        }
      }

      return {
        success: true,
        ride: {
          id: rideResult.ride_id,
          status: RideStatus.SEARCHING,
          payment_hold_id: rideResult.payment_hold_id,
          estimated_fare: data.estimated_fare,
          created_at: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      logger.error('Create ride error:', error);
      return {
        success: false,
        error: 'Failed to create ride',
        errorCode: 'INTERNAL_ERROR',
      };
    }
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