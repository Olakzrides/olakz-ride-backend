import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { vendorUpload } from '../middleware/upload.middleware';

const router = Router();
const ctrl = new VendorController();

// ── Static named routes MUST come before /:vendorId ───────────────────────────

// Public discovery routes
router.get('/search',    ctrl.searchVendors);
router.get('/top-rated', ctrl.getTopRatedVendors);

// Vendor registration — any authenticated user can apply to become a vendor
router.post(
  '/register',
  authenticate,
  authorize('customer', 'vendor'),
  ctrl.registerVendor
);

// Upload cover/logo images — kept here because it uses multipart/form-data
// All other vendor dashboard operations are under /api/car-wash/vendor/*
router.post(
  '/me/images',
  authenticate,
  authorize('vendor'),
  vendorUpload.fields([
    { name: 'cover', maxCount: 1 },
    { name: 'logo',  maxCount: 1 },
  ]),
  ctrl.uploadVendorImages
);

// ── Dynamic :vendorId routes (public) — must be LAST ─────────────────────────
router.get('/:vendorId/reviews',    ctrl.getVendorReviews);
router.get('/:vendorId/categories', ctrl.getVendorCategories);
router.get('/:vendorId',            ctrl.getVendorProfile);

export default router;
