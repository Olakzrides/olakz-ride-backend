import { Router } from 'express';
import { AdminDeliveryController } from '../controllers/admin-delivery.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { adminAuthMiddleware } from '../../../middleware/admin.middleware';

const router = Router();
const adminDeliveryController = new AdminDeliveryController();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(adminAuthMiddleware);

// Analytics endpoints
router.get('/analytics', adminDeliveryController.getAnalytics);
router.get('/analytics/volume-by-vehicle', adminDeliveryController.getVolumeByVehicle);
router.get('/analytics/popular-routes', adminDeliveryController.getPopularRoutes);
router.post('/analytics/refresh', adminDeliveryController.refreshAnalytics);

// Dispute management
router.get('/disputes', adminDeliveryController.getDisputes);
router.post('/disputes/:id/resolve', adminDeliveryController.resolveDispute);

export default router;
