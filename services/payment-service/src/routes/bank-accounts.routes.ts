import { Router } from 'express';
import { BankAccountsController } from '../controllers/bank-accounts.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const ctrl = new BankAccountsController();

router.use(authenticate);

router.get('/', ctrl.listBankAccounts);
router.post('/', ctrl.addBankAccount);
router.delete('/:id', ctrl.deleteBankAccount);
router.patch('/:id/default', ctrl.setDefaultBankAccount);

export default router;
