import { Router } from 'express';
import { SubAdminController } from '../controllers/sub-admin.controller';
import { adminAuthMiddleware, superAdminMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl  = new SubAdminController();

/**
 * All routes below require:
 *  1. adminAuthMiddleware  — valid JWT with admin or super_admin role
 *  2. superAdminMiddleware — role must be exactly super_admin (403 otherwise)
 *
 * Sub admins have zero access to any of these endpoints.
 */
router.use(adminAuthMiddleware);
router.use(superAdminMiddleware);

router.get(
  '/',
  auditMiddleware('list_admins'),
  ctrl.listAdmins
);

router.post(
  '/',
  auditMiddleware('create_sub_admin'),
  ctrl.createSubAdmin
);

router.get(
  '/:adminId',
  auditMiddleware('get_admin_by_id'),
  ctrl.getAdminById
);

router.put(
  '/:adminId/reset-password',
  auditMiddleware('reset_admin_password'),
  ctrl.resetPassword
);

router.put(
  '/:adminId/approve',
  auditMiddleware('approve_admin'),
  ctrl.approve
);

router.put(
  '/:adminId/suspend',
  auditMiddleware('suspend_admin'),
  ctrl.suspend
);

router.put(
  '/:adminId/unsuspend',
  auditMiddleware('unsuspend_admin'),
  ctrl.unsuspend
);

router.put(
  '/:adminId/remove-role',
  auditMiddleware('remove_admin_role'),
  ctrl.removeAdminRole
);

router.delete(
  '/:adminId',
  auditMiddleware('delete_admin_account'),
  ctrl.deleteAccount
);

export default router;
