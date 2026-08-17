import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { DeliveriesAdminService } from '../services/deliveries-admin.service';
import { ResponseUtil } from '../utils/response';
import { emptyIfNoRole } from '../middleware/rbac.middleware';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class DeliveriesAdminController {

  /**
   * GET /api/admin/deliveries/status-counts
   * Tab counts: all, pending, accepted, arrived, in_progress, completed, cancelled.
   *
   * Query params: from, to
   */
  getStatusCounts = async (req: AdminRequest, res: Response): Promise<void> => {
    if (emptyIfNoRole(req as any, res, { all: 0, pending: 0, accepted: 0, arrived: 0, in_progress: 0, completed: 0, cancelled: 0 })) return;
    try {
      const counts = await DeliveriesAdminService.getStatusCounts({
        from: req.query.from as string | undefined,
        to:   req.query.to   as string | undefined,
      });
      ResponseUtil.success(res, counts, 'Delivery status counts retrieved');
    } catch (err: unknown) {
      logger.error('deliveries getStatusCounts error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve delivery status counts', 'DELIVERIES_COUNT_ERROR');
    }
  };

  getDeliveries = async (req: AdminRequest, res: Response): Promise<void> => {
    if (emptyIfNoRole(req as any, res, { deliveries: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } })) return;
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

      const result = await DeliveriesAdminService.getDeliveries({
        status: req.query.status as string | undefined,
        search: req.query.search as string | undefined,
        from:   req.query.from   as string | undefined,
        to:     req.query.to     as string | undefined,
        page,
        limit,
      });

      ResponseUtil.success(res, result, 'Deliveries retrieved');
    } catch (err: unknown) {
      logger.error('getDeliveries error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve deliveries', 'DELIVERIES_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/deliveries/:deliveryId
   * Full detail of a single delivery — the "More" button.
   */
  getDeliveryById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { deliveryId } = req.params;
      const delivery = await DeliveriesAdminService.getDeliveryById(deliveryId);

      if (!delivery) {
        ResponseUtil.notFound(res, 'Delivery');
        return;
      }

      ResponseUtil.success(res, { delivery }, 'Delivery details retrieved');
    } catch (err: unknown) {
      logger.error('getDeliveryById error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve delivery', 'DELIVERY_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/deliveries/pricing/promo
   * List all delivery_fare_config rows with their current promo settings.
   * Admin sees which vehicle types / city tiers have the promo enabled.
   */
  getPromoConfigs = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const configs = await DeliveriesAdminService.getPromoConfigs();
      ResponseUtil.success(res, { configs }, 'Delivery promo configs retrieved');
    } catch (err: unknown) {
      logger.error('getPromoConfigs error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve promo configs', 'PROMO_FETCH_ERROR');
    }
  };

  /**
   * PATCH /api/admin/deliveries/pricing/promo/:configId
   * Admin sets promo_display_enabled and promo_display_multiplier on a specific
   * delivery_fare_config row.
   *
   * Body: { "promo_display_enabled": true, "promo_display_multiplier": 1.75 }
   *
   * This is the ONLY place the promo fields are set — they are NOT synced from
   * marketplace pricing because the promo is delivery-specific.
   */
  updatePromoConfig = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }

      const { configId } = req.params;
      const { promo_display_enabled, promo_display_multiplier } = req.body;

      if (promo_display_enabled === undefined && promo_display_multiplier === undefined) {
        ResponseUtil.badRequest(res, 'Provide at least one of: promo_display_enabled, promo_display_multiplier');
        return;
      }

      if (
        promo_display_multiplier !== undefined &&
        promo_display_multiplier !== 0 &&
        promo_display_multiplier <= 1
      ) {
        ResponseUtil.badRequest(res, 'promo_display_multiplier must be 0 (disabled) or greater than 1 — e.g. 1.75');
        return;
      }

      const config = await DeliveriesAdminService.updatePromoConfig(
        configId, adminId, { promo_display_enabled, promo_display_multiplier }
      );
      ResponseUtil.success(res, { config }, 'Delivery promo config updated');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Config not found') { ResponseUtil.notFound(res, 'Delivery fare config'); return; }
      logger.error('updatePromoConfig error', { error: msg });
      ResponseUtil.serverError(res, msg, 'PROMO_UPDATE_ERROR');
    }
  };
}
