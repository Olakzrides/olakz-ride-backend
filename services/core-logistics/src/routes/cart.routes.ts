import { Router } from 'express';
import { CartController } from '../controllers/cart.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const cartController = new CartController();

// All cart routes require authentication
router.use(authenticate);

// Create ride cart
router.post('/ride/cart', cartController.createRideCart);

// Update cart dropoff
router.put('/carts/:cartId/dropoff', cartController.updateCartDropoff);

// Add line item to cart
router.post('/carts/:cartId/line-items', cartController.addLineItemToCart);

// Get cart details
router.get('/carts/:cartId', cartController.getCart);

export default router;
