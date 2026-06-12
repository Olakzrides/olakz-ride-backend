import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { AirtimeAdminService } from '../services/airtime-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AirtimeAdminController {

  /**
   * GET /api/admin/airtime/status-counts
   * Tab counts: all, pending, completed, failed, airtime, data.
   *
   * Query params: from, to
   */
  getStatusCounts = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const counts = await AirtimeAdminService.getStatusCounts({
        from: req.query.from as string | undefined,
        to:   req.query.to   as string | undefined,
      });
      ResponseUtil.success(res, counts, 'Airtime & data status counts retrieved');
    } catch (err: unknown) {
      logger.error('airtime getStatusCounts error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve airtime status counts', 'AIRTIME_COUNT_ERROR');
    }
  };

  /**
   * GET /api/admin/airtime
   * Paginated airtime & data transactions.
   *
   * Query params:
   *   page   - default 1
   *   limit  - default 10, max 100
   *   status - all | pending | completed | failed | airtime | data
   *   type   - airtime | data
   *   search - phone number, network
   *   from   - ISO date
   *   to     - ISO date
   */
  getTransactions = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));

      const result = await AirtimeAdminService.getTransactions({
        status: req.query.status as string | undefined,
        type:   req.query.type   as string | undefined,
        search: req.query.search as string | undefined,
        from:   req.query.from   as string | undefined,
        to:     req.query.to     as string | undefined,
        page,
        limit,
      });

      ResponseUtil.success(res, result, 'Airtime & data transactions retrieved');
    } catch (err: unknown) {
      logger.error('getAirtimeTransactions error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve airtime transactions', 'AIRTIME_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/airtime/:transactionId
   * Single transaction detail — the "More" button.
   */
  getTransactionById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const tx = await AirtimeAdminService.getTransactionById(transactionId);

      if (!tx) {
        ResponseUtil.notFound(res, 'Airtime/data transaction');
        return;
      }

      ResponseUtil.success(res, { transaction: tx }, 'Airtime transaction retrieved');
    } catch (err: unknown) {
      logger.error('getAirtimeById error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve transaction', 'AIRTIME_FETCH_ERROR');
    }
  };
}
