import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { RideStateMachineService, RideStatus } from './ride-state-machine.service';
import { PaymentService } from './payment.service';
import { DriverAvailabilityService } from './driver-availability.service';
import { PushNotificationService } from './push-notification.service';
import { LocationHistoryService } from './location-history.service';
import { FareService } from './fare.service';
import { RemittanceService } from './remittance.service';
import { MapsUtil } from '../utils/maps.util';

interface Location {
  latitude: number;
  longitude: number;
  address?: string;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}

export class DriverRideService {
  private paymentService: PaymentService;
  private availabilityService: DriverAvailabilityService;
  private pushService: PushNotificationService;
  private locationHistoryService: LocationHistoryService;

  constructor() {
    this.paymentService = new PaymentService();
    this.availabilityService = new DriverAvailabilityService();
    this.pushService = PushNotificationService.getInstance();
    this.locationHistoryService = new LocationHistoryService();
  }

  /**
   * Accept a ride request
   */
  async acceptRideRequest(
    driverId: string,
    rideRequestId: string
  ): Promise<{
    success: boolean;
    ride?: any;
    error?: string;
    errorCode?: string;
  }> {
    try {
      // Check if driver is remittance-blocked before allowing acceptance
      const remittanceStatus = await RemittanceService.getRemittanceStatus(driverId);
      if (remittanceStatus.blocked) {
        return {
          success: false,
          error: `You cannot accept rides until you clear your outstanding platform remittance of ₦${remittanceStatus.pendingAmount.toLocaleString()}. Please top up your wallet to settle this amount.`,
          errorCode: 'OUTSTANDING_REMITTANCE',
        };
      }

      // Get ride request details
      const { data: rideRequest, error: fetchError } = await supabase
        .from('ride_requests')
        .select('ride_id, status')
        .eq('id', rideRequestId)
        .eq('driver_id', driverId)
        .single();

      if (fetchError || !rideRequest) {
        return {
          success: false,
          error: 'Ride request not found',
          errorCode: 'REQUEST_NOT_FOUND',
        };
      }

      // Check if request is still pending
      if (rideRequest.status !== 'pending') {
        return {
          success: false,
          error: 'Ride request is no longer available',
          errorCode: 'REQUEST_NO_LONGER_AVAILABLE',
        };
      }

      const rideId = rideRequest.ride_id;

      // Check if ride is still searching
      const { data: ride } = await supabase
        .from('rides')
        .select('status, driver_id')
        .eq('id', rideId)
        .single();

      if (!ride || ride.status !== 'searching') {
        return {
          success: false,
          error: 'Ride is no longer available',
          errorCode: 'REQUEST_NO_LONGER_AVAILABLE',
        };
      }

      // Atomic update: Accept request and assign driver to ride
      const { error: updateRequestError } = await supabase
        .from('ride_requests')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('id', rideRequestId)
        .eq('status', 'pending'); // Only update if still pending

      if (updateRequestError) {
        logger.error('Error accepting ride request:', updateRequestError);
        return {
          success: false,
          error: 'Failed to accept ride request',
          errorCode: 'ACCEPTANCE_FAILED',
        };
      }

      // Update ride with driver assignment
      const { data: updatedRide, error: updateRideError } = await supabase
        .from('rides')
        .update({
          driver_id: driverId,
          status: RideStatus.DRIVER_ASSIGNED,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId)
        .eq('status', 'searching') // Only update if still searching
        .select()
        .single();

      if (updateRideError || !updatedRide) {
        logger.error('Error assigning driver to ride:', updateRideError);
        return {
          success: false,
          error: 'Failed to assign driver to ride',
          errorCode: 'ASSIGNMENT_FAILED',
        };
      }

      // Cancel all other pending requests for this ride
      await supabase
        .from('ride_requests')
        .update({
          status: 'cancelled',
          responded_at: new Date().toISOString(),
        })
        .eq('ride_id', rideId)
        .neq('id', rideRequestId)
        .eq('status', 'pending');

      // Set driver as unavailable
      await this.availabilityService.setAvailable(driverId, false);

      // Create status update record
      await supabase.from('ride_status_updates').insert({
        ride_id: rideId,
        status: RideStatus.DRIVER_ASSIGNED,
        previous_status: 'searching',
        updated_by: driverId,
        updated_by_type: 'driver',
        message: 'Driver accepted ride request',
      });

      // Get driver details for notification
      const { data: driver } = await supabase
        .from('drivers')
        .select('user_id')
        .eq('id', driverId)
        .single();

      const { data: driverUser } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', driver?.user_id)
        .single();

      const driverName = driverUser 
        ? `${driverUser.first_name} ${driverUser.last_name}`
        : 'Your driver';

      // Send push notification to passenger
      await this.pushService.sendRideNotification(
        updatedRide.user_id,
        rideId,
        'driver_assigned',
        {
          driverId,
          driverName,
        }
      );

      logger.info(`Driver ${driverId} accepted ride ${rideId}`);

      return {
        success: true,
        ride: updatedRide,
      };
    } catch (error: any) {
      logger.error('Accept ride request error:', error);
      return {
        success: false,
        error: 'Failed to accept ride request',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * Cancel a ride — only allowed from driver_assigned or driver_arrived (not in_progress).
   * Full refund to customer. Ride goes back to searching and re-triggers matching.
   * driver_cancellation_count on the driver record is incremented for tracking.
   */
  async cancelRide(
    driverId: string,
    rideId: string,
    reason?: string
  ): Promise<{
    success: boolean;
    error?: string;
    errorCode?: string;
  }> {
    try {
      // Fetch full ride details
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select(`
          id, status, driver_id, user_id, payment_hold_id, payment_method,
          pickup_latitude, pickup_longitude, variant_id,
          variant:ride_variants(title)
        `)
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found', errorCode: 'RIDE_NOT_FOUND' };
      }

      if (ride.driver_id !== driverId) {
        return { success: false, error: 'Unauthorized', errorCode: 'UNAUTHORIZED' };
      }

      // Only allow cancel from driver_assigned or driver_arrived — not in_progress
      const allowedStatuses = [RideStatus.DRIVER_ASSIGNED, RideStatus.DRIVER_ARRIVED];
      if (!allowedStatuses.includes(ride.status as RideStatus)) {
        return {
          success: false,
          error: `Cannot cancel ride with status '${ride.status}'. Cancellation is only allowed before the trip starts.`,
          errorCode: 'INVALID_STATUS',
        };
      }

      // ── 1. Release payment hold (full refund) ────────────────────────────────
      // Only wallet rides have a payment hold to release
      if (ride.payment_method === 'wallet' && ride.payment_hold_id) {
        try {
          await this.paymentService.releasePaymentHold({
            holdId: ride.payment_hold_id,
            reason: reason || 'Driver cancelled before trip started',
          });
        } catch (holdErr: any) {
          logger.error(`Failed to release payment hold for ride ${rideId}:`, holdErr);
          // Non-fatal — continue so the ride still transitions to re-matching
        }
      }

      // ── 2. Unassign driver, put ride back to searching ───────────────────────
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          status:     RideStatus.SEARCHING,
          driver_id:  null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error resetting ride to searching after driver cancel:', updateError);
        return { success: false, error: 'Failed to cancel ride', errorCode: 'UPDATE_FAILED' };
      }

      // ── 3. Record status history ─────────────────────────────────────────────
      await supabase.from('ride_status_updates').insert({
        ride_id:         rideId,
        status:          RideStatus.SEARCHING,
        previous_status: ride.status,
        updated_by:      driverId,
        updated_by_type: 'driver',
        message:         reason || 'Driver cancelled — searching for new driver',
      });

      // ── 4. Set driver back to available ─────────────────────────────────────
      await this.availabilityService.setAvailable(driverId, true);

      // ── 5. Track driver_cancellation_count (no blocking, just tracking) ──────
      await supabase.rpc('increment_driver_cancellation_count', { p_driver_id: driverId })
        .then(({ error: rpcErr }) => {
          if (rpcErr) {
            // Non-fatal — column may not exist yet; log and continue
            logger.warn(`increment_driver_cancellation_count failed for driver ${driverId}:`, rpcErr.message);
          }
        });

      // ── 6. Notify customer via socket ────────────────────────────────────────
      try {
        const { socketService } = await import('../index');
        if (socketService) {
          await socketService.emitToCustomer(ride.user_id, 'ride:driver:cancelled', {
            rideId,
            reason: 'driver_cancelled',
            message: 'Your driver cancelled. We are finding you a new driver.',
          });
        }
      } catch (socketErr) {
        logger.warn('Socket notify on driver cancel failed (non-fatal):', socketErr);
      }

      // Send push notification to customer
      await this.pushService.sendRideNotification(
        ride.user_id,
        rideId,
        'ride_cancelled',
        { reason: 'Your driver cancelled. We are searching for a new driver.' }
      );

      // ── 7. Re-trigger matching ───────────────────────────────────────────────
      this.retriggerMatching(rideId, ride).catch((err) =>
        logger.error(`Re-matching after driver cancel failed for ride ${rideId}:`, err)
      );

      logger.info(`Driver ${driverId} cancelled ride ${rideId} — ride back to searching`);

      return { success: true };
    } catch (error: any) {
      logger.error('Cancel ride error:', error);
      return { success: false, error: 'Failed to cancel ride', errorCode: 'INTERNAL_ERROR' };
    }
  }

  /**
   * Re-trigger driver matching after a driver cancels.
   * Resolves serviceTierId from variant title the same way ride.service.ts does.
   */
  private async retriggerMatching(rideId: string, ride: any): Promise<void> {
    try {
      const { rideMatchingService } = await import('../index');
      if (!rideMatchingService) {
        logger.warn(`RideMatchingService not available — ride ${rideId} stays in searching`);
        return;
      }

      const variantTitle = (ride.variant?.title || '').toLowerCase();
      const serviceTierMap: Record<string, string> = {
        standard: '00000000-0000-0000-0000-000000000011',
        premium:  '00000000-0000-0000-0000-000000000012',
        vip:      '00000000-0000-0000-0000-000000000013',
      };
      const serviceTierId = serviceTierMap[variantTitle] || serviceTierMap['standard'];

      const result = await rideMatchingService.findAndNotifyDriversForRide(rideId, {
        pickupLatitude:  parseFloat(ride.pickup_latitude),
        pickupLongitude: parseFloat(ride.pickup_longitude),
        serviceTierId,
        maxDistance: 30,
        maxDrivers:  10,
      });

      logger.info(`Re-matching after driver cancel: notified ${result.driversNotified} drivers for ride ${rideId}`);
    } catch (err) {
      logger.error(`retriggerMatching error for ride ${rideId}:`, err);
    }
  }

  /**
   * Decline a ride request
   */
  async declineRideRequest(
    driverId: string,
    rideRequestId: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { error } = await supabase
        .from('ride_requests')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', rideRequestId)
        .eq('driver_id', driverId)
        .eq('status', 'pending');

      if (error) {
        logger.error('Error declining ride request:', error);
        return { success: false, error: 'Failed to decline ride request' };
      }

      logger.info(`Driver ${driverId} declined ride request ${rideRequestId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Decline ride request error:', error);
      return { success: false, error: 'Failed to decline ride request' };
    }
  }

  /**
   * Mark arrival at pickup location
   */
  async markArrived(
    driverId: string,
    rideId: string
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Get current ride status
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('status, driver_id')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      if (ride.driver_id !== driverId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate state transition
      const transitionValidation = RideStateMachineService.validateTransition({
        from: ride.status as RideStatus,
        to: RideStatus.DRIVER_ARRIVED,
        reason: 'Driver arrived at pickup',
      });

      if (!transitionValidation.isValid) {
        return { success: false, error: transitionValidation.error };
      }

      // Update ride status
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          status: RideStatus.DRIVER_ARRIVED,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error marking arrived:', updateError);
        return { success: false, error: 'Failed to mark arrived' };
      }

      // Create status update record
      await supabase.from('ride_status_updates').insert({
        ride_id: rideId,
        status: RideStatus.DRIVER_ARRIVED,
        previous_status: ride.status,
        updated_by: driverId,
        updated_by_type: 'driver',
        message: 'Driver arrived at pickup location',
      });

      // Get ride and driver details for notification
      const { data: rideData } = await supabase
        .from('rides')
        .select('user_id')
        .eq('id', rideId)
        .single();

      const { data: driver } = await supabase
        .from('drivers')
        .select('user_id')
        .eq('id', driverId)
        .single();

      const { data: driverUser } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', driver?.user_id)
        .single();

      const driverName = driverUser 
        ? `${driverUser.first_name} ${driverUser.last_name}`
        : 'Your driver';

      // Send push notification to passenger
      if (rideData) {
        await this.pushService.sendRideNotification(
          rideData.user_id,
          rideId,
          'driver_arrived',
          {
            driverId,
            driverName,
          }
        );
      }

      logger.info(`Driver ${driverId} marked arrived for ride ${rideId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Mark arrived error:', error);
      return { success: false, error: 'Failed to mark arrived' };
    }
  }

  /**
   * Start trip
   */
  async startTrip(
    driverId: string,
    rideId: string,
    location: Location
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Get current ride status
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('status, driver_id')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      if (ride.driver_id !== driverId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate state transition
      const transitionValidation = RideStateMachineService.validateTransition({
        from: ride.status as RideStatus,
        to: RideStatus.IN_PROGRESS,
        reason: 'Driver started trip',
      });

      if (!transitionValidation.isValid) {
        return { success: false, error: transitionValidation.error };
      }

      // Update ride status
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          status: RideStatus.IN_PROGRESS,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error starting trip:', updateError);
        return { success: false, error: 'Failed to start trip' };
      }

      // Create status update record
      await supabase.from('ride_status_updates').insert({
        ride_id: rideId,
        status: RideStatus.IN_PROGRESS,
        previous_status: ride.status,
        updated_by: driverId,
        updated_by_type: 'driver',
        message: 'Trip started',
        location: location,
      });

      // Get ride details for notification
      const { data: rideData } = await supabase
        .from('rides')
        .select('user_id')
        .eq('id', rideId)
        .single();

      // Send push notification to passenger
      if (rideData) {
        await this.pushService.sendRideNotification(
          rideData.user_id,
          rideId,
          'ride_started',
          {}
        );
      }

      logger.info(`Driver ${driverId} started trip ${rideId}`);

      return { success: true };
    } catch (error: any) {
      logger.error('Start trip error:', error);
      return { success: false, error: 'Failed to start trip' };
    }
  }

  /**
   * Complete trip
   */
  async completeTrip(
    driverId: string,
    rideId: string,
    data: {
      actualDistance: number;
      actualDuration: number;
      endLocation: Location;
    }
  ): Promise<{
    success: boolean;
    finalFare?: number;
    finalDriverFare?: number;
    paymentMethod?: string;
    platformRemittance?: number;
    remittanceStatus?: {
      status: 'auto_deducted' | 'pending' | 'settled';
      blocked: boolean;
      pendingAmount: number;
      pendingCount: number;
    } | null;
    error?: string;
  }> {
    try {
      // Get current ride details
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('*, variant:ride_variants(id, base_price, price_per_km, price_per_minute, minimum_fare)')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      if (ride.driver_id !== driverId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Validate state transition
      const transitionValidation = RideStateMachineService.validateTransition({
        from: ride.status as RideStatus,
        to: RideStatus.COMPLETED,
        reason: 'Driver completed trip',
      });

      if (!transitionValidation.isValid) {
        return { success: false, error: transitionValidation.error };
      }

      const fareService = new FareService();

      // Resolve pickup state from the stored pickup address for city-tier pricing
      // This ensures completion fare uses the same city tier as the booking fare
      const pickupState = MapsUtil.extractStateFromAddress(ride.pickup_address ?? '') ?? undefined;

      logger.info('completeTrip: resolving city tier for fare', {
        rideId,
        pickupAddress: ride.pickup_address,
        pickupState,
      });

      const fareResult = await fareService.calculateCompletionFare({
        variantId: (ride.variant as any)?.id ?? ride.variant_id,
        actualDistance: data.actualDistance,
        bookingType: ride.booking_type ?? 'for_me',
        pickupState,
      });

      const finalFare       = fareResult.totalFare;
      const finalDriverFare = fareResult.driverFare;

      // Update ride with completion details including fare breakdown
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          status: RideStatus.COMPLETED,
          completed_at: new Date().toISOString(),
          actual_distance: data.actualDistance,
          actual_duration: data.actualDuration,
          final_fare: finalFare,
          final_driver_fare: finalDriverFare,
          service_fee: fareResult.serviceFee,
          rounding_fee: fareResult.roundingFee,
          shared_discount: fareResult.sharedDiscount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error completing trip:', updateError);
        return { success: false, error: 'Failed to complete trip' };
      }

      // Convert payment hold to actual payment using customer total
      const { data: holdTransaction } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('ride_id', rideId)
        .eq('transaction_type', 'hold')
        .eq('status', 'hold')
        .single();

      if (holdTransaction) {
        await this.paymentService.convertHoldToPayment({
          holdId: holdTransaction.id,
          actualAmount: finalFare,
          description: `Payment for ride ${rideId}`,
          metadata: {
            ride_id: rideId,
            driver_id: driverId,
            actual_distance: data.actualDistance,
            actual_duration: data.actualDuration,
            driver_fare: finalDriverFare,
            service_fee: fareResult.serviceFee,
          },
        });

        // Credit driver's wallet with their earnings (wallet rides only)
        // Cash drivers keep the physical cash — no wallet credit needed for cash rides
        if (ride.payment_method === 'wallet') {
          try {
            // Get driver's user_id
            const { data: driverRecord } = await supabase
              .from('drivers')
              .select('user_id')
              .eq('id', driverId)
              .single();

            if (driverRecord?.user_id) {
              const earningReference = `earning_ride_${rideId}_${Date.now()}`;

              // Credit driver wallet via payment-service internal API
              await this.paymentService.creditWallet({
                userId: driverRecord.user_id,
                amount: finalDriverFare,
                currencyCode: ride.currency_code || 'NGN',
                reference: earningReference,
                description: `Ride earnings - ${rideId}`,
                transactionType: 'earning',
              });

              // Update driver's total_earnings record
              await supabase.rpc('increment_driver_earnings', {
                p_driver_id: driverId,
                p_amount: finalDriverFare,
              });

              logger.info(`Driver ${driverId} credited ₦${finalDriverFare} for ride ${rideId}`);
            } else {
              logger.error(`Could not find user_id for driver ${driverId} — earnings not credited`);
            }
          } catch (earningError: any) {
            // Log but don't fail the ride completion — the ride is already marked complete
            logger.error(`Failed to credit driver earnings for ride ${rideId}:`, earningError);
          }
        }
      } else {
        logger.warn('No payment hold found for ride:', { rideId });
      }

      // Set driver as available again
      await this.availabilityService.setAvailable(driverId, true);

      // For cash rides: remittance is NOT processed here.
      // The driver must explicitly confirm cash receipt via
      // POST /api/drivers/rides/:rideId/confirm-cash-payment
      // Only then is handleCashRideRemittance called.
      if (ride.payment_method === 'cash') {
        logger.info(`Cash ride ${rideId} completed — awaiting driver cash confirmation before remittance`);
      }

      // Create status update record
      await supabase.from('ride_status_updates').insert({
        ride_id: rideId,
        status: RideStatus.COMPLETED,
        previous_status: ride.status,
        updated_by: driverId,
        updated_by_type: 'driver',
        message: 'Trip completed',
        location: data.endLocation,
      });

      // Send push notification to passenger with customer-facing total
      await this.pushService.sendRideNotification(
        ride.user_id,
        rideId,
        'ride_completed',
        { finalFare: finalFare.toString() }
      );

      // Record location visits
      if (ride.pickup_address) {
        await this.locationHistoryService.recordLocationVisit(
          ride.user_id, 'pickup',
          { latitude: parseFloat(ride.pickup_latitude), longitude: parseFloat(ride.pickup_longitude), address: ride.pickup_address }
        );
      }
      if (ride.dropoff_address) {
        await this.locationHistoryService.recordLocationVisit(
          ride.user_id, 'dropoff',
          { latitude: parseFloat(ride.dropoff_latitude), longitude: parseFloat(ride.dropoff_longitude), address: ride.dropoff_address }
        );
      }

      logger.info(`Driver ${driverId} completed trip ${rideId} — customer: ₦${finalFare}, driver: ₦${finalDriverFare}`);

      return {
        success: true,
        finalFare,
        finalDriverFare,
        paymentMethod: ride.payment_method,
        platformRemittance: ride.payment_method === 'cash'
          ? fareResult.serviceFee + fareResult.roundingFee + fareResult.bookingFee
          : undefined,
      };
    } catch (error: any) {
      logger.error('Complete trip error:', error);
      return { success: false, error: 'Failed to complete trip' };
    }
  }

  /**
   * Confirm cash payment received from customer.
   * Only valid for completed cash rides.
   * Triggers remittance processing after confirmation.
   */
  async confirmCashPayment(
    driverId: string,
    rideId: string
  ): Promise<{
    success: boolean;
    remittanceStatus?: {
      status: 'auto_deducted' | 'pending' | 'settled';
      blocked: boolean;
      pendingAmount: number;
      pendingCount: number;
    };
    error?: string;
  }> {
    try {
      // Fetch the ride
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('id, driver_id, status, payment_method, cash_payment_confirmed, service_fee, rounding_fee, final_fare, estimated_fare')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      // Must be the assigned driver
      if (ride.driver_id !== driverId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Must be a cash ride
      if (ride.payment_method !== 'cash') {
        return { success: false, error: 'This endpoint is only for cash rides' };
      }

      // Must be completed
      if (ride.status !== 'completed') {
        return { success: false, error: 'Ride must be completed before confirming cash payment' };
      }

      // Prevent double confirmation
      if (ride.cash_payment_confirmed) {
        return { success: false, error: 'Cash payment already confirmed for this ride' };
      }

      // Mark cash as confirmed and update payment_status to 'completed'
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          cash_payment_confirmed: true,
          cash_payment_confirmed_at: new Date().toISOString(),
          payment_status: 'completed',   // cash received — payment is now complete
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error confirming cash payment:', updateError);
        return { success: false, error: 'Failed to confirm cash payment' };
      }

      // Record cash payment confirmation in ride_status_updates
      await supabase.from('ride_status_updates').insert({
        ride_id:          rideId,
        status:           'cash_payment_confirmed',
        previous_status:  'completed',
        updated_by:       driverId,
        updated_by_type:  'driver',
        message:          'Driver confirmed cash payment received from customer',
        metadata:         { payment_method: 'cash', confirmed_by_driver: driverId },
      });

      // Now process remittance — booking_fee is not stored on rides, only service_fee and rounding_fee
      const platformRemittance =
        Number(ride.service_fee ?? 0) +
        Number(ride.rounding_fee ?? 0);

      const remittanceResult = await RemittanceService.handleCashRideRemittance({
        driverId,
        rideId,
        platformRemittance,
      });

      logger.info(`Driver ${driverId} confirmed cash payment for ride ${rideId}. Remittance:`, remittanceResult);

      return {
        success: true,
        remittanceStatus: {
          status: remittanceResult.status,
          blocked: remittanceResult.blocked,
          pendingAmount: remittanceResult.pendingAmount,
          pendingCount: remittanceResult.pendingCount,
        },
      };
    } catch (error: any) {
      logger.error('Confirm cash payment error:', error);
      return { success: false, error: 'Failed to confirm cash payment' };
    }
  }

  /**
   * Get driver's active ride
   */
  async getActiveRide(driverId: string): Promise<any | null> {
    try {
      const activeStatuses = [
        RideStatus.DRIVER_ASSIGNED,
        RideStatus.DRIVER_ARRIVED,
        RideStatus.IN_PROGRESS,
      ];

      const { data: ride, error } = await supabase
        .from('rides')
        .select(`
          *,
          variant:ride_variants(
            title,
            vehicle_type:vehicle_types(name, display_name)
          )
        `)
        .eq('driver_id', driverId)
        .in('status', activeStatuses)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Get active ride error:', error);
        return null;
      }

      return ride || null;
    } catch (error: any) {
      logger.error('Get active ride error:', error);
      return null;
    }
  }

  /**
   * Get driver's ride history
   */
  async getRideHistory(
    driverId: string,
    options: PaginationOptions = {}
  ): Promise<{
    rides: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('rides')
        .select(`
          id,
          status,
          pickup_address,
          dropoff_address,
          final_fare,
          estimated_fare,
          actual_distance,
          actual_duration,
          started_at,
          completed_at,
          cancelled_at,
          driver_rating,
          driver_feedback,
          created_at,
          variant:ride_variants(
            title,
            vehicle_type:vehicle_types(name, display_name)
          )
        `, { count: 'exact' })
        .eq('driver_id', driverId)
        .in('status', ['completed', 'cancelled']);

      // Apply date filters if provided
      if (options.startDate) {
        query = query.gte('created_at', options.startDate.toISOString());
      }
      if (options.endDate) {
        query = query.lte('created_at', options.endDate.toISOString());
      }

      const { data: rides, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Get ride history error:', error);
        return { rides: [], total: 0, page, limit };
      }

      return {
        rides: rides || [],
        total: count || 0,
        page,
        limit,
      };
    } catch (error: any) {
      logger.error('Get ride history error:', error);
      return { rides: [], total: 0, page: options.page || 1, limit: options.limit || 20 };
    }
  }

