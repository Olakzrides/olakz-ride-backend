import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const walletController = new WalletController();

// All wallet routes require authentication
router.use(authenticate);

// Add test funds (FOR TESTING ONLY)
router.post('/wallet/add-test-funds', walletController.addTestFunds);

// Get wallet balance
router.get('/wallet/balance', walletController.getWalletBalance);

// Get transaction history
router.get('/wallet/transactions', walletController.getTransactionHistory);

export default router;