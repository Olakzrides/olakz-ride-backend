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
  /**
   * Accept a ride request.
   *
   * Supports two modes:
   *
   * A) Push-based (original): driver was dispatched a ride_requests row.
   *    Call with rideRequestId set, rideId omitted.
   *    Resolves ride ID from the existing ride_requests row.
   *
   * B) Pull-based (new): driver found the ride by polling /rides/pending.
   *    Call with rideId set, rideRequestId omitted (or null).
   *    Creates a ride_requests row on the fly then proceeds with the same
   *    acceptance logic, ensuring the race-condition guard (.eq('status','searching'))
   *    still prevents two drivers accepting simultaneously.
   */
  async acceptRideRequest(
    driverId: string,
    rideRequestId: string | null,
    rideId?: string,
  ): Promise<{
    success: boolean;
    ride?: any;
    error?: string;
    errorCode?: string;
  }> {
    try {
      // ── Guard: remittance block ───────────────────────────────────────────
      const remittanceStatus = await RemittanceService.getRemittanceStatus(driverId);
      if (remittanceStatus.blocked) {
        return {
          success: false,
          error: `You cannot accept rides until you clear your outstanding platform remittance of ₦${remittanceStatus.pendingAmount.toLocaleString()}. Please top up your wallet to settle this amount.`,
          errorCode: 'OUTSTANDING_REMITTANCE',
        };
      }

      // ── Step 1: Resolve the ride ID and ensure a ride_requests row exists ─
      let resolvedRideId: string;
      let resolvedRequestId: string;

      if (rideRequestId) {
        // ── Mode A: push-based — ride_requests row already exists ──────────
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

        if (rideRequest.status !== 'pending') {
          return {
            success: false,
            error: 'Ride request is no longer available',
            errorCode: 'REQUEST_NO_LONGER_AVAILABLE',
          };
        }

        resolvedRideId    = rideRequest.ride_id;
        resolvedRequestId = rideRequestId;

      } else if (rideId) {
        // ── Mode B: pull-based — driver found ride via pending poll ─────────
        // Check if a ride_requests row already exists for this driver + ride
        // (e.g. they were dispatched earlier but the row expired, or it's fresh).
        const { data: existingReq } = await supabase
          .from('ride_requests')
          .select('id, status')
          .eq('ride_id', rideId)
          .eq('driver_id', driverId)
          .maybeSingle();

        if (existingReq) {
          // Row exists — check it hasn't been declined/cancelled
          if (['declined', 'cancelled'].includes(existingReq.status)) {
            return {
              success: false,
              error: 'Ride request is no longer available',
              errorCode: 'REQUEST_NO_LONGER_AVAILABLE',
            };
          }
          resolvedRequestId = existingReq.id;
        } else {
          // No row yet — create one on the fly so the rest of the flow is uniform.
          // Use a far-future expires_at so it doesn't expire before we mark accepted.
          const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

          // Compute distance from driver's last location for the row record
          let distanceFromPickup = 0;
          let estimatedArrival   = 0;

          const { data: rideForDistance } = await supabase
            .from('rides')
            .select('pickup_latitude, pickup_longitude')
            .eq('id', rideId)
            .single();

          const { data: driverLoc } = await supabase
            .from('driver_location_tracking')
            .select('latitude, longitude')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (rideForDistance && driverLoc) {
            distanceFromPickup = parseFloat(
              this.haversineKm(
                parseFloat(driverLoc.latitude),
                parseFloat(driverLoc.longitude),
                parseFloat(rideForDistance.pickup_latitude),
                parseFloat(rideForDistance.pickup_longitude),
              ).toFixed(2)
            );
            estimatedArrival = Math.ceil((distanceFromPickup / 30) * 60);
          }

          const { data: newReq, error: insertErr } = await supabase
            .from('ride_requests')
            .insert({
              ride_id:              rideId,
              driver_id:            driverId,
              status:               'pending',
              expires_at:           expiresAt,
              batch_number:         0, // 0 = pull-based, not part of any dispatch batch
              distance_from_pickup: distanceFromPickup,
              estimated_arrival:    estimatedArrival,
            })
            .select('id')
            .single();

          if (insertErr || !newReq) {
            logger.error('acceptRideRequest: failed to create pull-based ride_request row', insertErr);
            return {
              success: false,
              error: 'Failed to process ride acceptance',
              errorCode: 'ACCEPTANCE_FAILED',
            };
          }

          resolvedRequestId = newReq.id;
        }

        resolvedRideId = rideId;

      } else {
        return {
          success: false,
          error: 'Either rideRequestId or rideId must be provided',
          errorCode: 'INVALID_REQUEST',
        };
      }

      // ── Step 2: Verify the ride is still searching ────────────────────────
      const { data: ride } = await supabase
        .from('rides')
        .select('status, user_id')
        .eq('id', resolvedRideId)
        .single();

      if (!ride || ride.status !== 'searching') {
        return {
          success: false,
          error: 'Ride is no longer available',
          errorCode: 'REQUEST_NO_LONGER_AVAILABLE',
        };
      }

      // ── Step 3: Mark the ride_requests row as accepted ────────────────────
      const { error: updateRequestError } = await supabase
        .from('ride_requests')
        .update({
          status:       'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('id', resolvedRequestId)
        .eq('status', 'pending'); // race-condition guard

      if (updateRequestError) {
        logger.error('Error accepting ride request row:', updateRequestError);
        return {
          success: false,
          error: 'Failed to accept ride request',
          errorCode: 'ACCEPTANCE_FAILED',
        };
      }

      // ── Step 4: Atomically assign driver to ride ──────────────────────────
      // .eq('status', 'searching') ensures only one driver wins the race
      const { data: updatedRide, error: updateRideError } = await supabase
        .from('rides')
        .update({
          driver_id:  driverId,
          status:     RideStatus.DRIVER_ASSIGNED,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resolvedRideId)
        .eq('status', 'searching') // race-condition guard — only succeeds once
        .select()
        .single();

      if (updateRideError || !updatedRide) {
        // Another driver accepted first — roll back our request row to pending
        await supabase
          .from('ride_requests')
          .update({ status: 'cancelled', responded_at: new Date().toISOString() })
          .eq('id', resolvedRequestId);

        logger.warn(`acceptRideRequest: ride ${resolvedRideId} taken by another driver before ${driverId}`);
        return {
          success: false,
          error: 'Ride was just accepted by another driver',
          errorCode: 'REQUEST_NO_LONGER_AVAILABLE',
        };
      }

      // ── Step 5: Cancel all other pending requests for this ride ──────────
      await supabase
        .from('ride_requests')
        .update({
          status:       'cancelled',
          responded_at: new Date().toISOString(),
        })
        .eq('ride_id', resolvedRideId)
        .neq('id', resolvedRequestId)
        .eq('status', 'pending');

      // ── Step 6: Set driver unavailable ───────────────────────────────────
      await this.availabilityService.setAvailable(driverId, false);

      // ── Step 7: Record status history ────────────────────────────────────
      await supabase.from('ride_status_updates').insert({
        ride_id:         resolvedRideId,
        status:          RideStatus.DRIVER_ASSIGNED,
        previous_status: 'searching',
        updated_by:      driverId,
        updated_by_type: 'driver',
        message:         'Driver accepted ride request',
      });

      // ── Step 8: Push notification to passenger ───────────────────────────
      const { data: driverRecord } = await supabase
        .from('drivers')
        .select('user_id')
        .eq('id', driverId)
        .single();

      const { data: driverUser } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', driverRecord?.user_id)
        .single();

      const driverName = driverUser
        ? `${driverUser.first_name} ${driverUser.last_name}`
        : 'Your driver';

      await this.pushService.sendRideNotification(
        updatedRide.user_id,
        resolvedRideId,
        'driver_assigned',
        { driverId, driverName },
      );

      logger.info(`Driver ${driverId} accepted ride ${resolvedRideId} (request ${resolvedRequestId})`);

      return { success: true, ride: updatedRide };
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
      this.retriggerMatching(rideId, ride, driverId).catch((err) =>
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
   * Excludes the cancelling driver from the new broadcast.
   */
  private async retriggerMatching(rideId: string, ride: any, excludeDriverId: string): Promise<void> {
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

      const result = await rideMatchingService.findAndNotifyDriversForRide(
        rideId,
        {
          pickupLatitude:  parseFloat(ride.pickup_latitude),
          pickupLongitude: parseFloat(ride.pickup_longitude),
          serviceTierId,
          maxDistance: 30,
          maxDrivers:  10,
        },
        [excludeDriverId]   // exclude the cancelling driver
      );

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

  // ─────────────────────────────────────────────────────────────────────────────
  // Tier hierarchy (mirrors ride-matching.service.ts)
  // Standard driver  → can only see Standard rides
  // Premium driver   → can see Standard + Premium rides
  // VIP driver       → can see Standard + Premium + VIP rides
  // ─────────────────────────────────────────────────────────────────────────────
  private static readonly TIER_IDS = {
    standard: '00000000-0000-0000-0000-000000000011',
    premium:  '00000000-0000-0000-0000-000000000012',
    vip:      '00000000-0000-0000-0000-000000000013',
  } as const;

  /**
   * Given a driver's tier UUID return the list of ride variant tier UUIDs
   * they are eligible to serve.
   *
   * Standard driver  → Standard rides only
   * Premium driver   → Standard + Premium rides
   * VIP driver       → Standard + Premium + VIP rides
   */
  private getEligibleRideTierIds(driverTierId: string): string[] {
    const { standard, premium, vip } = DriverRideService.TIER_IDS;
    if (driverTierId === vip)     return [standard, premium, vip];
    if (driverTierId === premium) return [standard, premium];
    return [standard]; // standard driver — standard rides only
  }

  /**
   * Haversine distance between two coordinates (km).
   */
  private haversineKm(
    lat1: number, lon1: number,
    lat2: number, lon2: number,
  ): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Get pending ride requests for driver.
   *
   * Pull-based model: queries the rides table directly for any ride in
   * 'searching' status that matches the driver's eligible service tiers and
   * is within the search radius. Does NOT require a prior ride_requests row —
   * drivers who were offline when the ride was created can still see and
   * accept it as long as it is still searching.
   *
   * GET /api/drivers/rides/pending?latitude=X&longitude=Y
   */
  async getPendingRequests(
    driverId: string,
    driverLatitude?: number,
    driverLongitude?: number,
  ): Promise<any[]> {
    const PULL_RADIUS_KM = 30; // same radius used at dispatch time

    try {
      // ── 1. Fetch driver profile: tier + last known location ───────────────
      const { data: driver, error: driverErr } = await supabase
        .from('drivers')
        .select('id, service_tier_id, status')
        .eq('id', driverId)
        .single();

      if (driverErr || !driver) {
        logger.error('getPendingRequests: driver not found', driverErr);
        return [];
      }

      // Driver must be approved to pull rides
      if (driver.status !== 'approved') {
        logger.info(`getPendingRequests: driver ${driverId} is not approved (status: ${driver.status})`);
        return [];
      }

      // ── 2. Resolve driver location ────────────────────────────────────────
      // Prefer freshly supplied coords from the request.
      // Fallback to DB only when no coords are supplied — and only if the
      // stored location is fresh (within the last 30 minutes). A stale DB
      // location could place the driver in the wrong area and show them rides
      // that are nowhere near them, or hide rides that are close.
      let driverLat = driverLatitude;
      let driverLng = driverLongitude;

      const LOCATION_STALENESS_MINUTES = 30;
      const stalenessThreshold = new Date(
        Date.now() - LOCATION_STALENESS_MINUTES * 60 * 1000
      ).toISOString();

      if (driverLat == null || driverLng == null) {
        // Only use DB location if it was recorded within the last 30 minutes
        const { data: tracking } = await supabase
          .from('driver_location_tracking')
          .select('latitude, longitude, created_at')
          .eq('driver_id', driverId)
          .gt('created_at', stalenessThreshold)   // freshness guard
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (tracking) {
          driverLat = parseFloat(tracking.latitude);
          driverLng = parseFloat(tracking.longitude);
          logger.info(`getPendingRequests: using DB location for driver ${driverId} (age < 30 min)`);
        } else {
          // Try driver_locations table as a second fallback — same freshness rule
          const { data: fallback } = await supabase
            .from('driver_locations')
            .select('latitude, longitude, created_at')
            .eq('driver_id', driverId)
            .gt('created_at', stalenessThreshold)  // freshness guard
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (fallback) {
            driverLat = parseFloat(fallback.latitude);
            driverLng = parseFloat(fallback.longitude);
            logger.info(`getPendingRequests: using fallback DB location for driver ${driverId} (age < 30 min)`);
          }
        }
      }

      if (driverLat == null || driverLng == null) {
        logger.warn(
          `getPendingRequests: no usable location for driver ${driverId} — ` +
          `either send lat/lng in the request or ensure location was updated within the last ${LOCATION_STALENESS_MINUTES} minutes`
        );
        return [];
      }

      // ── 3. Determine which ride tiers this driver can serve ───────────────
      const eligibleTierIds = this.getEligibleRideTierIds(driver.service_tier_id);

      // Map tier UUID → variant title so we can filter variants correctly.
      // ride_variants.title is 'Standard' | 'Premium' | 'VIP' (lowercase safe via ilike)
      // We join via ride_variants → vehicle_type_id which equals service_tier_id on drivers.
      // Actually variant_id on rides maps to ride_variants which has a vehicle_type_id.
      // The eligible check: ride.variant must belong to a vehicle_type whose id is in eligibleTierIds.

      // ── 4. Fetch all rides currently in 'searching' status ────────────────
      //    We pull searching rides, then filter by tier and radius in JS.
      //    This avoids a complex multi-join that Supabase/PostgREST struggles with.
      const { data: searchingRides, error: ridesErr } = await supabase
        .from('rides')
        .select(`
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
          rounding_fee,
          variant_id,
          created_at
        `)
        .eq('status', 'searching')
        .order('created_at', { ascending: false });

      if (ridesErr) {
        logger.error('getPendingRequests: error fetching searching rides', ridesErr);
        return [];
      }

      if (!searchingRides || searchingRides.length === 0) return [];

      // ── 5. Collect variant IDs and fetch variants with their vehicle_type_id ─
      const variantIds = [...new Set(searchingRides.map((r: any) => r.variant_id).filter(Boolean))] as string[];

      const variantMap = new Map<string, { vehicleTypeName: string; vehicleTypeId: string }>();
      if (variantIds.length > 0) {
        const { data: variants } = await supabase
          .from('ride_variants')
          .select('id, vehicle_type_id, vehicle_type:vehicle_types(id, name)')
          .in('id', variantIds);

        for (const v of variants ?? []) {
          const vt = (v as any).vehicle_type;
          variantMap.set(v.id, {
            vehicleTypeName: vt?.name || 'Standard',
            vehicleTypeId: v.vehicle_type_id,
          });
        }
      }

      // ── 6. Fetch ride_requests rows for this driver (to get existing request  ─
      //    IDs and to exclude rides they already declined).
      const rideIds = searchingRides.map((r: any) => r.id) as string[];
      const existingRequestMap = new Map<string, { id: string; status: string; expires_at: string; distance_from_pickup: number; estimated_arrival: number }>();

      if (rideIds.length > 0) {
        const { data: existingRequests } = await supabase
          .from('ride_requests')
          .select('id, ride_id, status, expires_at, distance_from_pickup, estimated_arrival')
          .eq('driver_id', driverId)
          .in('ride_id', rideIds);

        for (const req of existingRequests ?? []) {
          existingRequestMap.set(req.ride_id, req);
        }
      }

      // ── 7. Filter rides by tier eligibility + radius + declined exclusion ──
      const eligibleRides = searchingRides.filter((ride: any) => {
        const variant = variantMap.get(ride.variant_id);
        if (!variant) return false; // unknown variant — skip

        // Tier check: variant's vehicle_type_id must be in driver's eligible tiers
        if (!eligibleTierIds.includes(variant.vehicleTypeId)) return false;

        // Declined/cancelled exclusion: skip rides this driver already responded to
        const existingReq = existingRequestMap.get(ride.id);
        if (existingReq && ['declined', 'cancelled'].includes(existingReq.status)) return false;

        // Radius check
        const pickupLat = parseFloat(ride.pickup_latitude);
        const pickupLng = parseFloat(ride.pickup_longitude);
        const distKm = this.haversineKm(driverLat!, driverLng!, pickupLat, pickupLng);
        if (distKm > PULL_RADIUS_KM) return false;

        // Attach computed distance onto the ride object for use in the response
        (ride as any)._distanceKm = distKm;

        return true;
      });

      if (eligibleRides.length === 0) return [];

      // ── 8. Fetch customer details in one batch query ──────────────────────
      const userIds = [...new Set(eligibleRides.map((r: any) => r.user_id).filter(Boolean))] as string[];
      const userMap = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, last_name, email, phone, avatar_url')
          .in('id', userIds);

        for (const u of users ?? []) {
          userMap.set(u.id, u);
        }
      }

      // ── 9. Build response — same shape as before so frontend needs no changes ─
      return eligibleRides.map((ride: any) => {
        const user = userMap.get(ride.user_id) ?? null;
        const customerName = user
          ? (
              `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() ||
              (user.email ? user.email.split('@')[0] : null) ||
              'Customer'
            )
          : 'Customer';

        const distanceKm: number = (ride as any)._distanceKm ?? 0;
        const estimatedArrivalMin = Math.ceil((distanceKm / 30) * 60); // 30 km/h estimate

        const existingReq  = existingRequestMap.get(ride.id);
        const isCash       = ride.payment_method === 'cash';
        const serviceFee   = Number(ride.service_fee  ?? 0);
        const roundingFee  = Number(ride.rounding_fee ?? 0);
        const platformRemittance = serviceFee + roundingFee;

        // ride_request row may or may not exist yet for this driver
        // If it exists use its id and expires_at, otherwise use null id
        // (the accept endpoint will create the row on the fly if needed)
        const reqId       = existingReq?.id ?? null;
        const expiresAt   = existingReq?.expires_at ?? null;
        const distFromPickup = existingReq?.distance_from_pickup ?? parseFloat(distanceKm.toFixed(2));
        const estArrival     = existingReq?.estimated_arrival    ?? estimatedArrivalMin;

        const { service_fee, rounding_fee, driver_fare, estimated_fare, payment_method, user_id, variant_id, _distanceKm, ...ridePublic } = ride;

        return {
          // id is the ride_requests.id if it exists, else null.
          // The accept endpoint can receive either a request id or a ride id.
          id: reqId,
          ride_id: ride.id,
          status: 'pending',
          expires_at: expiresAt,
          distance_from_pickup: distFromPickup,
          estimated_arrival: estArrival,
          created_at: ride.created_at,
          ride: ridePublic,
          customer: {
            name: customerName,
            phone: user?.phone ?? null,
            photo: user?.avatar_url ?? null,
          },
          payment_method: ride.payment_method ?? null,
          vehicleType: variantMap.get(ride.variant_id)?.vehicleTypeName ?? 'Standard',
          fare: {
            driver_fare: Number(ride.driver_fare ?? 0),
            currency: 'NGN',
            ...(isCash ? {
              collect_from_customer: Number(ride.estimated_fare ?? 0),
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
