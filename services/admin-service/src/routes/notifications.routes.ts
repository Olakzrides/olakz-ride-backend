import { Router } from 'express';
import { AdminNotificationsController } from '../controllers/admin-notifications.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AdminNotificationsController();

router.use(adminAuthMiddleware);

router.get('/preview', auditMiddleware('notifications_preview'), ctrl.getPreview);
router.get('/', auditMiddleware('notifications_get_all'), ctrl.getAll);

export default router;
