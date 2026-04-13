import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const ctrl = new WalletController();

router.use(authenticate);

router.get('/balance', ctrl.getBalance);
router.post('/topup', ctrl.topup);
router.post('/topup/validate', ctrl.validateTopup);
router.get('/transactions', ctrl.getTransactions);

export default router;
