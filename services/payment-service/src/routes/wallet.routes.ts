import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { VirtualAccountController } from '../controllers/virtual-account.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const ctrl = new WalletController();
const vaCtrl = new VirtualAccountController();

router.use(authenticate);

router.get('/balance', ctrl.getBalance);
router.post('/topup', ctrl.topup);
router.post('/topup/validate', ctrl.validateTopup);
router.get('/transactions', ctrl.getTransactions);

// Wallet-to-wallet transfer by phone number
router.get('/transfer/lookup', ctrl.lookupRecipient);  // Step 1: look up recipient — returns name preview
router.post('/transfer', ctrl.transfer);                // Step 2: execute transfer after confirmation

// Virtual account (bank transfer funding)
router.post('/virtual-account', vaCtrl.getOrCreate);
router.get('/virtual-account', vaCtrl.get);

export default router;
