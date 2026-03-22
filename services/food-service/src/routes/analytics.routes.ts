import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';
import { authenticate } from '../middleware/auth.middleware';
import { adminAuthMiddleware } from '../middleware/admin.middleware';

const router = Router();
const ctrl = new AnalyticsController();

// Vendor dashboard — authenticated vendor
router.get('/vendor/dashboard', authenticate, ctrl.vendorDashboard);

// Courier earnings — authenticated (courier sees own, admin can pass ?courier_id=)
router.get('/courier/earnings', authenticate, ctrl.courierEarnings);

// Admin-only analytics
router.get('/orders/trends', adminAuthMiddleware, ctrl.orderTrends);
router.get('/customer/behavior', adminAuthMiddleware, ctrl.customerBehavior);

export default router;
