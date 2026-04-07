import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { isAdmin } from '../middleware/admin.middleware';

const router = Router();
const adminCtrl = new AdminController();

router.use(authenticate);
router.use(isAdmin);

router.get('/stores', adminCtrl.getStores);
router.put('/stores/:id/status', adminCtrl.setStoreStatus);
router.get('/orders', adminCtrl.getOrders);
router.get('/analytics', adminCtrl.getAnalytics);

export default router;
