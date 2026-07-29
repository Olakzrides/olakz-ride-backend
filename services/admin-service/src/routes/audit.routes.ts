import { Router } from 'express';
import { AuditController } from '../controllers/audit.controller';
import { adminAuthMiddleware, superAdminMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl   = new AuditController();

// All audit routes require admin authentication
router.use(adminAuthMiddleware);

// ── Transactions ──────────────────────────────────────────────────────────────
// POST   /api/admin/audit/transactions           — add a row (date auto-set to today)
// GET    /api/admin/audit/transactions?date=     — list rows for a date
// PUT    /api/admin/audit/transactions/:id       — update (locked = 403)
// DELETE /api/admin/audit/transactions/:id       — delete (locked = 403)
router.post(  '/transactions',     auditMiddleware('audit_create_transaction'),  ctrl.createTransaction);
router.get(   '/transactions',     auditMiddleware('audit_list_transactions'),   ctrl.listTransactions);
router.put(   '/transactions/:id', auditMiddleware('audit_update_transaction'),  ctrl.updateTransaction);
router.delete('/transactions/:id', auditMiddleware('audit_delete_transaction'),  ctrl.deleteTransaction);

// ── Expenditures ──────────────────────────────────────────────────────────────
// POST   /api/admin/audit/expenditures           — add daily expenditure
// GET    /api/admin/audit/expenditures?date=     — list expenditures for a date
// PUT    /api/admin/audit/expenditures/:id       — update (locked = 403)
// DELETE /api/admin/audit/expenditures/:id       — delete (locked = 403)
router.post(  '/expenditures',     auditMiddleware('audit_create_expenditure'),  ctrl.createExpenditure);
router.get(   '/expenditures',     auditMiddleware('audit_list_expenditures'),   ctrl.listExpenditures);
router.put(   '/expenditures/:id', auditMiddleware('audit_update_expenditure'),  ctrl.updateExpenditure);
router.delete('/expenditures/:id', auditMiddleware('audit_delete_expenditure'),  ctrl.deleteExpenditure);

// ── Lock (Submit Today's Transactions) ────────────────────────────────────────
// POST /api/admin/audit/lock   Body: { date? } defaults to today
router.post('/lock', auditMiddleware('audit_lock_day'), ctrl.lockDay);

// ── Summaries ─────────────────────────────────────────────────────────────────
// GET /api/admin/audit/summary/daily?date=YYYY-MM-DD
// GET /api/admin/audit/summary/monthly?year=2026&month=7
router.get('/summary/daily',   auditMiddleware('audit_daily_summary'),   ctrl.getDailySummary);
router.get('/summary/monthly', auditMiddleware('audit_monthly_summary'), ctrl.getMonthlySummary);

// ── Export — super_admin only ─────────────────────────────────────────────────
// GET /api/admin/audit/export/daily?date=YYYY-MM-DD   → CSV download
// GET /api/admin/audit/export/monthly?year=&month=    → CSV download
router.get('/export/daily',   superAdminMiddleware, auditMiddleware('audit_export_daily'),   ctrl.exportDaily);
router.get('/export/monthly', superAdminMiddleware, auditMiddleware('audit_export_monthly'), ctrl.exportMonthly);

export default router;
