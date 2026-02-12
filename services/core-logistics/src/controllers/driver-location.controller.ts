import { Request, Response } from 'express';
import { DriverLocationService } from '../services/driver-location.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class DriverLocationController {
  private locationService: DriverLocationService;

  constructor() {
    this.locationService = new DriverLocationService();
  }

  /**
   * Update driver location
   * POST /api/drivers/location
   */
  updateLocation = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      const { latitude, longitude, heading, speed, accuracy, batteryLevel, appVersion } = req.body;

      if (!latitude || !longitude) {
        return ResponseUtil.badRequest(res, 'Latitude and longitude are required');
      }

      // Get driver ID from user ID
      const driverId = await this.getDriverIdFromUserId(userId);
      if (!driverId) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const result = await this.locationService.updateLocation(driverId, {
        latitude,
        longitude,
        heading,
        speed,
        accuracy,
        batteryLevel,
        appVersion,
      });

      if (!result.success) {
        if (result.error === 'DRIVER_NOT_ONLINE') {
          return ResponseUtil.badRequest(res, 'Driver must be online to update location');
        }
        if (result.error?.includes('Rate limit')) {
          return ResponseUtil.error(res, result.error, 429);
        }
        return ResponseUtil.error(res, result.error!);
      }

      return ResponseUtil.success(res, {
        message: 'Location updated successfully',
      });
    } catch (error: any) {
      logger.error('Update location error:', error);
      return ResponseUtil.error(res, 'Failed to update location');
    }
  };

  /**
   * Get current location
   * GET /api/drivers/location
   */
  getLocation = async (req: Request, res: Response): Promise<Response> => {
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

      const location = await this.locationService.getLatestLocation(driverId);

      if (!location) {
        return ResponseUtil.success(res, {
          location: null,
          message: 'No location data available',
        });
      }

      return ResponseUtil.success(res, {
        location,
      });
    } catch (error: any) {
      logger.error('Get location error:', error);
      return ResponseUtil.error(res, 'Failed to get location');
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
