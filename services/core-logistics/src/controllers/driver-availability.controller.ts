import { Request, Response } from 'express';
import { DriverAvailabilityService } from '../services/driver-availability.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class DriverAvailabilityController {
  private availabilityService: DriverAvailabilityService;

  constructor() {
    this.availabilityService = new DriverAvailabilityService();
  }

  /**
   * Go online
   * POST /api/drivers/availability/online
   */
  goOnline = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role; // Changed from active_role to role

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.availabilityService.toggleOnlineStatus(driverId, true);

      if (!result.success) {
        if (result.error === 'DRIVER_NOT_APPROVED') {
          return ResponseUtil.forbidden(res, 'Driver account not approved');
        }
        return ResponseUtil.error(res, result.error!);
      }

      logger.info(`Driver ${driverId} went online`);

      return ResponseUtil.success(res, {
        message: 'You are now online and available for ride requests',
        availability: result.availability,
      });
    } catch (error: any) {
      logger.error('Go online error:', error);
      return ResponseUtil.error(res, 'Failed to go online');
    }
  };

  /**
   * Go offline
   * POST /api/drivers/availability/offline
   */
  goOffline = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role; // Changed from active_role to role

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.availabilityService.toggleOnlineStatus(driverId, false);

      if (!result.success) {
        return ResponseUtil.error(res, result.error!);
      }

      logger.info(`Driver ${driverId} went offline`);

      return ResponseUtil.success(res, {
        message: 'You are now offline',
        availability: result.availability,
      });
    } catch (error: any) {
      logger.error('Go offline error:', error);
      return ResponseUtil.error(res, 'Failed to go offline');
    }
  };

  /**
   * Get availability status
   * GET /api/drivers/availability/status
   */
  getStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role; // Changed from active_role to role

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const availability = await this.availabilityService.getAvailability(driverId);

      if (!availability) {
        return ResponseUtil.success(res, {
          availability: {
            isOnline: false,
            isAvailable: false,
            lastSeenAt: null,
          },
        });
      }

      return ResponseUtil.success(res, {
        availability,
      });
    } catch (error: any) {
      logger.error('Get status error:', error);
      return ResponseUtil.error(res, 'Failed to get availability status');
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
