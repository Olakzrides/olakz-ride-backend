import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { EmailLogService } from '../services/email-log.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class EmailLogController {

  /**
   * GET /api/admin/email-logs
   * List all email logs with filters.
   *
   * Query params:
   *   search     — recipient email or subject (partial, case-insensitive)
   *   status     — all | sent | failed | pending
   *   email_type — all | otp | welcome | driver_approval | driver_rejection | admin_pending | admin_approval | other
   *   from       — YYYY-MM-DD
   *   to         — YYYY-MM-DD
   *   page       — default 1
   *   limit      — default 20
   */
  listLogs = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await EmailLogService.listLogs({
        search:    req.query.search     as string | undefined,
        status:    req.query.status     as any,
        emailType: req.query.email_type as string | undefined,
        from:      req.query.from       as string | undefined,
        to:        req.query.to         as string | undefined,
        page,
        limit,
      });

      ResponseUtil.success(res, result, 'Email logs retrieved');
    } catch (err) {
      logger.error('listLogs error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve email logs');
    }
  };

  /**
   * GET /api/admin/email-logs/counts
   * Status counts for filter tabs: { all, sent, failed, pending }
   */
  getStatusCounts = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const counts = await EmailLogService.getStatusCounts();
      ResponseUtil.success(res, counts, 'Email log counts retrieved');
    } catch (err) {
      logger.error('getStatusCounts error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve email log counts');
    }
  };

  /**
   * GET /api/admin/email-logs/:logId
   * Full detail of one email including body_html, error_message, resend history.
   */
  getById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const log = await EmailLogService.getById(req.params.logId);
      ResponseUtil.success(res, { log }, 'Email log retrieved');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'Email log not found') {
        ResponseUtil.notFound(res, 'Email log');
      } else {
        logger.error('getById error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to retrieve email log');
      }
    }
  };

  /**
   * POST /api/admin/email-logs/:logId/resend
   * Resend a specific email by its log ID.
   */
  resend = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      await EmailLogService.resend(req.params.logId);
      ResponseUtil.success(res, null, 'Email resent successfully');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'Email log not found') {
        ResponseUtil.notFound(res, 'Email log');
      } else {
        logger.error('resend error', { error: msg });
        ResponseUtil.serverError(res, msg.startsWith('Resend failed') ? msg : 'Failed to resend email');
      }
    }
  };

  /**
   * POST /api/admin/email-logs/resend-failed
   * Bulk resend all emails with status = 'failed'.
   * Returns { resent, failed } counts.
   */
  resendAllFailed = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const result = await EmailLogService.resendAllFailed();
      ResponseUtil.success(
        res,
        result,
        `Bulk resend complete: ${result.resent} sent, ${result.failed} still failed`
      );
    } catch (err) {
      logger.error('resendAllFailed error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to bulk resend emails');
    }
  };
}
