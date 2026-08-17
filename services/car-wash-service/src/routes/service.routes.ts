import { Router } from 'express';
import { ServiceController } from '../controllers/service.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
const ctrl = new ServiceController();

// ── Vendor-owner: manage own services ─────────────────────────────────────────
// MUST be declared before /:vendorId routes — otherwise Express matches
// the literal string "me" as the :vendorId parameter.

router.get(
  '/vendors/me/services',
  authenticate,
  authorize('vendor'),
  ctrl.getMyServices
);

router.post(
  '/vendors/me/services',
  authenticate,
  authorize('vendor'),
  ctrl.createService
);

router.patch(
  '/vendors/me/services/:serviceId',
  authenticate,
  authorize('vendor'),
  ctrl.updateService
);

router.delete(
  '/vendors/me/services/:serviceId',
  authenticate,
  authorize('vendor'),
  ctrl.deleteService
);

// ── Public: get services for any vendor (by ID) ───────────────────────────────
router.get('/vendors/:vendorId/services', ctrl.getVendorServices);
router.get('/services/:serviceId',        ctrl.getService);

export default router;
