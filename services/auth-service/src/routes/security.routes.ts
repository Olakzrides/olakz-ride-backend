import { Router } from 'express';
import securityController from '../controllers/security.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', securityController.getSettings);
router.patch('/password', securityController.changePassword);
router.patch('/biometric', securityController.updateBiometric);
router.post('/wallet-pin', securityController.setWalletPin);
router.patch('/wallet-pin', securityController.updateWalletPin);
router.post('/wallet-pin/verify', securityController.verifyWalletPin);
router.post('/wallet-pin/remove', securityController.removeWalletPin);

export default router;
