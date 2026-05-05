import { Router } from 'express';
import { MarketplaceAdminController } from '../controllers/marketplace-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new MarketplaceAdminController();

router.use(adminAuthMiddleware);

// Stores
router.get('/stores', auditMiddleware('marketplace_get_stores'), ctrl.getStores);
router.patch('/stores/:id/status', auditMiddleware('marketplace_set_store_status'), ctrl.setStoreStatus);

// Orders
router.get('/orders', auditMiddleware('marketplace_get_orders'), ctrl.getOrders);

// Analytics
router.get('/analytics', auditMiddleware('marketplace_get_analytics'), ctrl.getAnalytics);

export default router;
