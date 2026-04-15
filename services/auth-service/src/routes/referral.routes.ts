import { Router } from 'express';
import referralController from '../controllers/referral.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', referralController.getReferral);
router.patch('/code', referralController.updateCode);

export default router;
