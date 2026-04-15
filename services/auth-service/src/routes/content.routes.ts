import { Router } from 'express';
import contentController from '../controllers/content.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/:key', contentController.getContent);

export default router;
