import { Router } from 'express';
import { BankAccountsController } from '../controllers/bank-accounts.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const ctrl = new BankAccountsController();

// Bank list requires auth so users can't scrape it without a token
router.use(authenticate);
router.get('/', ctrl.getBanks);

export default router;
