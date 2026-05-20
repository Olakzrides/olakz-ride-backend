import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { AdminRemittanceService } from '../services/admin-remittance.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AdminRemittanceController {
  private service = new AdminRemittanceService();

  /**
   * GET /api/admin/remittance/:driverId/status
   * View a driver's remittance status + last 20 log entries.
   */
  getDriverRemittanceStatus = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverId } = req.params;
      const result = await this.service.getDriverRemittanceStatus(driverId);

      if (!result) {
        ResponseUtil.notFound(res, 'Driver');
        return;
      }

      ResponseUtil.success(res, result, 'Driver remittance status retrieved successfully');
    } catch (err: unknown) {
      logger.error('getDriverRemittanceStatus error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to get driver remittance status', 'REMITTANCE_STATUS_ERROR');
    }
  };

  /**
   * POST /api/admin/remittance/:driverId/pay-cash
   * Record a cash payment made by the driver at the office.
   * Body: { amount_paid: number, notes?: string }
   */
  recordCashPayment = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const { driverId } = req.params;
      const { amount_paid, notes } = req.body;

      if (!amount_paid || typeof amount_paid !== 'number' || amount_paid <= 0) {
        ResponseUtil.badRequest(res, 'amount_paid must be a positive number', 'INVALID_AMOUNT');
        return;
      }

      const result = await this.service.recordCashPayment({
        driverId,
        amountPaid: amount_paid,
        adminId,
        notes,
      });

      if (!result.success) {
        ResponseUtil.badRequest(res, result.error!, 'CASH_PAYMENT_FAILED');
        return;
      }

      logger.info('Admin recorded cash remittance payment', { adminId, driverId, amount: amount_paid });

      ResponseUtil.success(
        res,
        {
          settled_amount: result.settledAmount,
          driver_unblocked: result.unblocked,
        },
        `Cash payment of ₦${result.settledAmount.toLocaleString()} recorded successfully.${result.unblocked ? ' Driver has been unblocked and can now accept rides.' : ''}`
      );
    } catch (err: unknown) {
      logger.error('recordCashPayment error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to record cash payment', 'CASH_PAYMENT_ERROR');
    }
  };
}
