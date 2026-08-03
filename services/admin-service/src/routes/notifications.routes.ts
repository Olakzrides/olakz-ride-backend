import { Router } from 'express';
import { AdminNotificationsController } from '../controllers/admin-notifications.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AdminNotificationsController();

router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

router.get('/preview', auditMiddleware('notifications_preview'), ctrl.getPreview);
router.get('/', auditMiddleware('notifications_get_all'), ctrl.getAll);

export default router;
