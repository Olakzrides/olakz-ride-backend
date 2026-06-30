import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { SubAdminService } from '../services/sub-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class SubAdminController {

  /**
   * POST /api/admin/administrators
   * Super admin creates a new sub-admin account.
   *
   * Body: { first_name, last_name, email, phone, role, status, password }
   */
  createSubAdmin = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const superAdminId = req.user?.id;
      if (!superAdminId) { ResponseUtil.unauthorized(res); return; }

      const { first_name, last_name, email, phone, role, status, password } = req.body;

      // Basic presence checks before handing off to service
      if (!first_name || !last_name || !email || !phone || !role || !password) {
        ResponseUtil.badRequest(res, 'first_name, last_name, email, phone, role, and password are all required');
        return;
      }

      const admin = await SubAdminService.create({
        first_name,
        last_name,
        email,
        phone,
        role,
        status: status ?? 'pending',
        password,
        created_by: superAdminId,
      });

      ResponseUtil.created(res, { admin }, 'Admin account created successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'EMAIL_ALREADY_EXISTS') {
        ResponseUtil.badRequest(res, 'An account with this email already exists', 'EMAIL_ALREADY_EXISTS');
        return;
      }
      if (msg === 'PHONE_ALREADY_EXISTS') {
        ResponseUtil.badRequest(res, 'An account with this phone number already exists', 'PHONE_ALREADY_EXISTS');
        return;
      }
      if (msg.startsWith('role must be') || msg.includes('required') || msg.includes('characters')) {
        ResponseUtil.badRequest(res, msg);
        return;
      }
      logger.error('createSubAdmin error', { error: msg });
      ResponseUtil.serverError(res, msg, 'CREATE_ADMIN_ERROR');
    }
  };

  /**
   * GET /api/admin/administrators
   * List all admin accounts with pagination, search, and filters.
   *
   * Query params: role, status, search, from, to, page, limit
   */
  listAdmins = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { role, status, search, from, to, page, limit } = req.query;

      const result = await SubAdminService.listAdmins({
        role:   role   as string | undefined,
        status: status as string | undefined,
        search: search as string | undefined,
        from:   from   as string | undefined,
        to:     to     as string | undefined,
        page:   page  ? parseInt(page  as string, 10) : 1,
        limit:  limit ? parseInt(limit as string, 10) : 10,
      });

      ResponseUtil.success(res, result, 'Admins retrieved successfully');
    } catch (err: unknown) {
      logger.error('listAdmins error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/admin/administrators/:adminId
   * Get full details of a single admin including wallet balance.
   */
  getAdminById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const admin = await SubAdminService.getAdminById(req.params.adminId);
      if (!admin) { ResponseUtil.notFound(res, 'Admin account'); return; }
      ResponseUtil.success(res, { admin }, 'Admin details retrieved');
    } catch (err: unknown) {
      logger.error('getAdminById error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * PUT /api/admin/administrators/:adminId/reset-password
   * Super admin resets a sub-admin's password.
   * Sub admins cannot use this endpoint — guard enforced at route level.
   *
   * Body: { new_password }
   */
  resetPassword = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const superAdminId = req.user?.id;
      if (!superAdminId) { ResponseUtil.unauthorized(res); return; }

      const { new_password } = req.body;
      if (!new_password) {
        ResponseUtil.badRequest(res, 'new_password is required');
        return;
      }

      const result = await SubAdminService.resetPassword(
        req.params.adminId,
        new_password,
        superAdminId
      );

      ResponseUtil.success(res, result, 'Password reset successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Admin account not found') { ResponseUtil.notFound(res, 'Admin account'); return; }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated', 'ACCOUNT_TERMINATED');
        return;
      }
      if (msg.includes('required') || msg.includes('characters')) {
        ResponseUtil.badRequest(res, msg);
        return;
      }
      logger.error('resetPassword error', { error: msg });
      ResponseUtil.serverError(res, msg, 'RESET_PASSWORD_ERROR');
    }
  };

  /**
   * PUT /api/admin/administrators/:adminId/approve
   * Approve a pending sub-admin — sets status to 'active' and marks email as verified.
   * Sub admin can then log in with the credentials the super admin set.
   */
  approve = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const superAdminId = req.user?.id;
      if (!superAdminId) { ResponseUtil.unauthorized(res); return; }

      const admin = await SubAdminService.approve(req.params.adminId, superAdminId);
      ResponseUtil.success(res, { admin }, 'Admin account approved. They can now log in.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Admin account not found') { ResponseUtil.notFound(res, 'Admin account'); return; }
      if (msg === 'ALREADY_ACTIVE') {
        ResponseUtil.badRequest(res, 'This admin account is already active', 'ALREADY_ACTIVE');
        return;
      }
      if (msg === 'ACCOUNT_SUSPENDED') {
        ResponseUtil.badRequest(res, 'This account is suspended. Unsuspend it first before approving.', 'ACCOUNT_SUSPENDED');
        return;
      }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated', 'ACCOUNT_TERMINATED');
        return;
      }
      logger.error('approve admin error', { error: msg });
      ResponseUtil.serverError(res, msg, 'APPROVE_ADMIN_ERROR');
    }
  };

  /**
   * PUT /api/admin/administrators/:adminId/suspend
   * Suspend a sub-admin account.
   */
  suspend = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const superAdminId = req.user?.id;
      if (!superAdminId) { ResponseUtil.unauthorized(res); return; }

      const admin = await SubAdminService.suspend(req.params.adminId, superAdminId);
      ResponseUtil.success(res, { admin }, 'Admin account suspended successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Admin account not found') { ResponseUtil.notFound(res, 'Admin account'); return; }
      if (msg === 'ALREADY_SUSPENDED') {
        ResponseUtil.badRequest(res, 'This admin account is already suspended', 'ALREADY_SUSPENDED');
        return;
      }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated', 'ACCOUNT_TERMINATED');
        return;
      }
      logger.error('suspend admin error', { error: msg });
      ResponseUtil.serverError(res, msg, 'SUSPEND_ADMIN_ERROR');
    }
  };

  /**
   * PUT /api/admin/administrators/:adminId/unsuspend
   * Reinstate a previously suspended sub-admin.
   */
  unsuspend = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const superAdminId = req.user?.id;
      if (!superAdminId) { ResponseUtil.unauthorized(res); return; }

      const admin = await SubAdminService.unsuspend(req.params.adminId, superAdminId);
      ResponseUtil.success(res, { admin }, 'Admin account reinstated successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Admin account not found') { ResponseUtil.notFound(res, 'Admin account'); return; }
      if (msg === 'ALREADY_ACTIVE') {
        ResponseUtil.badRequest(res, 'This admin account is already active', 'ALREADY_ACTIVE');
        return;
      }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated', 'ACCOUNT_TERMINATED');
        return;
      }
      logger.error('unsuspend admin error', { error: msg });
      ResponseUtil.serverError(res, msg, 'UNSUSPEND_ADMIN_ERROR');
    }
  };

  /**
   * PUT /api/admin/administrators/:adminId/remove-role
   * Strip admin role — demotes back to regular customer.
   * Their token becomes invalid for admin routes on next login.
   */
  removeAdminRole = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const superAdminId = req.user?.id;
      if (!superAdminId) { ResponseUtil.unauthorized(res); return; }

      const updated = await SubAdminService.removeAdminRole(req.params.adminId, superAdminId);
      ResponseUtil.success(res, { user: updated }, 'Admin role removed. Account demoted to customer.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Admin account not found') { ResponseUtil.notFound(res, 'Admin account'); return; }
      if (msg === 'CANNOT_REMOVE_OWN_ROLE') {
        ResponseUtil.badRequest(res, 'You cannot remove your own admin role', 'CANNOT_REMOVE_OWN_ROLE');
        return;
      }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated', 'ACCOUNT_TERMINATED');
        return;
      }
      logger.error('removeAdminRole error', { error: msg });
      ResponseUtil.serverError(res, msg, 'REMOVE_ROLE_ERROR');
    }
  };

  /**
   * DELETE /api/admin/administrators/:adminId
   * Permanently delete an admin account from the platform.
   */
  deleteAccount = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const superAdminId = req.user?.id;
      if (!superAdminId) { ResponseUtil.unauthorized(res); return; }

      const result = await SubAdminService.deleteAccount(req.params.adminId, superAdminId);
      ResponseUtil.success(res, result, 'Admin account permanently deleted');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Admin account not found') { ResponseUtil.notFound(res, 'Admin account'); return; }
      if (msg === 'CANNOT_DELETE_OWN_ACCOUNT') {
        ResponseUtil.badRequest(res, 'You cannot delete your own account', 'CANNOT_DELETE_OWN_ACCOUNT');
        return;
      }
      logger.error('deleteAccount (admin) error', { error: msg });
      ResponseUtil.serverError(res, msg, 'DELETE_ADMIN_ERROR');
    }
  };
}
