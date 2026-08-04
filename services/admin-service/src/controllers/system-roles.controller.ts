import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { SystemRolesService } from '../services/system-roles.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class SystemRolesController {

  /**
   * GET /api/admin/system-roles
   * List all active system roles with permission summary
   */
  listRoles = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const roles = await SystemRolesService.listRoles();
      ResponseUtil.success(res, { roles, total: roles.length }, 'System roles retrieved');
    } catch (err) {
      logger.error('listRoles error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve system roles');
    }
  };

  /**
   * GET /api/admin/system-roles/:roleId
   * Get full role detail with complete permission matrix
   */
  getRoleById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const role = await SystemRolesService.getRoleById(req.params.roleId);
      if (!role) { ResponseUtil.notFound(res, 'Role'); return; }
      ResponseUtil.success(res, { role }, 'Role retrieved');
    } catch (err) {
      logger.error('getRoleById error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve role');
    }
  };

  /**
   * POST /api/admin/system-roles
   * Create a new system role with permissions
   * Body: { name, description?, permissions: [{ section, can_view, can_create, can_edit, can_delete }] }
   */
  createRole = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { name, description, permissions } = req.body;

      if (!name?.trim()) {
        ResponseUtil.badRequest(res, 'Role name is required');
        return;
      }

      const role = await SystemRolesService.createRole(
        { name, description, permissions: permissions ?? [] },
        req.user!.id
      );

      ResponseUtil.created(res, { role }, 'System role created successfully');
    } catch (err) {
      const msg = toMsg(err);
      if (msg.includes('already exists')) {
        ResponseUtil.badRequest(res, msg);
      } else {
        logger.error('createRole error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to create role');
      }
    }
  };

  /**
   * PUT /api/admin/system-roles/:roleId
   * Update role name, description, and/or permissions
   * Body: { name?, description?, permissions?: [...] }
   */
  updateRole = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const role = await SystemRolesService.updateRole(req.params.roleId, req.body);
      if (!role) { ResponseUtil.notFound(res, 'Role'); return; }
      ResponseUtil.success(res, { role }, 'Role updated successfully');
    } catch (err) {
      const msg = toMsg(err);
      if (msg.includes('already exists')) {
        ResponseUtil.badRequest(res, msg);
      } else {
        logger.error('updateRole error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to update role');
      }
    }
  };

  /**
   * DELETE /api/admin/system-roles/:roleId
   * Soft delete a role (sets is_active = false)
   */
  deleteRole = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      await SystemRolesService.deleteRole(req.params.roleId);
      ResponseUtil.success(res, null, 'Role deleted successfully');
    } catch (err) {
      logger.error('deleteRole error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to delete role');
    }
  };

  /**
   * POST /api/admin/administrators/:adminId/assign-role
   * Assign a system role to an admin
   * Body: { role_id }
   */
  assignRole = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { role_id } = req.body;
      if (!role_id) { ResponseUtil.badRequest(res, 'role_id is required'); return; }

      const result = await SystemRolesService.assignRoleToAdmin(
        req.params.adminId,
        role_id,
        req.user!.id
      );

      ResponseUtil.success(res, result, 'Role assigned successfully');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'Role not found or inactive') {
        ResponseUtil.notFound(res, 'Role');
      } else {
        logger.error('assignRole error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to assign role');
      }
    }
  };

  /**
   * DELETE /api/admin/administrators/:adminId/assign-role
   * Unassign role from an admin (they revert to no-role state)
   */
  unassignRole = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      await SystemRolesService.unassignRoleFromAdmin(req.params.adminId);
      ResponseUtil.success(res, null, 'Role unassigned. Admin will have no access until a new role is assigned.');
    } catch (err) {
      logger.error('unassignRole error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to unassign role');
    }
  };

  /**
   * GET /api/admin/me/permissions
   * Get the currently logged-in admin's full permission set.
   * Frontend uses this to show/hide menu items and decide access.
   *
   * Response fields:
   *   role_name      — name of assigned system role, or "super_admin", or null if none
   *   is_super_admin — true if active_role is super_admin (full access)
   *   has_role       — false means show "pending role assignment" screen
   *   permissions    — array of { section, can_view, can_create, can_edit, can_delete }
   */
  getMyPermissions = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const permissions = await SystemRolesService.getAdminPermissions(req.user!.id);
      ResponseUtil.success(res, permissions, 'Permissions retrieved');
    } catch (err) {
      logger.error('getMyPermissions error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve permissions');
    }
  };
}
