import { Router } from 'express';
import { UserAdminController } from '../controllers/user-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new UserAdminController();

router.use(adminAuthMiddleware);

// Platform overview
router.get('/stats', auditMiddleware('get_platform_stats'), ctrl.getPlatformStats);

// User management
router.get('/', auditMiddleware('get_users'), ctrl.getUsers);
router.get('/:userId', auditMiddleware('get_user_by_id'), ctrl.getUserById);
router.get('/:userId/view-order-history', auditMiddleware('get_user_orders'), ctrl.getUserOrders);
router.put('/:userId/roles', auditMiddleware('update_user_roles'), ctrl.updateRoles);
router.patch('/:userId/status', auditMiddleware('set_user_status'), ctrl.setUserStatus);
router.patch('/:userId/suspend', auditMiddleware('suspend_account'), ctrl.suspendAccount);
router.patch('/:userId/terminate', auditMiddleware('terminate_account'), ctrl.terminateAccount);

export default router;
