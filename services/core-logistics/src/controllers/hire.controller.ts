import { Request, Response } from 'express';
import { HireService } from '../services/hire.service';
import { ResponseUtil } from '../utils/response.util';
import { MapsUtil } from '../utils/maps.util';
import { logger } from '../config/logger';

export class HireController {
  private hireService: HireService;

  constructor(hireService?: HireService) {
    this.hireService = hireService ?? new HireService();
  }

  /**
   * GET /api/hire/vehicle-types
   * Returns the 4 vehicle categories with their sub-types.
   * Used by the home screen grid and Mode of Transportation screens.
   */
  getVehicleTypes = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const types = await this.hireService.getVehicleTypes();
      return ResponseUtil.success(res, { vehicle_types: types });
    } catch (err: any) {
      logger.error('getVehicleTypes error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to fetch vehicle types');
    }
  };

  /**
   * GET /api/hire/home
   * Returns active booking + hire history for the home screen.
   */
  getHomeData = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) return ResponseUtil.unauthorized(res);

      const data = await this.hireService.getHomeData(customerId);
      return ResponseUtil.success(res, data);
    } catch (err: any) {
      logger.error('hire getHomeData error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to fetch hire home data');
    }
  };

  /**
   * POST /api/hire
   * Create a new transport hire booking (status = pending, no payment yet).
   */
  createHire = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) return ResponseUtil.unauthorized(res);

      const {
        pickup_address, pickup_lat, pickup_lng,
        destination_address, destination_lat, destination_lng,
        vehicle_category, vehicle_sub_type,
        start_datetime, end_datetime,
        payment_method = 'wallet',
        for_whom = 'self',
        passenger_name, passenger_phone, note,
      } = req.body;

      if (!pickup_address || !pickup_lat || !pickup_lng)
        return ResponseUtil.badRequest(res, 'Pickup location is required');
      if (!destination_address || !destination_lat || !destination_lng)
        return ResponseUtil.badRequest(res, 'Destination is required');
      if (!vehicle_category || !vehicle_sub_type)
        return ResponseUtil.badRequest(res, 'vehicle_category and vehicle_sub_type are required');
      if (!start_datetime || !end_datetime)
        return ResponseUtil.badRequest(res, 'start_datetime and end_datetime are required');

      // Resolve pickup state for city-tier pricing
      // Try address extraction first (fast, no API call), then GPS reverse geocode as fallback
      let pickupState: string | undefined =
        MapsUtil.extractStateFromAddress(pickup_address ?? '') ?? undefined;

      if (!pickupState && pickup_lat && pickup_lng) {
        pickupState = await MapsUtil.resolveNigerianState(
          { latitude: pickup_lat, longitude: pickup_lng },
          pickup_address
        ).catch(() => undefined) ?? undefined;
      }

      logger.info('createHire: resolved pickup state', { pickup_address, pickupState });

      const hire = await this.hireService.createHire({
        customer_id: customerId,
        pickup_address, pickup_lat, pickup_lng,
        destination_address, destination_lat, destination_lng,
        vehicle_category, vehicle_sub_type,
        start_datetime, end_datetime,
        payment_method,
        for_whom,
        passenger_name, passenger_phone, note,
        pickup_state: pickupState ?? undefined,
      });

      return ResponseUtil.success(res, { hire }, 'Hire booking created successfully');
    } catch (err: any) {
      logger.error('createHire error', { error: err.message });
      if (err.message.includes('required') || err.message.includes('Invalid') ||
          err.message.includes('past') || err.message.includes('after') ||
          err.message.includes('Unknown')) {
        return ResponseUtil.badRequest(res, err.message);
      }
      return ResponseUtil.error(res, 'Failed to create hire booking');
    }
  };

  /**
   * PUT /api/hire/:hireId
   * Edit hire details — only allowed while status = pending.
   */
  updateHire = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) return ResponseUtil.unauthorized(res);

      const { hireId } = req.params;

      // Resolve pickup state for city-tier pricing.
      // If pickup_address is not in the update body, fetch it from the existing hire
      // so the fare is always calculated against the correct city tier.
      let pickupAddress: string | undefined = req.body.pickup_address;
      let pickupLat: number | undefined     = req.body.pickup_lat;
      let pickupLng: number | undefined     = req.body.pickup_lng;

      if (!pickupAddress) {
        const { data: existing } = await (await import('../config/database')).supabase
          .from('transport_hires')
          .select('pickup_address, pickup_lat, pickup_lng')
          .eq('id', hireId)
          .maybeSingle();

        pickupAddress = existing?.pickup_address;
        pickupLat     = existing?.pickup_lat;
        pickupLng     = existing?.pickup_lng;
      }

      let pickupState: string | undefined =
        pickupAddress ? MapsUtil.extractStateFromAddress(pickupAddress) ?? undefined : undefined;

      if (!pickupState && pickupLat && pickupLng) {
        pickupState = await MapsUtil.resolveNigerianState(
          { latitude: pickupLat, longitude: pickupLng },
          pickupAddress
        ).catch(() => undefined) ?? undefined;
      }

      logger.info('updateHire: resolved pickup state', { hireId, pickupAddress, pickupState });

      const hire = await this.hireService.updateHire(hireId, customerId, {
        ...req.body,
        pickup_state: pickupState ?? undefined,
      });

      return ResponseUtil.success(res, { hire }, 'Hire booking updated successfully');
    } catch (err: any) {
      logger.error('updateHire error', { error: err.message });
      if (err.message.includes('not found'))         return ResponseUtil.notFound(res, 'Hire booking');
      if (err.message.includes('only be edited'))    return ResponseUtil.badRequest(res, err.message);
      if (err.message.includes('Unknown'))           return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.error(res, 'Failed to update hire booking');
    }
  };

  /**
   * POST /api/hire/:hireId/proceed
   * Confirm + pay from wallet → status moves to searching, driver search begins.
   */
  proceedHire = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) return ResponseUtil.unauthorized(res);

      const hire = await this.hireService.proceedHire(req.params.hireId, customerId);
      return ResponseUtil.success(res, { hire }, 'Payment confirmed. Searching for driver...');
    } catch (err: any) {
      logger.error('proceedHire error', { error: err.message });
      if (err.message.includes('not found'))          return ResponseUtil.notFound(res, 'Hire booking');
      if (err.message.includes('Insufficient'))       return ResponseUtil.badRequest(res, err.message);
      if (err.message.includes('already'))            return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.error(res, 'Failed to process hire payment');
    }
  };

  /**
   * GET /api/hire/:hireId
   * Full booking details including assigned driver info.
   */
  getHireById = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const hire = await this.hireService.getHireById(req.params.hireId, userId);
      if (!hire) return ResponseUtil.notFound(res, 'Hire booking');

      return ResponseUtil.success(res, { hire });
    } catch (err: any) {
      logger.error('getHireById error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to fetch hire booking');
    }
  };

  /**
   * GET /api/hire/:hireId/driver
   * Driver details for the assigned hire.
   */
  getHireDriver = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const hire = await this.hireService.getHireById(req.params.hireId, userId);
      if (!hire)           return ResponseUtil.notFound(res, 'Hire booking');
      if (!hire.driver_id) return ResponseUtil.notFound(res, 'No driver assigned yet');

      const driver = await this.hireService.getDriverDetails(hire.driver_id);
      if (!driver) return ResponseUtil.notFound(res, 'Driver not found');

      return ResponseUtil.success(res, { driver });
    } catch (err: any) {
      logger.error('getHireDriver error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to fetch driver details');
    }
  };

  /**
   * POST /api/hire/:hireId/cancel
   * Cancel hire and refund wallet if already paid.
   */
  cancelHire = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) return ResponseUtil.unauthorized(res);

      const { reason } = req.body;
      const result = await this.hireService.cancelHire(req.params.hireId, customerId, reason);
      const msg = result.refunded
        ? 'Hire cancelled and payment refunded to your wallet'
        : 'Hire cancelled successfully';
      return ResponseUtil.success(res, result, msg);
    } catch (err: any) {
      logger.error('cancelHire error', { error: err.message });
      if (err.message.includes('not found'))   return ResponseUtil.notFound(res, 'Hire booking');
      if (err.message.includes('Cannot cancel')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.error(res, 'Failed to cancel hire booking');
    }
  };

  /**
   * GET /api/hire/history
   * Paginated hire history for the customer.
   */
  getHireHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) return ResponseUtil.unauthorized(res);

      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await this.hireService.getHireHistory(customerId, page, limit);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      logger.error('getHireHistory error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to fetch hire history');
    }
  };

  // ── Driver endpoints ───────────────────────────────────────────────────────

  /**
   * GET /api/hire/driver/active
   * Driver sees all their currently active transport hire bookings.
   */
  getDriverActiveHires = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { data: driver } = await (await import('../config/database')).supabase
        .from('drivers').select('id').eq('user_id', userId).maybeSingle();

      if (!driver) return ResponseUtil.forbidden(res, 'Driver profile not found');

      const hires = await this.hireService.getDriverActiveHires(driver.id);
      return ResponseUtil.success(res, { hires });
    } catch (err: any) {
      logger.error('getDriverActiveHires error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to fetch active hires');
    }
  };

  /**
   * GET /api/hire/driver/history
   * Driver's completed and cancelled hire history.
   */
  getDriverHireHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { data: driver } = await (await import('../config/database')).supabase
        .from('drivers').select('id').eq('user_id', userId).maybeSingle();

      if (!driver) return ResponseUtil.forbidden(res, 'Driver profile not found');

      const page  = parseInt(req.query.page  as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const result = await this.hireService.getDriverHireHistory(driver.id, page, limit);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      logger.error('getDriverHireHistory error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to fetch hire history');
    }
  };

  /**
   * GET /api/hire/driver/requests
   * Available hire requests for the logged-in driver.
   */
  getDriverRequests = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { data: driver } = await (await import('../config/database')).supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!driver) return ResponseUtil.forbidden(res, 'Driver profile not found');

      logger.info('getDriverRequests: looking up requests for driver', { driverId: driver.id, userId });

      const requests = await this.hireService.getDriverAvailableRequests(driver.id);
      return ResponseUtil.success(res, { requests });
    } catch (err: any) {
      logger.error('getDriverRequests error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to fetch hire requests');
    }
  };

  /**
   * POST /api/hire/driver/:hireId/arrived
   * Driver marks they have arrived at the pickup location.
   * Mirrors: POST /api/drivers/rides/:rideId/arrived
   */
  driverMarkArrived = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);
      const { data: driver } = await (await import('../config/database')).supabase
        .from('drivers').select('id').eq('user_id', userId).maybeSingle();
      if (!driver) return ResponseUtil.forbidden(res, 'Driver profile not found');
      await this.hireService.driverMarkArrived(req.params.hireId, driver.id);
      return ResponseUtil.success(res, {}, 'Marked as arrived at pickup location');
    } catch (err: any) {
      logger.error('driverMarkArrived error', { error: err.message });
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, 'Hire');
      if (err.message.includes('Cannot'))    return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.error(res, 'Failed to mark arrived');
    }
  };

  /**
   * POST /api/hire/driver/:hireId/start
   * Driver starts the hire trip.
   * Mirrors: POST /api/drivers/rides/:rideId/start
   */
  driverStartTrip = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);
      const { data: driver } = await (await import('../config/database')).supabase
        .from('drivers').select('id').eq('user_id', userId).maybeSingle();
      if (!driver) return ResponseUtil.forbidden(res, 'Driver profile not found');
      await this.hireService.driverStartTrip(req.params.hireId, driver.id);
      return ResponseUtil.success(res, {}, 'Hire trip started');
    } catch (err: any) {
      logger.error('driverStartTrip error', { error: err.message });
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, 'Hire');
      if (err.message.includes('Cannot'))    return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.error(res, 'Failed to start trip');
    }
  };

  /**
   * POST /api/hire/driver/:hireId/complete
   * Driver marks the hire as completed. Credits driver wallet.
   * Mirrors: POST /api/drivers/rides/:rideId/complete
   */
  driverCompleteHire = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);
      const { data: driver } = await (await import('../config/database')).supabase
        .from('drivers').select('id').eq('user_id', userId).maybeSingle();
      if (!driver) return ResponseUtil.forbidden(res, 'Driver profile not found');
      await this.hireService.driverCompleteHire(req.params.hireId, driver.id);
      return ResponseUtil.success(res, {}, 'Hire completed. Payment credited to your wallet.');
    } catch (err: any) {
      logger.error('driverCompleteHire error', { error: err.message });
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, 'Hire');
      if (err.message.includes('Cannot'))    return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.error(res, 'Failed to complete hire');
    }
  };

  /**
   * POST /api/hire/driver/requests/:hireId/accept
   * Driver accepts a hire request.
   */
  driverAcceptHire = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { data: driver } = await (await import('../config/database')).supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!driver) return ResponseUtil.forbidden(res, 'Driver profile not found');

      const result = await this.hireService.driverAcceptHire(req.params.hireId, driver.id);
      if (!result.success) return ResponseUtil.badRequest(res, result.message);

      // Return full hire details so driver sees everything in one response
      const hire = await this.hireService.getHireById(req.params.hireId, userId);

      return ResponseUtil.success(res, { hire }, result.message);
    } catch (err: any) {
      logger.error('driverAcceptHire error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to accept hire request');
    }
  };

  /**
   * POST /api/hire/driver/requests/:hireId/reject
   * Driver rejects a hire request.
   */
  driverRejectHire = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return ResponseUtil.unauthorized(res);

      const { data: driver } = await (await import('../config/database')).supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!driver) return ResponseUtil.forbidden(res, 'Driver profile not found');

      await this.hireService.driverRejectHire(req.params.hireId, driver.id);
      return ResponseUtil.success(res, {}, 'Hire request declined');
    } catch (err: any) {
      logger.error('driverRejectHire error', { error: err.message });
      return ResponseUtil.error(res, 'Failed to decline hire request');
    }
  };
}
