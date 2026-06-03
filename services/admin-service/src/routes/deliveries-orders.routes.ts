import { Router } from 'express';
import { DeliveriesAdminController } from '../controllers/deliveries-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new DeliveriesAdminController();

router.use(adminAuthMiddleware);

// GET /api/admin/deliveries/status-counts  — tab counts (must come before /:deliveryId)
router.get('/status-counts', auditMiddleware('deliveries_get_status_counts'), ctrl.getStatusCounts);

// GET /api/admin/deliveries  — paginated list with filters
router.get('/', auditMiddleware('deliveries_get_all'), ctrl.getDeliveries);

// GET /api/admin/deliveries/:deliveryId  — single delivery detail (More button)
router.get('/:deliveryId', auditMiddleware('deliveries_get_by_id'), ctrl.getDeliveryById);

export default router;
