import { Request, Response } from 'express';
import { RideService } from '../services/ride.service';
import { CartService } from '../services/cart.service';
import { FareService } from '../services/fare.service';
import { PaymentService } from '../services/payment.service';
import { VariantService } from '../services/variant.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';
import { RideRequestRequest } from '../types';

export class RideController {
  private rideService: RideService;
  private cartService: CartService;
  private fareService: FareService;
  private paymentService: PaymentService;
  private variantService: VariantService;

  constructor() {
    this.rideService = new RideService();
    this.cartService = new CartService();
    this.fareService = new FareService();
    this.paymentService = new PaymentService();
    this.variantService = new VariantService();
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
   * Request ride
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
      if (cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      // Get variant and calculate final fare
      const variant = await this.variantService.getVariant(vehicleVariantId);
      const fareDetails = await this.fareService.calculateFinalFare({
        variantId: vehicleVariantId,
        pickupLocation,
        dropoffLocation,
        currencyCode: cart.currency_code,
      });

      // Create payment hold
      const paymentResult = await this.paymentService.createRidePaymentHold({
        userId,
        amount: fareDetails.totalFare,
        currencyCode: cart.currency_code,
        description: `Ride booking - ${variant.title}`,
      });

      if (paymentResult.status !== 'hold_created') {
        return ResponseUtil.badRequest(res, paymentResult.message);
      }

      // Create ride record
      const ride = await this.rideService.createRide({
        cart_id: cartId,
        user_id: userId,
        variant_id: vehicleVariantId,
        pickup_location: pickupLocation,
        dropoff_location: dropoffLocation,
        estimated_distance: fareDetails.distance,
        estimated_duration: fareDetails.duration,
        estimated_fare: fareDetails.totalFare,
        payment_method: 'wallet',
        scheduled_at: scheduledAt ? new Date(scheduledAt) : null,
        metadata: {
          payment_hold_id: paymentResult.holdId,
          special_requests: specialRequests,
        },
      });

      // Mark cart as completed
      await this.cartService.updateStatus(cartId, 'completed');

      // Phase 1: No driver matching yet, status remains 'searching'
      return ResponseUtil.created(res, {
        ride: {
          id: ride.id,
          status: ride.status,
          estimatedFare: fareDetails.totalFare,
          currency: cart.currency_code,
          estimatedDistance: fareDetails.distanceText,
          estimatedDuration: fareDetails.durationText,
        },
        paymentStatus: paymentResult.status,
        message: 'Ride request created successfully. Driver matching will be implemented in Phase 3.',
      });
    } catch (error) {
      logger.error('Request ride error:', error);
      return ResponseUtil.serverError(res, 'Failed to request ride');
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

      const ride = await this.rideService.getRide(rideId);

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
          variant: ride.variant,
          createdAt: ride.created_at,
          completedAt: ride.completed_at,
          cancelledAt: ride.cancelled_at,
        },
      });
    } catch (error) {
      logger.error('Get ride status error:', error);
      return ResponseUtil.serverError(res, 'Failed to get ride status');
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

      const ride = await this.rideService.getRide(rideId);

      // Verify ride ownership
      if (ride.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to ride');
      }

      // Check if ride can be cancelled
      if (['completed', 'cancelled'].includes(ride.status)) {
        return ResponseUtil.badRequest(res, 'Ride cannot be cancelled');
      }

      // Cancel ride
      const cancelledRide = await this.rideService.cancelRide(rideId, reason || 'User cancelled');

      // Release payment hold
      const holdId = ride.metadata?.payment_hold_id;
      if (holdId) {
        await this.paymentService.releasePaymentHold(holdId);
      }

      return ResponseUtil.success(res, {
        ride: cancelledRide,
        message: 'Ride cancelled successfully',
      });
    } catch (error) {
      logger.error('Cancel ride error:', error);
      return ResponseUtil.serverError(res, 'Failed to cancel ride');
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

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const { rides, total } = await this.rideService.getUserRideHistory(userId, page, limit);

      return ResponseUtil.success(res, {
        rides,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      logger.error('Get ride history error:', error);
      return ResponseUtil.serverError(res, 'Failed to get ride history');
    }
  };

  /**
   * Rate driver
   * POST /api/ride/:rideId/rating
   */
  rateDriver = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { rideId } = req.params;
      const { rating, feedback } = req.body;

      // Validate rating
      if (!rating || rating < 1 || rating > 5) {
        return ResponseUtil.badRequest(res, 'Rating must be between 1 and 5');
      }

      const ride = await this.rideService.getRide(rideId);

      // Verify ride ownership
      if (ride.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to ride');
      }

      // Check if ride is completed
      if (ride.status !== 'completed') {
        return ResponseUtil.badRequest(res, 'Can only rate completed rides');
      }

      // Rate driver
      const updatedRide = await this.rideService.rateDriver(rideId, rating, feedback);

      return ResponseUtil.success(res, {
        ride: updatedRide,
        message: 'Driver rated successfully',
      });
    } catch (error) {
      logger.error('Rate driver error:', error);
      return ResponseUtil.serverError(res, 'Failed to rate driver');
    }
  };
}
