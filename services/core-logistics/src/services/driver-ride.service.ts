import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { RideStateMachineService, RideStatus } from './ride-state-machine.service';
import { PaymentService } from './payment.service';
import { DriverAvailabilityService } from './driver-availability.service';
import { PushNotificationService } from './push-notification.service';
import { LocationHistoryService } from './location-history.service';

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
    error?: string;
  }> {
    try {
      // Get current ride details
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select(`
          *,
          variant:ride_variants(
            base_price,
            price_per_km,
            price_per_minute,
            minimum_fare
          )
        `)
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

      // Calculate final fare
      const variant = ride.variant as any;
      const baseFare = parseFloat(variant.base_price);
      const distanceFare = data.actualDistance * parseFloat(variant.price_per_km);
      const timeFare = data.actualDuration * parseFloat(variant.price_per_minute);
      const minimumFare = parseFloat(variant.minimum_fare);

      let finalFare = baseFare + distanceFare + timeFare;
      if (finalFare < minimumFare) {
        finalFare = minimumFare;
      }

      // Update ride with completion details
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          status: RideStatus.COMPLETED,
          completed_at: new Date().toISOString(),
          actual_distance: data.actualDistance,
          actual_duration: data.actualDuration,
          final_fare: finalFare,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error completing trip:', updateError);
        return { success: false, error: 'Failed to complete trip' };
      }

      // Convert payment hold to actual payment
      if (ride.payment_hold_id) {
        await this.paymentService.convertHoldToPayment({
          holdId: ride.payment_hold_id,
          actualAmount: finalFare,
          description: `Payment for ride ${rideId}`,
          metadata: {
            ride_id: rideId,
            driver_id: driverId,
            actual_distance: data.actualDistance,
            actual_duration: data.actualDuration,
          },
        });
      }

      // Set driver as available again
      await this.availabilityService.setAvailable(driverId, true);

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

      // Send push notification to passenger
      await this.pushService.sendRideNotification(
        ride.user_id,
        rideId,
        'ride_completed',
        {
          finalFare: finalFare.toString(),
        }
      );

      // Record location visits for recent locations feature
      // Record pickup location
      if (ride.pickup_address) {
        await this.locationHistoryService.recordLocationVisit(
          ride.user_id,
          'pickup',
          {
            latitude: parseFloat(ride.pickup_latitude),
            longitude: parseFloat(ride.pickup_longitude),
            address: ride.pickup_address,
          }
        );
      }

      // Record dropoff location
      if (ride.dropoff_address) {
        await this.locationHistoryService.recordLocationVisit(
          ride.user_id,
          'dropoff',
          {
            latitude: parseFloat(ride.dropoff_latitude),
            longitude: parseFloat(ride.dropoff_longitude),
            address: ride.dropoff_address,
          }
        );
      }

      logger.info(`Driver ${driverId} completed trip ${rideId} with final fare ${finalFare}`);

      return {
        success: true,
        finalFare,
      };
    } catch (error: any) {
      logger.error('Complete trip error:', error);
      return { success: false, error: 'Failed to complete trip' };
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
            pickup_latitude,
            pickup_longitude,
            pickup_address,
            dropoff_latitude,
            dropoff_longitude,
            dropoff_address,
            estimated_fare,
            estimated_distance,
            estimated_duration
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

      return requests || [];
    } catch (error: any) {
      logger.error('Get pending requests error:', error);
      return [];
    }
  }
}
