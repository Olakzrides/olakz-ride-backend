import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { AuditService } from '../services/audit.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const svc = new AuditService();

export class AuditController {

  // ── Transactions ─────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/audit/transactions
   * Add one transaction row. Date auto-set to today by backend.
   */
  createTransaction = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const {
        service_type, ride_type,
        charge_price, amount_paid,
        pickup_time, dropoff_time,
        sender_phone, receiver_phone, rider_phone,
        pickup_address, destination,
        staff_on_duty, transaction_expenses,
      } = req.body;

      if (!service_type)                  { ResponseUtil.badRequest(res, 'service_type is required'); return; }
      if (charge_price === undefined)     { ResponseUtil.badRequest(res, 'charge_price is required'); return; }
      if (amount_paid === undefined)      { ResponseUtil.badRequest(res, 'amount_paid is required'); return; }

      const tx = await svc.createTransaction(adminId, {
        serviceType:         service_type,
        rideType:            ride_type,
        chargePrice:         Number(charge_price),
        amountPaid:          Number(amount_paid),
        pickupTime:          pickup_time,
        dropoffTime:         dropoff_time,
        senderPhone:         sender_phone,
        receiverPhone:       receiver_phone,
        riderPhone:          rider_phone,
        pickupAddress:       pickup_address,
        destination,
        staffOnDuty:         staff_on_duty,
        transactionExpenses: transaction_expenses !== undefined ? Number(transaction_expenses) : 0,
      });

