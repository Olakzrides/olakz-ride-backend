import { Router } from 'express';
import { EmailLogController } from '../controllers/email-log.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl   = new EmailLogController();

// All routes require admin auth + RBAC (section: email_notifications)
router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// ── IMPORTANT: specific named routes MUST come before /:logId wildcard ────────

// GET  /api/admin/email-logs/counts          — tab badge counts
router.get(
  '/counts',
  auditMiddleware('email_logs_get_counts'),
  ctrl.getStatusCounts
);

// POST /api/admin/email-logs/resend-failed   — bulk resend all failed
router.post(
  '/resend-failed',
  auditMiddleware('email_logs_resend_failed'),
  ctrl.resendAllFailed
);

// GET  /api/admin/email-logs                 — list with filters
router.get(
  '/',
  auditMiddleware('email_logs_list'),
  ctrl.listLogs
);

// GET  /api/admin/email-logs/:logId          — full detail (body, error, history)
router.get(
  '/:logId',
  auditMiddleware('email_logs_get_by_id'),
  ctrl.getById
);

// POST /api/admin/email-logs/:logId/resend   — resend one email
router.post(
  '/:logId/resend',
  auditMiddleware('email_logs_resend'),
  ctrl.resend
);

export default router;
