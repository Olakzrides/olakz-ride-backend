import { Router } from 'express';
import { SystemRolesController } from '../controllers/system-roles.controller';
import { PromoteController } from '../controllers/promote.controller';
import { adminAuthMiddleware, superAdminMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const rolesCtrl   = new SystemRolesController();
const promoteCtrl = new PromoteController();

// Auth + RBAC run on every request to this router
router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// ── IMPORTANT: All fixed-path routes MUST come before /:roleId wildcard routes.
// Express matches top-to-bottom. If /:roleId is registered first, a request to
// /assign/:adminId or /me/permissions will be swallowed by /:roleId.

// ── My permissions (any admin can call this) ────────────────────────────────
// GET /api/admin/system-roles/me/permissions
router.get('/me/permissions',
  auditMiddleware('get_my_permissions'),
  rolesCtrl.getMyPermissions
);

// ── Assign / unassign role to admin (super_admin only) ───────────────────────
// POST   /api/admin/system-roles/assign/:adminId   Body: { role_id }
// DELETE /api/admin/system-roles/assign/:adminId
router.post(  '/assign/:adminId', superAdminMiddleware, auditMiddleware('assign_admin_role'),   rolesCtrl.assignRole);
router.delete('/assign/:adminId', superAdminMiddleware, auditMiddleware('unassign_admin_role'), rolesCtrl.unassignRole);

// ── Promote customer to admin (super_admin only) ─────────────────────────────
// POST /api/admin/system-roles/promote/:userId
router.post('/promote/:userId',
  superAdminMiddleware,
  auditMiddleware('promote_to_admin'),
  (req, res) => {
    req.params.userId = req.params.userId;
    promoteCtrl.promoteToAdmin(req as any, res);
  }
);

// ── System Roles CRUD (super_admin only) ────────────────────────────────────
// ⚠️ These /:roleId wildcard routes MUST be last — they match anything.
// GET    /api/admin/system-roles
// POST   /api/admin/system-roles
// GET    /api/admin/system-roles/:roleId
// PUT    /api/admin/system-roles/:roleId
// DELETE /api/admin/system-roles/:roleId
router.get(   '/',        superAdminMiddleware, auditMiddleware('list_system_roles'),   rolesCtrl.listRoles);
router.post(  '/',        superAdminMiddleware, auditMiddleware('create_system_role'),  rolesCtrl.createRole);
router.get(   '/:roleId', superAdminMiddleware, auditMiddleware('get_system_role'),     rolesCtrl.getRoleById);
router.put(   '/:roleId', superAdminMiddleware, auditMiddleware('update_system_role'),  rolesCtrl.updateRole);
router.delete('/:roleId', superAdminMiddleware, auditMiddleware('delete_system_role'),  rolesCtrl.deleteRole);

export default router;
