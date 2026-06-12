import { Router } from 'express';
import { RidesAdminController } from '../controllers/rides-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new RidesAdminController();

router.use(adminAuthMiddleware);

// GET /api/admin/rides/status-counts  — tab counts (must come before /:rideId)
router.get('/status-counts', auditMiddleware('rides_get_status_counts'), ctrl.getStatusCounts);

// GET /api/admin/rides  — paginated list with filters
router.get('/', auditMiddleware('rides_get_all'), ctrl.getRides);

// GET /api/admin/rides/:rideId  — single ride detail (More button)
router.get('/:rideId', auditMiddleware('rides_get_by_id'), ctrl.getRideById);

export default router;
