import { Router } from 'express';
import { FoodAdminController } from '../controllers/food-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new FoodAdminController();

router.use(adminAuthMiddleware);

// Orders
router.get('/orders/counts', auditMiddleware('food_get_order_counts'), ctrl.getStatusCounts);
router.get('/orders', auditMiddleware('food_get_orders'), ctrl.getOrders);
router.get('/orders/:id', auditMiddleware('food_get_order_by_id'), ctrl.getOrderById);
router.patch('/orders/:id/status', auditMiddleware('food_update_order_status'), ctrl.updateOrderStatus);

// Vendors (restaurants)
router.get('/vendors', auditMiddleware('food_get_vendors'), ctrl.getVendors);
router.post('/vendors/:id/approve', auditMiddleware('food_approve_vendor'), ctrl.approveVendor);
router.post('/vendors/:id/suspend', auditMiddleware('food_suspend_vendor'), ctrl.suspendVendor);

// Couriers
router.get('/couriers', auditMiddleware('food_get_couriers'), ctrl.getCouriers);

// Analytics
router.get('/analytics', auditMiddleware('food_get_analytics'), ctrl.getAnalytics);
router.get('/analytics/order-trends', auditMiddleware('food_get_order_trends'), ctrl.getOrderTrends);

export default router;
