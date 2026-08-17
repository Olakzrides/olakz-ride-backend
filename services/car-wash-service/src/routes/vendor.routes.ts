import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { vendorUpload } from '../middleware/upload.middleware';

const router = Router();
const ctrl = new VendorController();

// ── Static named routes MUST come before /:vendorId ───────────────────────────
// Express matches routes top-to-bottom. If /:vendorId is first,
// "search", "top-rated", "me" all get matched as :vendorId params.

// Public static routes
router.get('/search',    ctrl.searchVendors);
router.get('/top-rated', ctrl.getTopRatedVendors);

// Vendor registration (any authenticated user can apply)
router.post(
  '/register',
  authenticate,
  authorize('customer', 'vendor'),
  ctrl.registerVendor
);

// Vendor-owner: own profile management
router.get(
  '/me/profile',
  authenticate,
  authorize('vendor'),
  ctrl.getMyVendorProfile
);

router.patch(
  '/me/profile',
  authenticate,
  authorize('vendor'),
  ctrl.updateMyVendorProfile
);

router.get(
  '/me/reviews',
  authenticate,
  authorize('vendor'),
  ctrl.getMyReviews
);

router.post(
  '/me/images',
  authenticate,
  authorize('vendor'),
  vendorUpload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
  ]),
  ctrl.uploadVendorImages
);

// ── Dynamic :vendorId routes (public) — must be LAST ─────────────────────────
router.get('/:vendorId/reviews', ctrl.getVendorReviews);
router.get('/:vendorId',         ctrl.getVendorProfile);

export default router;
