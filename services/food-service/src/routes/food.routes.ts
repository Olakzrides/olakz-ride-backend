import { Router } from 'express';
import { RestaurantController } from '../controllers/restaurant.controller';
import { CartController } from '../controllers/cart.controller';
import { OrderController } from '../controllers/order.controller';
import { PaymentController } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const restaurantCtrl = new RestaurantController();
const cartCtrl = new CartController();
const orderCtrl = new OrderController();
const paymentCtrl = new PaymentController();

// ── Public: Restaurant & Menu Browse ──────────────────────────
router.get('/restaurants', restaurantCtrl.listRestaurants);
router.get('/restaurants/:id', restaurantCtrl.getRestaurant);
router.get('/restaurants/:id/menu', restaurantCtrl.getMenu);
router.get('/categories', restaurantCtrl.getCategories);
router.get('/items/:id', restaurantCtrl.getItem);
router.get('/search', restaurantCtrl.search);

// ── Authenticated: Cart ────────────────────────────────────────
router.get('/cart', authenticate, cartCtrl.getCart);
router.post('/cart/add', authenticate, cartCtrl.addItem);
router.put('/cart/update', authenticate, cartCtrl.updateItem);
router.delete('/cart/remove', authenticate, cartCtrl.removeItem);
router.delete('/cart', authenticate, cartCtrl.clearCart);

// ── Authenticated: Orders ──────────────────────────────────────
router.post('/payment/estimate', orderCtrl.estimateTotal);   // public — no auth needed for estimate
router.post('/order', authenticate, orderCtrl.placeOrder);
router.get('/orders/history', authenticate, orderCtrl.getHistory);
router.get('/orders/:id', authenticate, orderCtrl.getOrder);
router.post('/orders/:id/cancel', authenticate, orderCtrl.cancelOrder);
router.post('/orders/:id/rate', authenticate, orderCtrl.rateOrder);

// ── Authenticated: Payments (Phase 3) ─────────────────────────
router.post('/payment/process', authenticate, paymentCtrl.processPayment);
router.post('/payment/validate-otp', authenticate, paymentCtrl.validateOtp);
router.post('/payment/refund', authenticate, paymentCtrl.refundOrder);

export default router;
