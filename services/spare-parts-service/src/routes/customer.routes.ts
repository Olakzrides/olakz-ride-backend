import { Router } from 'express';
import { CartController } from '../controllers/cart.controller';
import { OrderController } from '../controllers/order.controller';
import { AddressController } from '../controllers/address.controller';
import { authenticate } from '../middleware/auth.middleware';

const router      = Router();
const cartCtrl    = new CartController();
const orderCtrl   = new OrderController();
const addrCtrl    = new AddressController();

// All customer routes require authentication
router.use(authenticate);

// ── Cart ──────────────────────────────────────────────────────────────────────
router.get('/cart',           cartCtrl.getCart);
router.post('/cart/add',      cartCtrl.addItem);
router.put('/cart/update',    cartCtrl.updateItem);
router.delete('/cart/remove', cartCtrl.removeItem);
router.delete('/cart',        cartCtrl.clearCart);

// ── Orders — static routes MUST come before /:id ──────────────────────────────
router.post('/payment/estimate',        orderCtrl.estimate);
router.post('/orders',                  orderCtrl.placeOrder);
router.get('/orders/history',           orderCtrl.getHistory);
router.get('/orders/:id/tracking',      orderCtrl.getTracking);
router.get('/orders/:id/receipt',       orderCtrl.getReceipt);
router.get('/orders/:id',               orderCtrl.getOrder);
router.post('/orders/:id/cancel',       orderCtrl.cancelOrder);
router.post('/orders/:id/review',       orderCtrl.submitReview);

// ── Saved addresses (shared with marketplace_saved_addresses table) ────────────
router.get('/addresses',       addrCtrl.list);
router.post('/addresses',      addrCtrl.create);
router.put('/addresses/:id',   addrCtrl.update);
router.delete('/addresses/:id', addrCtrl.delete);

export default router;
