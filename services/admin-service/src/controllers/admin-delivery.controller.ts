import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { DeliveryAnalyticsService } from '../services/delivery-analytics.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';
import { supabase } from '../config/database';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AdminDeliveryController {
  getAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const analytics = await DeliveryAnalyticsService.getAnalytics({
        regionId: req.query.region_id as string,
        vehicleTypeId: req.query.vehicle_type_id as string,
        deliveryType: req.query.delivery_type as 'instant' | 'scheduled',
        fromDate: req.query.from_date as string,
        toDate: req.query.to_date as string,
        period: req.query.period as 'daily' | 'weekly' | 'monthly',
      });
      ResponseUtil.success(res, { analytics });
    } catch (err: unknown) {
      logger.error('getAnalytics error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err) || 'Failed to fetch analytics');
    }
  };

  getVolumeByVehicle = async (req: Request, res: Response): Promise<void> => {
    try {
      const volumeData = await DeliveryAnalyticsService.getVolumeByVehicleType({
        regionId: req.query.region_id as string,
        fromDate: req.query.from_date as string,
        toDate: req.query.to_date as string,
      });
      ResponseUtil.success(res, { volumeByVehicle: volumeData });
    } catch (err: unknown) {
      logger.error('getVolumeByVehicle error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err) || 'Failed to fetch volume data');
    }
  };

  getPopularRoutes = async (req: Request, res: Response): Promise<void> => {
    try {
      const routes = await DeliveryAnalyticsService.getPopularRoutes(
        { regionId: req.query.region_id as string, fromDate: req.query.from_date as string, toDate: req.query.to_date as string },
        parseInt(req.query.limit as string) || 10
      );
      ResponseUtil.success(res, { popularRoutes: routes });
    } catch (err: unknown) {
      logger.error('getPopularRoutes error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err) || 'Failed to fetch popular routes');
    }
  };

  refreshAnalytics = async (_req: Request, res: Response): Promise<void> => {
    try {
      await DeliveryAnalyticsService.refreshAnalyticsView();
      ResponseUtil.success(res, { message: 'Analytics refreshed successfully' });
    } catch (err: unknown) {
      logger.error('refreshAnalytics error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err) || 'Failed to refresh analytics');
    }
  };

  getDisputes = async (req: Request, res: Response): Promise<void> => {
    try {
      const status = req.query.status as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      let query = supabase.from('delivery_disputes').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      const { data: disputes, count, error } = await query.range(offset, offset + limit - 1);
      if (error) throw new Error(error.message);

      ResponseUtil.success(res, { disputes: disputes || [], pagination: { total: count || 0, limit, offset } });
    } catch (err: unknown) {
      logger.error('getDisputes error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err) || 'Failed to fetch disputes');
    }
  };

  resolveDispute = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) { ResponseUtil.unauthorized(res); return; }

      const { id } = req.params;
      const { resolutionType, refundAmount, penaltyAmount, adminDecision } = req.body;

      const validTypes = ['refund', 'partial_refund', 'penalty', 'no_action'];
      if (!resolutionType || !validTypes.includes(resolutionType)) { ResponseUtil.badRequest(res, 'Invalid resolution type'); return; }
      if (!adminDecision) { ResponseUtil.badRequest(res, 'Admin decision is required'); return; }

      const { data: dispute, error } = await supabase
        .from('delivery_disputes')
        .update({
          status: 'resolved',
          resolution_type: resolutionType,
          refund_amount: refundAmount,
          penalty_amount: penaltyAmount,
          admin_decision: adminDecision,
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      ResponseUtil.success(res, { dispute, message: 'Dispute resolved successfully' });
    } catch (err: unknown) {
      logger.error('resolveDispute error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err) || 'Failed to resolve dispute');
    }
  };
}
