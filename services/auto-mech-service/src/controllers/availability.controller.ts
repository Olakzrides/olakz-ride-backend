import { Request, Response } from 'express';
import { AvailabilityService } from '../services/availability.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class AvailabilityController {
  private availabilityService = new AvailabilityService();

  /**
   * GET /api/auto-mech/vendors/:vendorId/services/:serviceId/availability
   * Query param: date=YYYY-MM-DD (optional, defaults to today)
   */
  getDayAvailability = async (req: Request, res: Response): Promise<Response> => {
    const { vendorId, serviceId } = req.params;
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return ResponseUtil.badRequest(res, 'Invalid date format. Use YYYY-MM-DD');
    }

    try {
      const availability = await this.availabilityService.getAvailableSlots(vendorId, serviceId, date);
      return ResponseUtil.success(res, availability);
    } catch (err: any) {
      logger.error('Get availability error:', err);
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/:vendorId/services/:serviceId/availability/multi
   * Query params: startDate=YYYY-MM-DD (optional), days=14 (optional)
   */
  getMultiDayAvailability = async (req: Request, res: Response): Promise<Response> => {
    const { vendorId, serviceId } = req.params;
    const startDate = (req.query.startDate as string) || new Date().toISOString().split('T')[0];
    const days      = Math.min(parseInt((req.query.days as string) || '14', 10), 30);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return ResponseUtil.badRequest(res, 'Invalid startDate format. Use YYYY-MM-DD');
    }

    try {
      const availability = await this.availabilityService.getMultiDayAvailability(
        vendorId,
        serviceId,
        startDate,
        days
      );
      return ResponseUtil.success(res, availability);
    } catch (err: any) {
      logger.error('Get multi-day availability error:', err);
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
