import { Router } from 'express';
import safetyController from '../controllers/safety.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', safetyController.getSettings);
router.patch('/emergency-contact', safetyController.updateEmergencyContact);
router.patch('/alert-timer', safetyController.updateAlertTimer);

export default router;
