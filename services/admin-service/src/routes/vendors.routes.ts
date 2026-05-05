import { Router } from 'express';
import { VendorAdminController } from '../controllers/vendor-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new VendorAdminController();

router.use(adminAuthMiddleware);

router.get('/', auditMiddleware('vendor_get_all'), ctrl.getAll);
router.get('/:id', auditMiddleware('vendor_get_by_id'), ctrl.getById);
router.put('/:id/approve', auditMiddleware('vendor_approve'), ctrl.approve);
router.put('/:id/reject', auditMiddleware('vendor_reject'), ctrl.reject);

export default router;
