import { Router } from 'express';
import { AirtimeAdminController } from '../controllers/airtime-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AirtimeAdminController();

router.use(adminAuthMiddleware);

// GET /api/admin/airtime/status-counts  — tab counts (must come before /:transactionId)
router.get('/status-counts', auditMiddleware('airtime_get_status_counts'), ctrl.getStatusCounts);

// GET /api/admin/airtime  — paginated list with filters
router.get('/', auditMiddleware('airtime_get_all'), ctrl.getTransactions);

// GET /api/admin/airtime/:transactionId  — single detail (More button)
router.get('/:transactionId', auditMiddleware('airtime_get_by_id'), ctrl.getTransactionById);

export default router;
