import { Router } from 'express';
import { CartController } from '../controllers/cart.controller';
import { OrderController } from '../controllers/order.controller';
import { getTracking, getReceipt } from '../controllers/order.controller';
import { AddressController } from '../controllers/address.controller';
import { ReviewController } from '../controllers/review.controller';
import { WishlistController } from '../controllers/wishlist.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const cartCtrl = new CartController();
const orderCtrl = new OrderController();
const addrCtrl = new AddressController();
const reviewCtrl = new ReviewController();
const wishlistCtrl = new WishlistController();

router.use(authenticate);

// Cart
router.get('/cart', cartCtrl.getCart);
router.post('/cart/add', cartCtrl.addItem);
router.put('/cart/update', cartCtrl.updateItem);
router.delete('/cart/remove', cartCtrl.removeItem);
router.delete('/cart', cartCtrl.clearCart);

// Orders — static routes BEFORE /:id
router.post('/payment/estimate', orderCtrl.estimate);
router.post('/orders', orderCtrl.placeOrder);
router.get('/orders/history', orderCtrl.getHistory);
router.get('/orders/:id/tracking', getTracking);
router.get('/orders/:id/receipt', getReceipt);
router.get('/orders/:id', orderCtrl.getOrder);
router.post('/orders/:id/cancel', orderCtrl.cancelOrder);
router.post('/orders/:id/review', reviewCtrl.submitReview);

// Saved addresses
router.get('/addresses', addrCtrl.list);
router.post('/addresses', addrCtrl.create);
router.put('/addresses/:id', addrCtrl.update);
router.delete('/addresses/:id', addrCtrl.delete);

// Wishlist
router.get('/wishlist', wishlistCtrl.list);
router.post('/wishlist', wishlistCtrl.add);
router.delete('/wishlist/:product_id', wishlistCtrl.remove);

export default router;
