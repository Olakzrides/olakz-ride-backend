import { Router } from 'express';
import { VendorOrderController } from '../controllers/vendor-order.controller';
import { authenticate, requireApprovedVendor } from '../middleware/auth.middleware';

const router    = Router();
const orderCtrl = new VendorOrderController();

// All vendor order routes require authentication + approved spare_parts store
// requireApprovedVendor also injects req.storeId for downstream use
router.use(authenticate);
router.use(requireApprovedVendor);

// GET  /api/spare-parts/vendor/orders?status=pending&limit=20&page=1
router.get('/',           orderCtrl.getOrders);

// GET  /api/spare-parts/vendor/orders/:id
router.get('/:id',        orderCtrl.getOrder);

// POST /api/spare-parts/vendor/orders/:id/accept
router.post('/:id/accept', orderCtrl.acceptOrder);

// POST /api/spare-parts/vendor/orders/:id/reject  — body: { reason }
router.post('/:id/reject', orderCtrl.rejectOrder);

// PUT  /api/spare-parts/vendor/orders/:id/ready
router.put('/:id/ready',   orderCtrl.markReady);

export default router;
