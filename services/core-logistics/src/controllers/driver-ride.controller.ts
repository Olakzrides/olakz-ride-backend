import { Request, Response } from 'express';
import { DriverRideService } from '../services/driver-ride.service';
import { RatingService } from '../services/rating.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class DriverRideController {
  private rideService: DriverRideService;
  private ratingService: RatingService;

  constructor() {
    this.rideService = new DriverRideService();
    this.ratingService = new RatingService();
  }

  /**
   * Accept ride request
   * POST /api/drivers/rides/requests/:id/accept
   */
  acceptRideRequest = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role; // Changed from active_role to role

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      const { id: rideRequestId } = req.params;

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.rideService.acceptRideRequest(driverId, rideRequestId);

      if (!result.success) {
        if (result.errorCode === 'REQUEST_NO_LONGER_AVAILABLE') {
          return ResponseUtil.badRequest(res, result.error!);
        }
        return ResponseUtil.error(res, result.error!);
      }

      logger.info(`Driver ${driverId} accepted ride request ${rideRequestId}`);

      return ResponseUtil.success(res, {
        message: 'Ride request accepted successfully',
        ride: result.ride,
      });
    } catch (error: any) {
      logger.error('Accept ride request error:', error);
      return ResponseUtil.error(res, 'Failed to accept ride request');
    }
  };

  /**
   * Decline ride request
   * POST /api/drivers/rides/requests/:id/decline
   */
  declineRideRequest = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      const { id: rideRequestId } = req.params;

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.rideService.declineRideRequest(driverId, rideRequestId);

      if (!result.success) {
        return ResponseUtil.error(res, result.error!);
      }

      logger.info(`Driver ${driverId} declined ride request ${rideRequestId}`);

      return ResponseUtil.success(res, {
        message: 'Ride request declined',
      });
    } catch (error: any) {
      logger.error('Decline ride request error:', error);
      return ResponseUtil.error(res, 'Failed to decline ride request');
    }
  };

  /**
   * Get pending ride requests
   * GET /api/drivers/rides/pending
   */
  getPendingRequests = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const requests = await this.rideService.getPendingRequests(driverId);

      return ResponseUtil.success(res, {
        requests,
        total: requests.length,
      });
    } catch (error: any) {
      logger.error('Get pending requests error:', error);
      return ResponseUtil.error(res, 'Failed to get pending requests');
    }
  };

  /**
   * Mark arrived at pickup
   * POST /api/drivers/rides/:rideId/arrived
   */
  markArrived = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      const { rideId } = req.params;

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.rideService.markArrived(driverId, rideId);

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      logger.info(`Driver ${driverId} marked arrived for ride ${rideId}`);

      return ResponseUtil.success(res, {
        message: 'Marked as arrived at pickup location',
      });
    } catch (error: any) {
      logger.error('Mark arrived error:', error);
      return ResponseUtil.error(res, 'Failed to mark arrived');
    }
  };

  /**
   * Start trip
   * POST /api/drivers/rides/:rideId/start
   */
  startTrip = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      const { rideId } = req.params;
      const { location } = req.body;

      if (!location || !location.latitude || !location.longitude) {
        return ResponseUtil.badRequest(res, 'Location is required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.rideService.startTrip(driverId, rideId, location);

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      logger.info(`Driver ${driverId} started trip ${rideId}`);

      return ResponseUtil.success(res, {
        message: 'Trip started successfully',
      });
    } catch (error: any) {
      logger.error('Start trip error:', error);
      return ResponseUtil.error(res, 'Failed to start trip');
    }
  };

  /**
   * Complete trip
   * POST /api/drivers/rides/:rideId/complete
   */
  completeTrip = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      const { rideId } = req.params;
      const { actualDistance, actualDuration, endLocation } = req.body;

      if (!actualDistance || !actualDuration || !endLocation) {
        return ResponseUtil.badRequest(res, 'actualDistance, actualDuration, and endLocation are required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.rideService.completeTrip(driverId, rideId, {
        actualDistance,
        actualDuration,
        endLocation,
      });

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      logger.info(`Driver ${driverId} completed trip ${rideId}`);

      return ResponseUtil.success(res, {
        message: 'Trip completed successfully',
        finalFare: result.finalFare,
      });
    } catch (error: any) {
      logger.error('Complete trip error:', error);
      return ResponseUtil.error(res, 'Failed to complete trip');
    }
  };

  /**
   * Get active ride
   * GET /api/drivers/rides/active
   */
  getActiveRide = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const ride = await this.rideService.getActiveRide(driverId);

      if (!ride) {
        return ResponseUtil.success(res, {
          ride: null,
          message: 'No active ride',
        });
      }

      return ResponseUtil.success(res, {
        ride,
      });
    } catch (error: any) {
      logger.error('Get active ride error:', error);
      return ResponseUtil.error(res, 'Failed to get active ride');
    }
  };

  /**
   * Get ride history
   * GET /api/drivers/rides/history
   */
  getRideHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const result = await this.rideService.getRideHistory(driverId, {
        page,
        limit,
        startDate,
        endDate,
      });

      return ResponseUtil.success(res, result);
    } catch (error: any) {
      logger.error('Get ride history error:', error);
      return ResponseUtil.error(res, 'Failed to get ride history');
    }
  };

  /**
   * Rate passenger
   * POST /api/drivers/rides/:rideId/rate-passenger
   */
  ratePassenger = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      const { rideId } = req.params;
      const { stars, feedback } = req.body;

      if (!stars || stars < 1 || stars > 5) {
        return ResponseUtil.badRequest(res, 'Rating must be between 1 and 5 stars');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.ratingService.ratePassenger(driverId, rideId, {
        stars,
        feedback,
      });

      if (!result.success) {
        if (result.error === 'RIDE_NOT_COMPLETED') {
          return ResponseUtil.badRequest(res, 'Can only rate completed rides');
        }
        if (result.error === 'UNAUTHORIZED') {
          return ResponseUtil.forbidden(res, 'Not authorized to rate this ride');
        }
        return ResponseUtil.error(res, result.error!);
      }

      logger.info(`Driver ${driverId} rated passenger for ride ${rideId}`);

      return ResponseUtil.success(res, {
        message: 'Passenger rated successfully',
      });
    } catch (error: any) {
      logger.error('Rate passenger error:', error);
      return ResponseUtil.error(res, 'Failed to rate passenger');
    }
  };

  /**
   * Helper: Get driver ID from user ID
   */
  private async getDriverIdFromUserId(userId: string): Promise<string | null> {
    const { supabase } = await import('../config/database');
    const { data } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    return data?.id || null;
  }
}
