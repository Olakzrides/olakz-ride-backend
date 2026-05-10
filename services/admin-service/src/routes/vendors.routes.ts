import { Router } from 'express';
import { VendorAdminController } from '../controllers/vendor-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new VendorAdminController();

router.use(adminAuthMiddleware);

// ─── Existing: listing and approval ──────────────────────────────────────────
router.get('/', auditMiddleware('vendor_get_all'), ctrl.getAll);
router.put('/:id/approve', auditMiddleware('vendor_approve'), ctrl.approve);
router.put('/:id/reject', auditMiddleware('vendor_reject'), ctrl.reject);

router.get('/:id', auditMiddleware('vendor_get_by_id'), ctrl.getById);
router.get('/:id/view-order-history', auditMiddleware('vendor_get_order_history'), ctrl.getVendorOrders);
router.patch('/:id/suspend', auditMiddleware('vendor_suspend'), ctrl.suspendVendor);
router.patch('/:id/terminate', auditMiddleware('vendor_terminate'), ctrl.terminateVendor);

export default router;
