import { Request, Response } from 'express';
import { RideService } from '../services/ride.service';
import { CartService } from '../services/cart.service';
import { FareService } from '../services/fare.service';
import { VariantService } from '../services/variant.service';
import { RideTimeoutService } from '../services/ride-timeout.service';
import { RideStateMachineService, RideStatus } from '../services/ride-state-machine.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';
import { RideRequestRequest } from '../types';

export class RideController {
  private rideService: RideService;
  private cartService: CartService;
  private fareService: FareService;
  private variantService: VariantService;
  private rideTimeoutService: RideTimeoutService;

  constructor() {
    this.rideService = new RideService();
    this.cartService = new CartService();
    this.fareService = new FareService();
    this.variantService = new VariantService();
    this.rideTimeoutService = new RideTimeoutService();
  }

  /**
   * Initialize with ride matching service (called after app setup)
   */
  initializeRideMatching(req: Request): void {
    const rideMatchingService = (req as any).app.get('rideMatchingService');
    if (rideMatchingService && !this.rideService['rideMatchingService']) {
      this.rideService.setRideMatchingService(rideMatchingService);
    }
  }

  /**
   * Request ride with improved error handling and concurrent prevention
   * POST /api/ride/request
   */
  requestRide = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Initialize ride matching service if not already done
      this.initializeRideMatching(req);

      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const {
        cartId,
        pickupLocation,
        dropoffLocation,
        vehicleVariantId,
        scheduledAt,
        specialRequests,
      }: RideRequestRequest = req.body;

      // Verify cart ownership
      const cart = await this.cartService.getCart(cartId);
      if (!cart || cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      // Validate dropoff location is set
      if (!dropoffLocation || !dropoffLocation.latitude || !dropoffLocation.longitude) {
        return ResponseUtil.badRequest(res, 'Dropoff location is required');
      }

      // Get variant and calculate final fare
      const variant = await this.variantService.getVariant(vehicleVariantId);
      if (!variant) {
        return ResponseUtil.badRequest(res, 'Invalid vehicle variant');
      }

      const fareDetails = await this.fareService.calculateFinalFare({
        variantId: vehicleVariantId,
        pickupLocation,
        dropoffLocation,
        currencyCode: cart.currency_code,
      });

      // Create ride with atomic transaction (includes balance check and concurrent prevention)
      const rideResult = await this.rideService.createRide({
        cart_id: cartId,
        user_id: userId,
        variant_id: vehicleVariantId,
        pickup_location: pickupLocation,
        dropoff_location: dropoffLocation,
        estimated_distance: fareDetails.distance,
        estimated_duration: fareDetails.duration,
        estimated_fare: fareDetails.totalFare,
        currency_code: cart.currency_code,
        payment_method: 'wallet',
        scheduled_at: scheduledAt ? new Date(scheduledAt) : null,
        metadata: {
          special_requests: specialRequests,
          fare_breakdown: fareDetails,
          cart_id: cartId,
        },
      });

      if (!rideResult.success) {
        if (rideResult.errorCode === 'CONCURRENT_RIDE_EXISTS') {
          return ResponseUtil.badRequest(res, rideResult.error!);
        }
        if (rideResult.errorCode === 'INSUFFICIENT_BALANCE') {
          return ResponseUtil.badRequest(res, rideResult.error!);
        }
        return ResponseUtil.error(res, rideResult.error!);
      }

      // Start search timeout for immediate rides
      if (!scheduledAt) {
        await this.rideTimeoutService.startSearchTimeout(rideResult.ride!.id);
      }

      logger.info('Ride requested successfully:', {
        rideId: rideResult.ride!.id,
        userId,
        fare: fareDetails.totalFare,
        scheduled: !!scheduledAt,
      });

      return ResponseUtil.success(res, {
        ride: {
          id: rideResult.ride!.id,
          status: rideResult.ride!.status,
          estimated_fare: fareDetails.totalFare,
          fare_breakdown: fareDetails,
          pickup_location: pickupLocation,
          dropoff_location: dropoffLocation,
          variant: {
            id: variant.id,
            title: variant.title,
            vehicle_type: variant.vehicle_type,
          },
          scheduled_at: scheduledAt,
          created_at: rideResult.ride!.created_at,
          expected_user_action: RideStateMachineService.getExpectedUserAction(RideStatus.SEARCHING),
        },
        message: scheduledAt 
          ? 'Ride scheduled successfully' 
          : 'Ride requested successfully. Searching for drivers...',
      });
    } catch (error: any) {
      logger.error('Request ride error:', error);
      return ResponseUtil.error(res, 'Failed to request ride');
    }
  };

  /**
   * Get ride status
   * GET /api/ride/:rideId/status
   */
  getRideStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { rideId } = req.params;

      const ride = await this.rideService.getRideById(rideId);
      if (!ride) {
        return ResponseUtil.notFound(res, 'Ride not found');
      }

      // Verify ride ownership
      if (ride.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to ride');
      }

      return ResponseUtil.success(res, {
        ride: {
          id: ride.id,
          status: ride.status,
          pickupLocation: {
            latitude: parseFloat(ride.pickup_latitude),
            longitude: parseFloat(ride.pickup_longitude),
            address: ride.pickup_address,
          },
          dropoffLocation: ride.dropoff_latitude
            ? {
                latitude: parseFloat(ride.dropoff_latitude),
                longitude: parseFloat(ride.dropoff_longitude),
                address: ride.dropoff_address,
              }
            : null,
          estimatedFare: parseFloat(ride.estimated_fare),
          finalFare: ride.final_fare ? parseFloat(ride.final_fare) : null,
          estimatedDistance: ride.estimated_distance ? `${ride.estimated_distance} km` : null,
          estimatedDuration: ride.estimated_duration ? `${ride.estimated_duration} min` : null,
          variant: ride.ride_variants,
          createdAt: ride.created_at,
          completedAt: ride.completed_at,
          cancelledAt: ride.cancelled_at,
          expected_user_action: RideStateMachineService.getExpectedUserAction(ride.status as RideStatus),
        },
      });
    } catch (error: any) {
      logger.error('Get ride status error:', error);
      return ResponseUtil.error(res, 'Failed to get ride status');
    }
  };

  /**
   * Cancel ride
   * POST /api/ride/:rideId/cancel
   */
  cancelRide = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { rideId } = req.params;
      const { reason } = req.body;

      const cancelResult = await this.rideService.cancelRide(
        rideId,
        userId,
        reason || 'User cancelled'
      );

      if (!cancelResult.success) {
        return ResponseUtil.badRequest(res, cancelResult.error!);
      }

      return ResponseUtil.success(res, {
        message: 'Ride cancelled successfully',
        cancellation_fee: cancelResult.cancellationFee,
      });
    } catch (error: any) {
      logger.error('Cancel ride error:', error);
      return ResponseUtil.error(res, 'Failed to cancel ride');
    }
  };

  /**
   * Get user ride history
   * GET /api/ride/history
   */
  getRideHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const limit = parseInt(req.query.limit as string) || 10;

      const rides = await this.rideService.getUserRecentRides(userId, limit);

      return ResponseUtil.success(res, {
        rides: rides.map(ride => ({
          id: ride.id,
          status: ride.status,
          pickup_address: ride.pickup_address,
          dropoff_address: ride.dropoff_address,
          estimated_fare: ride.estimated_fare,
          created_at: ride.created_at,
          variant: ride.ride_variants,
        })),
        total: rides.length,
      });
    } catch (error: any) {
      logger.error('Get ride history error:', error);
      return ResponseUtil.error(res, 'Failed to get ride history');
    }
  };
}