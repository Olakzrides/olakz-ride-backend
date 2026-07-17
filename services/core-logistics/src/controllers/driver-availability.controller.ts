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
   * PATCH /api/drivers/service-type
   * Update driver's active service types.
   *
   * Allowed choices by vehicle type:
   *   car         → ['ride'] | ['delivery'] | ['ride', 'delivery']
   *   motorcycle  → ['delivery'] only
   *   bicycle     → ['delivery'] only
   *   bus / truck / minibus → ['ride'] only  (no toggle — kept for completeness)
   *
   * Body: { service_type: 'ride_only' | 'delivery_only' | 'ride_and_delivery' }
   */
  updateServiceType = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId   = (req as any).user?.id;
      const userRole = (req as any).user?.role;

      if (!userId || userRole !== 'driver') {
        return ResponseUtil.unauthorized(res, 'Driver access required');
      }

      const { service_type } = req.body;
      const validChoices = ['ride_only', 'delivery_only', 'ride_and_delivery'];
      if (!service_type || !validChoices.includes(service_type)) {
        return ResponseUtil.badRequest(
          res,
          `service_type must be one of: ${validChoices.join(', ')}`
        );
      }

      const { supabase } = await import('../config/database');

      // Fetch driver + vehicle type
      const { data: driver, error: fetchErr } = await supabase
        .from('drivers')
        .select(`
          id, service_types,
          vehicle_type:vehicle_types!drivers_vehicle_type_id_fkey(name)
        `)
        .eq('user_id', userId)
        .single();

      if (fetchErr || !driver) {
        return ResponseUtil.notFound(res, 'Driver profile not found');
      }

      const vehicleName: string = (driver.vehicle_type as any)?.name?.toLowerCase() ?? '';

      // ── Determine allowed choices for this vehicle type ───────────────────
      const CAR_VEHICLES        = ['car'];
      const DELIVERY_ONLY_VEH   = ['motorcycle', 'bicycle'];
      const RIDE_ONLY_VEH       = ['bus', 'truck', 'minibus'];

      let allowedChoices: string[];

      if (CAR_VEHICLES.includes(vehicleName)) {
        allowedChoices = ['ride_only', 'delivery_only', 'ride_and_delivery'];
      } else if (DELIVERY_ONLY_VEH.includes(vehicleName)) {
        allowedChoices = ['delivery_only'];
      } else if (RIDE_ONLY_VEH.includes(vehicleName)) {
        allowedChoices = ['ride_only'];
      } else {
        // Unknown vehicle type — default to delivery only
        allowedChoices = ['delivery_only'];
      }

      if (!allowedChoices.includes(service_type)) {
        return ResponseUtil.badRequest(
          res,
          `Vehicle type "${vehicleName}" only supports: ${allowedChoices.join(', ')}. ` +
          `Ride service type changes are only available for car drivers.`
        );
      }

      // ── Map choice → service_types array ─────────────────────────────────
      const serviceTypeMap: Record<string, string[]> = {
        ride_only:         ['ride'],
        delivery_only:     ['delivery'],
        ride_and_delivery: ['ride', 'delivery'],
      };

      const newServiceTypes = serviceTypeMap[service_type];

      const { error: updateErr } = await supabase
        .from('drivers')
        .update({
          service_types: newServiceTypes,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', driver.id);

      if (updateErr) {
        logger.error('updateServiceType DB error', { driverId: driver.id, error: updateErr.message });
        return ResponseUtil.error(res, 'Failed to update service type');
      }

      logger.info('Driver updated service type', {
        driverId:        driver.id,
        userId,
        service_type,
        newServiceTypes,
        vehicleName,
      });

      return ResponseUtil.success(res, {
        service_type,
        service_types:     newServiceTypes,
        vehicle_type:      vehicleName,
        allowed_choices:   allowedChoices,
        message: `Service type updated to: ${service_type.replace(/_/g, ' ')}`,
      });
    } catch (error: any) {
      logger.error('updateServiceType error:', error);
      return ResponseUtil.error(res, 'Failed to update service type');
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
