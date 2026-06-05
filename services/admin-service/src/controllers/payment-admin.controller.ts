import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { PaymentAdminService } from '../services/payment-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class PaymentAdminController {

  /**
   * GET /api/admin/payments
   * Paginated list of all payment transactions.
   *
   * Query params:
   *   page          - page number (default 1)
   *   limit         - items per page (default 20)
   *   status        - all | succeeded | pending | hold | refunded | failed
   *   paymentMethod - all | wallet | card | cash | earning | withdrawal | refund
   *   from          - ISO date (e.g. 2026-01-01)
   *   to            - ISO date (e.g. 2026-12-31)
   *   search        - search by reference
   */
  getTransactions = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await PaymentAdminService.getTransactions({
        status:        req.query.status        as string | undefined,
        paymentMethod: req.query.paymentMethod as string | undefined,
        from:          req.query.from          as string | undefined,
        to:            req.query.to            as string | undefined,
        search:        req.query.search        as string | undefined,
        page,
        limit,
      });

      ResponseUtil.success(res, result, 'Payment transactions retrieved');
    } catch (err: unknown) {
      logger.error('getTransactions error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve payment transactions', 'PAYMENT_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/payments/overview
   * Summary stats: total, succeeded, pending, refunded, failed counts and amounts.
   *
   * Query params:
   *   from - ISO date
   *   to   - ISO date
   */
  getOverviewStats = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const stats = await PaymentAdminService.getOverviewStats({
        from: req.query.from as string | undefined,
        to:   req.query.to   as string | undefined,
      });

      ResponseUtil.success(res, stats, 'Payment overview retrieved');
    } catch (err: unknown) {
      logger.error('getOverviewStats error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve payment overview', 'PAYMENT_STATS_ERROR');
    }
  };

  /**
   * GET /api/admin/payments/:transactionId
   * Single transaction detail.
   */
  getTransactionById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { transactionId } = req.params;
      const tx = await PaymentAdminService.getTransactionById(transactionId);

      if (!tx) {
        ResponseUtil.notFound(res, 'Payment transaction');
        return;
      }

      ResponseUtil.success(res, { transaction: tx }, 'Payment transaction retrieved');
    } catch (err: unknown) {
      logger.error('getTransactionById error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve payment transaction', 'PAYMENT_FETCH_ERROR');
    }
  };
}
