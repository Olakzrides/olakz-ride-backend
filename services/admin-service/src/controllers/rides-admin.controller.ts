import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { RidesAdminService } from '../services/rides-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class RidesAdminController {

  /**
   * GET /api/admin/rides/status-counts
   * Returns count per status tab: all, pending, accepted, arrived, in_progress, completed, cancelled.
   *
   * Query params:
   *   from - ISO date
   *   to   - ISO date
   */
  getStatusCounts = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const counts = await RidesAdminService.getStatusCounts({
        from: req.query.from as string | undefined,
        to:   req.query.to   as string | undefined,
      });
      ResponseUtil.success(res, counts, 'Ride status counts retrieved');
    } catch (err: unknown) {
      logger.error('getStatusCounts error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve ride status counts', 'RIDES_COUNT_ERROR');
    }
  };

  /**
   * GET /api/admin/rides
   * Paginated ride list with filters.
   *
   * Query params:
   *   page   - page number (default 1)
   *   limit  - items per page (default 10)
   *   status - all | pending | accepted | arrived | in_progress | completed | cancelled
   *   search - search by pickup/dropoff address
   *   from   - ISO date
   *   to     - ISO date
   */
  getRides = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

      const result = await RidesAdminService.getRides({
        status: req.query.status as string | undefined,
        search: req.query.search as string | undefined,
        from:   req.query.from   as string | undefined,
        to:     req.query.to     as string | undefined,
        page,
        limit,
      });

      ResponseUtil.success(res, result, 'Rides retrieved');
    } catch (err: unknown) {
      logger.error('getRides error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve rides', 'RIDES_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/rides/:rideId
   * Full detail of a single ride — the "More" button.
   */
  getRideById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { rideId } = req.params;
      const ride = await RidesAdminService.getRideById(rideId);

      if (!ride) {
        ResponseUtil.notFound(res, 'Ride');
        return;
      }

      ResponseUtil.success(res, { ride }, 'Ride details retrieved');
    } catch (err: unknown) {
      logger.error('getRideById error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve ride', 'RIDE_FETCH_ERROR');
    }
  };
}