      ResponseUtil.created(res, { transaction: tx }, 'Transaction added');
    } catch (err) {
      const msg = toMsg(err);
      if (msg.includes('cannot exceed') || msg.includes('required') || msg.includes('Invalid') || msg.includes('must be')) {
        ResponseUtil.badRequest(res, msg);
      } else {
        logger.error('createTransaction error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to create transaction');
      }
    }
  };

  /**
   * GET /api/admin/audit/transactions?date=YYYY-MM-DD
   */
  listTransactions = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const transactions = await svc.listTransactions(date);
      ResponseUtil.success(res, { transactions, total: transactions.length, date });
    } catch (err) {
      logger.error('listTransactions error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to list transactions');
    }
  };

  /**
   * PUT /api/admin/audit/transactions/:id
   */
  updateTransaction = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const tx = await svc.updateTransaction(req.params.id, adminId, {
        serviceType:         req.body.service_type,
        rideType:            req.body.ride_type,
        chargePrice:         req.body.charge_price !== undefined ? Number(req.body.charge_price) : undefined,
        amountPaid:          req.body.amount_paid  !== undefined ? Number(req.body.amount_paid)  : undefined,
        pickupTime:          req.body.pickup_time,
        dropoffTime:         req.body.dropoff_time,
        senderPhone:         req.body.sender_phone,
        receiverPhone:       req.body.receiver_phone,
        riderPhone:          req.body.rider_phone,
        pickupAddress:       req.body.pickup_address,
        destination:         req.body.destination,
        staffOnDuty:         req.body.staff_on_duty,
        transactionExpenses: req.body.transaction_expenses !== undefined ? Number(req.body.transaction_expenses) : undefined,
      });
      ResponseUtil.success(res, { transaction: tx }, 'Transaction updated');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'LOCKED') {
        ResponseUtil.forbidden(res, 'This transaction is locked and cannot be edited');
      } else if (msg === 'Record not found') {
        ResponseUtil.notFound(res, 'Transaction');
      } else if (msg.includes('cannot exceed') || msg.includes('must be')) {
        ResponseUtil.badRequest(res, msg);
      } else {
        logger.error('updateTransaction error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to update transaction');
      }
    }
  };

  /**
   * DELETE /api/admin/audit/transactions/:id
   */
  deleteTransaction = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      await svc.deleteTransaction(req.params.id);
      ResponseUtil.success(res, null, 'Transaction deleted');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'LOCKED') {
        ResponseUtil.forbidden(res, 'This transaction is locked and cannot be deleted');
      } else if (msg === 'Record not found') {
        ResponseUtil.notFound(res, 'Transaction');
      } else {
        logger.error('deleteTransaction error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to delete transaction');
      }
    }
  };

  // ── Expenditures ─────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/audit/expenditures
   */
  createExpenditure = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const { expenditure_amount, expenditure_reason, expenditure_description } = req.body;

      if (expenditure_amount === undefined) { ResponseUtil.badRequest(res, 'expenditure_amount is required'); return; }
      if (!expenditure_reason)             { ResponseUtil.badRequest(res, 'expenditure_reason is required'); return; }

      const exp = await svc.createExpenditure(adminId, {
        expenditureAmount:      Number(expenditure_amount),
        expenditureReason:      expenditure_reason,
        expenditureDescription: expenditure_description,
      });

      ResponseUtil.created(res, { expenditure: exp }, 'Expenditure added');
    } catch (err) {
      const msg = toMsg(err);
      if (msg.includes('must be') || msg.includes('required')) {
        ResponseUtil.badRequest(res, msg);
      } else {
        logger.error('createExpenditure error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to create expenditure');
      }
    }
  };

  /**
   * GET /api/admin/audit/expenditures?date=YYYY-MM-DD
   */
  listExpenditures = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const expenditures = await svc.listExpenditures(date);
      ResponseUtil.success(res, { expenditures, total: expenditures.length, date });
    } catch (err) {
      logger.error('listExpenditures error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to list expenditures');
    }
  };

  /**
   * PUT /api/admin/audit/expenditures/:id
   */
  updateExpenditure = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const exp = await svc.updateExpenditure(req.params.id, {
        expenditureAmount:      req.body.expenditure_amount !== undefined ? Number(req.body.expenditure_amount) : undefined,
        expenditureReason:      req.body.expenditure_reason,
        expenditureDescription: req.body.expenditure_description,
      });
      ResponseUtil.success(res, { expenditure: exp }, 'Expenditure updated');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'LOCKED') {
        ResponseUtil.forbidden(res, 'This expenditure is locked and cannot be edited');
      } else if (msg === 'Record not found') {
        ResponseUtil.notFound(res, 'Expenditure');
      } else {
        logger.error('updateExpenditure error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to update expenditure');
      }
    }
  };

  /**
   * DELETE /api/admin/audit/expenditures/:id
   */
  deleteExpenditure = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      await svc.deleteExpenditure(req.params.id);
      ResponseUtil.success(res, null, 'Expenditure deleted');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'LOCKED') {
        ResponseUtil.forbidden(res, 'This expenditure is locked and cannot be deleted');
      } else if (msg === 'Record not found') {
        ResponseUtil.notFound(res, 'Expenditure');
      } else {
        logger.error('deleteExpenditure error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to delete expenditure');
      }
    }
  };

  // ── Lock ─────────────────────────────────────────────────────────────────────

  /**
   * POST /api/admin/audit/lock
   * Body: { date: "YYYY-MM-DD" } — defaults to today if not provided
   */
  lockDay = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const date = req.body.date || new Date().toISOString().split('T')[0];
      const result = await svc.lockDay(date);
      ResponseUtil.success(res, result, `All transactions and expenditures for ${date} have been locked`);
    } catch (err) {
      logger.error('lockDay error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to lock the day');
    }
  };

  // ── Summaries ─────────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/audit/summary/daily?date=YYYY-MM-DD
   */
  getDailySummary = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const summary = await svc.getDailySummary(date);
      ResponseUtil.success(res, summary, 'Daily summary retrieved');
    } catch (err) {
      logger.error('getDailySummary error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to get daily summary');
    }
  };

  /**
   * GET /api/admin/audit/summary/monthly?year=2026&month=7
   */
  getMonthlySummary = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const now   = new Date();
      const year  = parseInt(req.query.year  as string) || now.getFullYear();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);

      if (month < 1 || month > 12) { ResponseUtil.badRequest(res, 'month must be between 1 and 12'); return; }

      const summary = await svc.getMonthlySummary(year, month);
      ResponseUtil.success(res, summary, 'Monthly summary retrieved');
    } catch (err) {
      logger.error('getMonthlySummary error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to get monthly summary');
    }
  };

  // ── Export (super_admin only) ─────────────────────────────────────────────────

  /**
   * GET /api/admin/audit/export/daily?date=YYYY-MM-DD
   */
  exportDaily = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
      const csv  = await svc.exportDailyCSV(date);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_${date}.csv"`);
      res.status(200).send(csv);
    } catch (err) {
      logger.error('exportDaily error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to export daily audit sheet');
    }
  };

  /**
   * GET /api/admin/audit/export/monthly?year=2026&month=7
   */
  exportMonthly = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const now   = new Date();
      const year  = parseInt(req.query.year  as string) || now.getFullYear();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);

      if (month < 1 || month > 12) { ResponseUtil.badRequest(res, 'month must be between 1 and 12'); return; }

      const csv = await svc.exportMonthlyCSV(year, month);
      const monthStr = String(month).padStart(2, '0');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit_${year}_${monthStr}.csv"`);
      res.status(200).send(csv);
    } catch (err) {
      logger.error('exportMonthly error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to export monthly audit sheet');
    }
  };
}