  /**
   * Get pending ride requests for driver
   */
  async getPendingRequests(driverId: string): Promise<any[]> {
    try {
      const { data: requests, error } = await supabase
        .from('ride_requests')
        .select(`
          id,
          ride_id,
          status,
          expires_at,
          distance_from_pickup,
          estimated_arrival,
          created_at,
          ride:rides(
            id,
            user_id,
            status,
            pickup_latitude,
            pickup_longitude,
            pickup_address,
            dropoff_latitude,
            dropoff_longitude,
            dropoff_address,
            estimated_fare,
            estimated_distance,
            estimated_duration,
            payment_method,
            driver_fare,
            service_fee,
            rounding_fee
          )
        `)
        .eq('driver_id', driverId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Get pending requests error:', error);
        return [];
      }

      if (!requests || requests.length === 0) return [];

      // Filter out requests where the ride is no longer searching
      // (cancelled, accepted by another driver, completed, etc.)
      const activeRequests = requests.filter(
        (r: any) => r.ride?.status === 'searching'
      );

      // Collect all unique customer user_ids from the active rides
      const userIds = [
        ...new Set(
          activeRequests
            .map((r: any) => r.ride?.user_id)
            .filter(Boolean) as string[]
        ),
      ];

      // Fetch customer details in one query
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, phone, avatar_url')
        .in('id', userIds);

      const userMap = new Map<string, any>();
      for (const u of users ?? []) {
        userMap.set(u.id, u);
      }

      // Enrich each request with customer name
      return activeRequests.map((r: any) => {
        const userId = r.ride?.user_id;
        const user = userId ? userMap.get(userId) : null;
        const customerName = user
          ? (
              `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() ||
              (user.email ? user.email.split('@')[0] : null) ||
              'Customer'
            )
          : 'Customer';

        const isCash = r.ride?.payment_method === 'cash';
        const serviceFee         = Number(r.ride?.service_fee  ?? 0);
        const roundingFee        = Number(r.ride?.rounding_fee ?? 0);
        // booking_fee is not a column on rides — remittance is service_fee + rounding_fee only
        const platformRemittance = serviceFee + roundingFee;

        // Strip raw fare/identity fields from ride — driver should not see them directly
        const { service_fee, rounding_fee, driver_fare, estimated_fare, payment_method, user_id, ...ridePublic } = r.ride ?? {};

        return {
          id: r.id,
          ride_id: r.ride_id,
          status: r.status,
          expires_at: r.expires_at,
          distance_from_pickup: r.distance_from_pickup,
          estimated_arrival: r.estimated_arrival,
          created_at: r.created_at,
          ride: ridePublic,
          customer: {
            name: customerName,
            phone: user?.phone ?? null,
            photo: user?.avatar_url ?? null,
          },
          payment_method: r.ride?.payment_method ?? null,
          fare: {
            driver_fare: Number(r.ride?.driver_fare ?? 0),
            currency: 'NGN',
            ...(isCash ? {
              collect_from_customer: Number(r.ride?.estimated_fare ?? 0),
              platform_remittance: platformRemittance,
            } : {}),
          },
        };
      });
    } catch (error: any) {
      logger.error('Get pending requests error:', error);
      return [];
    }
  }
}
