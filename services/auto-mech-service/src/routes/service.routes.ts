import { Router } from 'express';
import { ServiceController } from '../controllers/service.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
const ctrl = new ServiceController();

// ── Public: get services for any vendor (by ID) ───────────────────────────────
router.get('/vendors/:vendorId/services', ctrl.getVendorServices);
router.get('/services/:serviceId',        ctrl.getService);

export default router;
