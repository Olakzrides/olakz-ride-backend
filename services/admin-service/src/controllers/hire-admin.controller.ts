import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { HireAdminService } from '../services/hire-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class HireAdminController {

  /**
   * GET /api/admin/hire/status-counts
   * Tab badge counts: all, pending, searching, accepted, arrived, in_progress, completed, cancelled
   */
  getStatusCounts = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const counts = await HireAdminService.getStatusCounts({
        from: req.query.from as string | undefined,
        to:   req.query.to   as string | undefined,
      });
      ResponseUtil.success(res, counts, 'Hire status counts retrieved');
    } catch (err) {
      logger.error('hire getStatusCounts error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve hire status counts');
    }
  };

  /**
   * GET /api/admin/hire
   * Paginated hire list with filters.
   * Query: ?status=completed&search=...&from=&to=&page=1&limit=10
   */
  getHires = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

      const result = await HireAdminService.getHires({
        status: req.query.status as string | undefined,
        search: req.query.search as string | undefined,
        from:   req.query.from   as string | undefined,
        to:     req.query.to     as string | undefined,
        page,
        limit,
      });

      ResponseUtil.success(res, result, 'Hires retrieved');
    } catch (err) {
      logger.error('getHires error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve hires');
    }
  };

  /**
   * GET /api/admin/hire/:hireId
   * Full hire detail with customer, driver earnings info
   */
  getHireById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const hire = await HireAdminService.getHireById(req.params.hireId);
      if (!hire) {
        ResponseUtil.notFound(res, 'Hire');
        return;
      }
      ResponseUtil.success(res, { hire }, 'Hire details retrieved');
    } catch (err) {
      logger.error('getHireById error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve hire');
    }
  };
}
