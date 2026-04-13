import { Router } from 'express';
import { InternalController } from '../controllers/internal.controller';
import { internalApiAuth } from '../middleware/internal-api.middleware';

const router = Router();
const ctrl = new InternalController();

router.use(internalApiAuth);

// Wallet
router.get('/wallet/balance', ctrl.getBalance);
router.post('/wallet/deduct', ctrl.deduct);
router.post('/wallet/credit', ctrl.credit);

// Flutterwave card operations
router.post('/flutterwave/charge-card', ctrl.chargeCard);
router.post('/flutterwave/charge-tokenized', ctrl.chargeTokenizedCard);
router.post('/flutterwave/validate-charge', ctrl.validateCharge);
router.post('/flutterwave/refund', ctrl.refundTransaction);
router.post('/flutterwave/verify-transaction', ctrl.verifyTransaction);

export default router;
