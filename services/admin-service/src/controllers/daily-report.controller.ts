import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { DailyReportService } from '../services/daily-report.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class DailyReportController {

  /**
   * POST /api/admin/daily-reports
   * Upsert the calling admin's report for a given date.
   * admin_name is auto-filled from the DB — never from the request body.
   */
  upsertReport = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const { report_date, department, tasks, notes } = req.body;

      if (!report_date)  { ResponseUtil.badRequest(res, 'report_date is required'); return; }
      if (!department)   { ResponseUtil.badRequest(res, 'department is required');  return; }
      if (!Array.isArray(tasks)) { ResponseUtil.badRequest(res, 'tasks must be an array'); return; }

      const report = await DailyReportService.upsertReport(adminId, {
        reportDate: report_date,
        department,
        tasks,
        notes,
      });

      ResponseUtil.success(res, { report }, 'Report saved successfully');
    } catch (err) {
      const msg = toMsg(err);
      if (msg.includes('required') || msg.includes('must be') || msg.includes('format') || msg.includes('status')) {
        ResponseUtil.badRequest(res, msg);
      } else {
        logger.error('upsertReport error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to save report');
      }
    }
  };

  /**
   * GET /api/admin/daily-reports/my?page=1&limit=20
   * Returns the calling admin's own reports, newest first.
   */
  getMyReports = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const page    = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await DailyReportService.getMyReports(adminId, page, limit);
      ResponseUtil.success(res, result, 'Reports retrieved');
    } catch (err) {
      logger.error('getMyReports error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve reports');
    }
  };

  /**
   * GET /api/admin/daily-reports/my/today
   * Returns the calling admin's report for today, or null if not submitted.
   * Accepts optional ?date=YYYY-MM-DD to check a specific date.
   */
  getMyTodayReport = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user!.id;
      const date    = req.query.date as string | undefined;

      const report = await DailyReportService.getMyReportForDate(adminId, date);
      ResponseUtil.success(res, { report }, report ? 'Report retrieved' : 'No report submitted yet');
    } catch (err) {
      logger.error('getMyTodayReport error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve report');
    }
  };

  /**
   * DELETE /api/admin/daily-reports/:reportId
   * Owner or super_admin may delete.
   */
  deleteReport = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId    = req.user!.id;
      const adminRoles = req.user!.roles;

      await DailyReportService.deleteReport(req.params.reportId, adminId, adminRoles);
      ResponseUtil.success(res, null, 'Report deleted');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'FORBIDDEN') {
        ResponseUtil.forbidden(res, 'You can only delete your own reports');
      } else if (msg === 'Report not found') {
        ResponseUtil.notFound(res, 'Report');
      } else {
        logger.error('deleteReport error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to delete report');
      }
    }
  };

  /**
   * GET /api/admin/daily-reports?date=YYYY-MM-DD&admin_name=John&page=1&limit=50
   * Super admin only — all staff reports for a given date.
   */
  getAllReports = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page      = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit     = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
      const date      = req.query.date       as string | undefined;
      const adminName = req.query.admin_name as string | undefined;

      const result = await DailyReportService.getAllReports({ date, adminName, page, limit });
      ResponseUtil.success(res, result, 'All staff reports retrieved');
    } catch (err) {
      logger.error('getAllReports error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve reports');
    }
  };
}
