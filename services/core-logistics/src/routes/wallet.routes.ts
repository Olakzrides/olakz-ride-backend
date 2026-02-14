import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const walletController = new WalletController();

// All wallet routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/wallet/topup
 * @desc    Top up wallet using saved card or new card (Step 1: Initiate)
 * @access  Private
 */
router.post('/wallet/topup', walletController.topupWallet);

/**
 * @route   POST /api/wallet/topup/validate
 * @desc    Validate wallet top-up with OTP (Step 2: Complete)
 * @access  Private
 */
router.post('/wallet/topup/validate', walletController.validateTopup);

// Add test funds (FOR TESTING ONLY)
router.post('/wallet/add-test-funds', walletController.addTestFunds);

// Get wallet balance
router.get('/wallet/balance', walletController.getWalletBalance);

// Get transaction history
router.get('/wallet/transactions', walletController.getTransactionHistory);

export default router;