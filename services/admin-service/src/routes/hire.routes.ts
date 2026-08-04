import { Router } from 'express';
import { HireAdminController } from '../controllers/hire-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl   = new HireAdminController();

router.use(adminAuthMiddleware);
router.use(rbacMiddleware);
router.get('/status-counts', auditMiddleware('hire_get_status_counts'), ctrl.getStatusCounts);

// GET /api/admin/hire  — paginated list with filters
router.get('/', auditMiddleware('hire_get_all'), ctrl.getHires);

// GET /api/admin/hire/:hireId  — single hire detail
router.get('/:hireId', auditMiddleware('hire_get_by_id'), ctrl.getHireById);

export default router;
