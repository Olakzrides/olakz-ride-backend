import { Router } from 'express';
import { SubAdminController } from '../controllers/sub-admin.controller';
import { adminAuthMiddleware, superAdminMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl  = new SubAdminController();

// All routes require a valid admin JWT + RBAC check.
// The RBAC middleware enforces section-level permissions from the assigned system role.
// Destructive/sensitive actions additionally require superAdminMiddleware.
router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// ── Read-only — any admin with can_view on 'administrators' section ───────────
router.get(
  '/',
  auditMiddleware('list_admins'),
  ctrl.listAdmins
);

router.get(
  '/:adminId',
  auditMiddleware('get_admin_by_id'),
  ctrl.getAdminById
);

// ── Create — any admin with can_create on 'administrators', or super_admin ────
router.post(
  '/',
  superAdminMiddleware,
  auditMiddleware('create_sub_admin'),
  ctrl.createSubAdmin
);

// ── Edit actions — super_admin only (sensitive: password, status, role) ───────
router.put(
  '/:adminId/reset-password',
  superAdminMiddleware,
  auditMiddleware('reset_admin_password'),
  ctrl.resetPassword
);

router.put(
  '/:adminId/approve',
  superAdminMiddleware,
  auditMiddleware('approve_admin'),
  ctrl.approve
);

router.put(
  '/:adminId/suspend',
  superAdminMiddleware,
  auditMiddleware('suspend_admin'),
  ctrl.suspend
);

router.put(
  '/:adminId/unsuspend',
  superAdminMiddleware,
  auditMiddleware('unsuspend_admin'),
  ctrl.unsuspend
);

router.put(
  '/:adminId/remove-role',
  superAdminMiddleware,
  auditMiddleware('remove_admin_role'),
  ctrl.removeAdminRole
);

// ── Delete — super_admin only ─────────────────────────────────────────────────
router.delete(
  '/:adminId',
  superAdminMiddleware,
  auditMiddleware('delete_admin_account'),
  ctrl.deleteAccount
);

export default router;
