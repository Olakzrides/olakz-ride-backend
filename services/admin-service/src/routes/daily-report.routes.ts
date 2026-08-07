import { Router } from 'express';
import { DailyReportController } from '../controllers/daily-report.controller';
import { adminAuthMiddleware, superAdminMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl   = new DailyReportController();

// All routes require a valid admin JWT + RBAC
router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// ── IMPORTANT: specific named routes MUST come before /:reportId wildcard ────

// Any admin — submit / update their own report (upsert)
router.post(
  '/',
  auditMiddleware('daily_report_upsert'),
  ctrl.upsertReport
);

// Any admin — their own report history
router.get(
  '/my',
  auditMiddleware('daily_report_get_mine'),
  ctrl.getMyReports
);

// Any admin — their own report for today (or ?date=YYYY-MM-DD)
// Must be before /:reportId so "today" isn't matched as a UUID
router.get(
  '/my/today',
  auditMiddleware('daily_report_get_today'),
  ctrl.getMyTodayReport
);

// Super admin only — all staff reports, filterable by date + admin name
router.get(
  '/',
  superAdminMiddleware,
  auditMiddleware('daily_report_get_all'),
  ctrl.getAllReports
);

// Owner or super_admin — delete a report by ID
router.delete(
  '/:reportId',
  auditMiddleware('daily_report_delete'),
  ctrl.deleteReport
);

export default router;
