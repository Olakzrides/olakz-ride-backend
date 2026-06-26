import { Router } from 'express';
import { VendorStoreController } from '../controllers/vendor-store.controller';
import { VendorOrderController } from '../controllers/vendor-order.controller';
import { VendorPromoController } from '../controllers/vendor-promo.controller';
import { authenticate } from '../middleware/auth.middleware';
import { isVendorApproved } from '../middleware/vendor.middleware';

const router = Router();
const storeCtrl = new VendorStoreController();
const orderCtrl = new VendorOrderController();
const promoCtrl = new VendorPromoController();

router.use(authenticate);
router.use(isVendorApproved);

// Upload URL for product images and store media (must hit before creating product)
router.get('/upload-url', storeCtrl.getUploadUrl);

// Store profile
router.get('/store', storeCtrl.getProfile);
router.put('/store', storeCtrl.updateProfile);
router.put('/store/status', storeCtrl.setOpenStatus);
router.get('/store/statistics', storeCtrl.getStatistics);

// Products
router.get('/products', storeCtrl.listProducts);
router.post('/products', storeCtrl.createProduct);
router.put('/products/:id', storeCtrl.updateProduct);
router.delete('/products/:id', storeCtrl.deleteProduct);
router.put('/products/:id/availability', storeCtrl.toggleAvailability);

// Orders
router.get('/orders', orderCtrl.getOrders);
router.get('/orders/:id', orderCtrl.getOrder);
router.post('/orders/:id/accept', orderCtrl.acceptOrder);
router.post('/orders/:id/reject', orderCtrl.rejectOrder);
router.put('/orders/:id/ready', orderCtrl.markReady);

// Analytics & Earnings
router.get('/analytics/dashboard', storeCtrl.getAnalyticsDashboard);
router.get('/analytics/orders', storeCtrl.getAnalyticsOrders);
router.get('/earnings', storeCtrl.getEarnings);

// ─── Promo Campaigns ──────────────────────────────────────────────────────────
router.get('/promos',                   promoCtrl.getAll);
router.post('/promos',                  promoCtrl.create);
router.get('/promos/:promoId',          promoCtrl.getById);
router.patch('/promos/:promoId',        promoCtrl.update);
router.delete('/promos/:promoId',       promoCtrl.delete);
router.patch('/promos/:promoId/pause',  promoCtrl.pause);
router.patch('/promos/:promoId/resume', promoCtrl.resume);
router.patch('/promos/:promoId/end',    promoCtrl.end);
router.get('/promos/:promoId/uses',     promoCtrl.getUses);

export default router;
