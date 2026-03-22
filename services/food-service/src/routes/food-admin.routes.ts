import { Router } from 'express';
import { FoodAdminController } from '../controllers/food-admin.controller';
import { adminAuthMiddleware } from '../middleware/admin.middleware';

const router = Router();
const ctrl = new FoodAdminController();

router.use(adminAuthMiddleware);

router.get('/orders', ctrl.getOrders);
router.put('/orders/:id/status', ctrl.updateOrderStatus);
router.get('/vendors', ctrl.getVendors);
router.get('/couriers', ctrl.getCouriers);
router.get('/analytics', ctrl.getAnalytics);

export default router;
