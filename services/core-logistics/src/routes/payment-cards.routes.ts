import { Router } from 'express';
import { PaymentCardsController } from '../controllers/payment-cards.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const paymentCardsController = new PaymentCardsController();

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/payment/cards
 * @desc    Add a new payment card (initiates charge)
 * @access  Private
 */
router.post('/', paymentCardsController.addCard);

/**
 * @route   POST /api/payment/cards/validate
 * @desc    Validate card addition with OTP
 * @access  Private
 */
router.post('/validate', paymentCardsController.validateCardAddition);

/**
 * @route   GET /api/payment/cards
 * @desc    Get user's payment cards
 * @access  Private
 */
router.get('/', paymentCardsController.getCards);

/**
 * @route   GET /api/payment/cards/default
 * @desc    Get user's default payment card
 * @access  Private
 */
router.get('/default', paymentCardsController.getDefaultCard);

/**
 * @route   POST /api/payment/cards/:cardId/set-default
 * @desc    Set a card as default
 * @access  Private
 */
router.post('/:cardId/set-default', paymentCardsController.setDefaultCard);

/**
 * @route   DELETE /api/payment/cards/:cardId
 * @desc    Delete a payment card
 * @access  Private
 */
router.delete('/:cardId', paymentCardsController.deleteCard);

export default router;
