import { Request, Response } from 'express';
import { ResponseUtil } from '../../../utils/response.util';
import { logger } from '../../../config/logger';
import { DeliveryAnalyticsService } from '../services/delivery-analytics.service';

/**
 * AdminDeliveryController
 * Admin-only endpoints for delivery analytics and management
 */
export class AdminDeliveryController {
  /**
   * Get delivery analytics
   * GET /api/admin/delivery/analytics
   */
  getAnalytics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const regionId = req.query.region_id as string;
      const vehicleTypeId = req.query.vehicle_type_id as string;
      const deliveryType = req.query.delivery_type as 'instant' | 'scheduled';
      const fromDate = req.query.from_date as string;
      const toDate = req.query.to_date as string;
      const period = req.query.period as 'daily' | 'weekly' | 'monthly';

      const analytics = await DeliveryAnalyticsService.getAnalytics({
        regionId,
        vehicleTypeId,
        deliveryType,
        fromDate,
        toDate,
        period,
      });

      return ResponseUtil.success(res, {
        analytics,
        filters: {
          regionId,
          vehicleTypeId,
          deliveryType,
          fromDate,
          toDate,
          period,
        },
      });
    } catch (error: any) {
      logger.error('Get delivery analytics error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch analytics');
    }
  };

  /**
   * Get delivery volume by vehicle type
   * GET /api/admin/delivery/analytics/volume-by-vehicle
   */
  getVolumeByVehicle = async (req: Request, res: Response): Promise<Response> => {
    try {
      const regionId = req.query.region_id as string;
      const fromDate = req.query.from_date as string;
      const toDate = req.query.to_date as string;

      const volumeData = await DeliveryAnalyticsService.getVolumeByVehicleType({
        regionId,
        fromDate,
        toDate,
      });

      return ResponseUtil.success(res, {
        volumeByVehicle: volumeData,
      });
    } catch (error: any) {
      logger.error('Get volume by vehicle error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch volume data');
    }
  };

  /**
   * Get popular routes
   * GET /api/admin/delivery/analytics/popular-routes
   */
  getPopularRoutes = async (req: Request, res: Response): Promise<Response> => {
    try {
      const regionId = req.query.region_id as string;
      const fromDate = req.query.from_date as string;
      const toDate = req.query.to_date as string;
      const limit = parseInt(req.query.limit as string) || 10;

      const routes = await DeliveryAnalyticsService.getPopularRoutes(
        { regionId, fromDate, toDate },
        limit
      );

      return ResponseUtil.success(res, {
        popularRoutes: routes,
        limit,
      });
    } catch (error: any) {
      logger.error('Get popular routes error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch popular routes');
    }
  };

  /**
   * Refresh analytics cache
   * POST /api/admin/delivery/analytics/refresh
   */
  refreshAnalytics = async (_req: Request, res: Response): Promise<Response> => {
    try {
      await DeliveryAnalyticsService.refreshAnalyticsView();

      return ResponseUtil.success(res, {
        message: 'Analytics refreshed successfully',
      });
    } catch (error: any) {
      logger.error('Refresh analytics error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to refresh analytics');
    }
  };

  /**
   * Get disputes
   * GET /api/admin/delivery/disputes
   */
  getDisputes = async (req: Request, res: Response): Promise<Response> => {
    try {
      const status = req.query.status as string;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const { DeliveryIssueService } = await import('../services/delivery-issue.service');
      const result = await DeliveryIssueService.getDisputes({
        status,
        limit,
        offset,
      });

      return ResponseUtil.success(res, {
        disputes: result.disputes,
        pagination: {
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      logger.error('Get disputes error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch disputes');
    }
  };

  /**
   * Resolve dispute
   * POST /api/admin/delivery/disputes/:id/resolve
   */
  resolveDispute = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { resolutionType, refundAmount, penaltyAmount, adminDecision } = req.body;

      // Validate resolution type
      const validTypes = ['refund', 'partial_refund', 'penalty', 'no_action'];
      if (!resolutionType || !validTypes.includes(resolutionType)) {
        return ResponseUtil.badRequest(res, 'Invalid resolution type');
      }

      if (!adminDecision) {
        return ResponseUtil.badRequest(res, 'Admin decision is required');
      }

      const { DeliveryIssueService } = await import('../services/delivery-issue.service');
      const dispute = await DeliveryIssueService.resolveDispute({
        disputeId: id,
        reviewedBy: userId,
        resolutionType,
        refundAmount,
        penaltyAmount,
        adminDecision,
      });

      return ResponseUtil.success(res, {
        dispute: {
          id: dispute.id,
          status: dispute.status,
          resolutionType: dispute.resolution_type,
          reviewedAt: dispute.reviewed_at,
        },
        message: 'Dispute resolved successfully',
      });
    } catch (error: any) {
      logger.error('Resolve dispute error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to resolve dispute');
    }
  };
}
