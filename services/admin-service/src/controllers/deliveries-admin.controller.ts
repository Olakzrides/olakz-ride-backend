import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { DeliveriesAdminService } from '../services/deliveries-admin.service';
import { ResponseUtil } from '../utils/response';
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

  /**
   * GET /api/admin/deliveries
   * Paginated delivery list with filters.
   *
   * Query params:
   *   page   - default 1
   *   limit  - default 10, max 100
   *   status - all | pending | accepted | arrived | in_progress | completed | cancelled
   *   search - pickup/dropoff address, recipient name, order number
   *   from   - ISO date
   *   to     - ISO date
   */
  getDeliveries = async (req: AdminRequest, res: Response): Promise<void> => {
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
}
