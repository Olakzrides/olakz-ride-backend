import { Router } from 'express';
import { AdminDeliveryController } from '../controllers/admin-delivery.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AdminDeliveryController();

router.use(adminAuthMiddleware);

router.get('/analytics', auditMiddleware('get_delivery_analytics'), ctrl.getAnalytics);
router.get('/analytics/volume-by-vehicle', auditMiddleware('get_volume_by_vehicle'), ctrl.getVolumeByVehicle);
router.get('/analytics/popular-routes', auditMiddleware('get_popular_routes'), ctrl.getPopularRoutes);
router.post('/analytics/refresh', auditMiddleware('refresh_analytics'), ctrl.refreshAnalytics);
router.get('/disputes', auditMiddleware('get_disputes'), ctrl.getDisputes);
router.post('/disputes/:id/resolve', auditMiddleware('resolve_dispute'), ctrl.resolveDispute);

export default router;
