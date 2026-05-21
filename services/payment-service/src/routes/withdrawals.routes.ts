import { Router } from 'express';
import { WithdrawalsController } from '../controllers/withdrawals.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const ctrl = new WithdrawalsController();

// Authenticated routes
router.use(authenticate);
router.post('/', ctrl.initiateWithdrawal);
router.get('/', ctrl.listWithdrawals);

export default router;
