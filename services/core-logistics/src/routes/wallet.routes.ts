import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { authenticate } from '../middleware/auth.middleware';
import { internalApiAuth } from '../middleware/internal-api.middleware';

const router = Router();
const walletController = new WalletController();

// Internal service-to-service routes (no JWT, uses internal API key)
router.get('/wallet/internal/balance', internalApiAuth, walletController.getWalletBalanceInternal);
router.post('/wallet/internal/deduct', internalApiAuth, walletController.deductFromWalletInternal);
router.post('/wallet/internal/credit', internalApiAuth, walletController.creditWalletInternal);

// JWT-protected routes (explicit authenticate on each)
router.post('/wallet/topup', authenticate, walletController.topupWallet);
router.post('/wallet/topup/validate', authenticate, walletController.validateTopup);
router.post('/wallet/add-test-funds', authenticate, walletController.addTestFunds);
router.get('/wallet/balance', authenticate, walletController.getWalletBalance);
router.get('/wallet/transactions', authenticate, walletController.getTransactionHistory);

export default router;