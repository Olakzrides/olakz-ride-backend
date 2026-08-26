import { Router } from 'express';
import { VendorStoreController } from '../controllers/vendor-store.controller';
import { authenticate, requireApprovedVendor } from '../middleware/auth.middleware';

const router  = Router();
const storeCtrl = new VendorStoreController();

// All vendor routes require authentication + approved spare_parts store
router.use(authenticate);
router.use(requireApprovedVendor);

// ── Upload URL (call before creating/updating product images) ──────────────
router.get('/upload-url', storeCtrl.getUploadUrl);

// ── Store profile ──────────────────────────────────────────────────────────
router.get('/store',            storeCtrl.getProfile);
router.put('/store',            storeCtrl.updateProfile);
router.put('/store/status',     storeCtrl.setOpenStatus);
router.get('/store/statistics', storeCtrl.getStatistics);

// ── Products ───────────────────────────────────────────────────────────────
router.get('/products',                    storeCtrl.listProducts);
router.post('/products',                   storeCtrl.createProduct);
router.put('/products/:id',               storeCtrl.updateProduct);
router.delete('/products/:id',            storeCtrl.deleteProduct);
router.put('/products/:id/availability',  storeCtrl.toggleAvailability);

export default router;
