import { Router } from 'express';
import profileController from '../controllers/profile.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

router.get('/', profileController.getProfile);
router.patch('/', profileController.updateProfile);
router.patch('/avatar', profileController.updateAvatar);
router.patch('/notifications', profileController.updateNotifications);
router.patch('/language', profileController.updateLanguage);

export default router;
