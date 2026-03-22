import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { MenuController } from '../controllers/menu.controller';
import { authenticate } from '../middleware/auth.middleware';
import { isVendorApproved } from '../middleware/vendor.middleware';

const router = Router();
const vendorCtrl = new VendorController();
const menuCtrl = new MenuController();

// All vendor routes require authentication + approved vendor status
router.use(authenticate, isVendorApproved);

// ─── 4.1 Profile & Store ──────────────────────────────────────────────────────
router.get('/profile', vendorCtrl.getProfile);
router.put('/profile', vendorCtrl.updateProfile);
router.get('/store-details', vendorCtrl.getStoreDetails);
router.put('/store-details', vendorCtrl.updateStoreDetails);
router.get('/store-operations', vendorCtrl.getStoreOperations);
router.put('/store-operations', vendorCtrl.updateStoreOperations);
router.get('/statistics', vendorCtrl.getStatistics);

// ─── 4.2 Menu Management ─────────────────────────────────────────────────────
router.get('/categories', menuCtrl.getCategories);
router.post('/categories', menuCtrl.createCategory);
router.put('/categories/:id', menuCtrl.updateCategory);
router.delete('/categories/:id', menuCtrl.deleteCategory);

router.get('/products', menuCtrl.getProducts);
router.post('/products', menuCtrl.createProduct);
router.put('/products/:id', menuCtrl.updateProduct);
router.delete('/products/:id', menuCtrl.deleteProduct);
router.put('/products/:id/availability', menuCtrl.updateProductAvailability);

router.get('/extras', menuCtrl.getExtras);
router.post('/extras', menuCtrl.createExtra);
router.put('/extras/:id', menuCtrl.updateExtra);
router.delete('/extras/:id', menuCtrl.deleteExtra);

// ─── Orders ───────────────────────────────────────────────────────────────────
router.get('/orders', vendorCtrl.getOrders);
router.get('/orders/:id', vendorCtrl.getOrder);
router.post('/orders/:id/accept', vendorCtrl.acceptOrder);
router.post('/orders/:id/reject', vendorCtrl.rejectOrder);
router.put('/orders/:id/status', vendorCtrl.updateStatus);
router.put('/orders/:id/preparation-time', vendorCtrl.updatePrepTime);

export default router;
