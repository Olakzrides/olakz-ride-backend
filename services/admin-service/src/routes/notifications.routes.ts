import { Router } from 'express';
import { AdminNotificationsController } from '../controllers/admin-notifications.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AdminNotificationsController();

router.use(adminAuthMiddleware);

/**
 * GET /api/admin/notifications/preview
 *
 * Latest 5–10 notifications for the dashboard bell icon.
 * Query: limit (default 10, max 10)
 *
 * Example: GET /api/admin/notifications/preview
 *          GET /api/admin/notifications/preview?limit=5
 */
router.get('/preview', auditMiddleware('notifications_preview'), ctrl.getPreview);

/**
 * GET /api/admin/notifications
 *
 * All notifications paginated (max 20 per page).
 * Called when admin clicks "View all".
 *
 * Query:
 *   type  - new_user | new_driver | new_vendor | password_reset | all
 *   page  - default 1
 *   limit - default 20, max 20
 *
 * Example: GET /api/admin/notifications
 *          GET /api/admin/notifications?type=new_driver&page=2
 */
router.get('/', auditMiddleware('notifications_get_all'), ctrl.getAll);

export default router;
