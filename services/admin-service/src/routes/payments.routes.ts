import { Router } from 'express';
import { PaymentAdminController } from '../controllers/payment-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new PaymentAdminController();

router.use(adminAuthMiddleware);

// GET /api/admin/payments/overview  — summary stats (must be before /:transactionId)
router.get('/overview', auditMiddleware('payments_get_overview'), ctrl.getOverviewStats);

// GET /api/admin/payments  — paginated list with filters
router.get('/', auditMiddleware('payments_get_all'), ctrl.getTransactions);

// GET /api/admin/payments/:transactionId  — single transaction detail
router.get('/:transactionId', auditMiddleware('payments_get_by_id'), ctrl.getTransactionById);

export default router;
