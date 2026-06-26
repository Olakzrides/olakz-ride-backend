import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { UserAdminService } from '../services/user-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class UserAdminController {
  getUsers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { role, status, search, page, limit } = req.query;
      const result = await UserAdminService.getUsers({
        role: role as string,
        status: status as string,
        search: search as string,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });
      ResponseUtil.success(res, result, 'Users retrieved');
    } catch (err: unknown) {
      logger.error('getUsers error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await UserAdminService.getUserById(req.params.userId);
      if (!user) { ResponseUtil.notFound(res, 'User'); return; }
      ResponseUtil.success(res, { user }, 'User retrieved');
    } catch (err: unknown) {
      logger.error('getUserById error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/admin/users/:userId/view-wallet-balance
   * Returns only the wallet balance for a specific user.
   */
  getUserWalletBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const result = await UserAdminService.getUserWalletBalance(userId);
      
      if (!result) {
        ResponseUtil.notFound(res, 'User not found');
        return;
      }
      
      ResponseUtil.success(res, result, 'Wallet balance retrieved');
    } catch (err: unknown) {
      logger.error('getUserWalletBalance error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/admin/users/:userId/orders
   * Returns the order history for a specific user across all services.
   * Called when admin clicks "View History".
   *
   * Query params:
   *   status   - all | Completed | In Progress | Pending | Cancelled
   *   service  - all | olakz_ride | olakz_food | marketplace | olakz_delivery
   *   from     - ISO date string
   *   to       - ISO date string
   *   page     - default 1
   *   limit    - default 20
   */
  getUserOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { status, service, from, to, page, limit } = req.query;

      const result = await UserAdminService.getUserOrders(userId, {
        status: status as string | undefined,
        service: service as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      ResponseUtil.success(res, result, 'User order history retrieved');
    } catch (err: unknown) {
      logger.error('getUserOrders error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  updateRoles = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { roles, activeRole } = req.body;
      if (!Array.isArray(roles) || roles.length === 0) {
        ResponseUtil.badRequest(res, 'roles array is required'); return;
      }
      const user = await UserAdminService.updateRoles(req.params.userId, roles, activeRole);
      ResponseUtil.success(res, { user }, 'Roles updated successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'User not found') { ResponseUtil.notFound(res, 'User'); return; }
      if (msg.startsWith('Invalid roles') || msg.startsWith('activeRole')) {
        ResponseUtil.badRequest(res, msg); return;
      }
      logger.error('updateRoles error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  setUserStatus = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { status } = req.body;
      const validStatuses = ['active', 'suspended', 'terminated'];
      if (!status || !validStatuses.includes(status)) {
        ResponseUtil.badRequest(res, `status must be one of: ${validStatuses.join(', ')}`); return;
      }
      const user = await UserAdminService.setUserStatus(req.params.userId, status);
      ResponseUtil.success(res, { user }, `Account status set to ${status}`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'User not found') { ResponseUtil.notFound(res, 'User'); return; }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated and cannot be modified', 'ACCOUNT_TERMINATED'); return;
      }
      logger.error('setUserStatus error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  /**
   * PATCH /api/admin/users/:userId/suspend
   * Toggle suspension — active→suspended or suspended→active.
   * No body needed. Terminated accounts are blocked.
   */
  suspendAccount = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const result = await UserAdminService.toggleSuspend(req.params.userId, adminId);
      const message = result.action === 'suspended'
        ? 'Account suspended successfully'
        : 'Account reactivated successfully';
      ResponseUtil.success(res, { user: result.user, action: result.action }, message);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'User not found') { ResponseUtil.notFound(res, 'User'); return; }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated and cannot be suspended or reactivated', 'ACCOUNT_TERMINATED'); return;
      }
      logger.error('suspendAccount error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  /**
   * PATCH /api/admin/users/:userId/terminate
   * Permanently disable account. Data preserved, nothing deleted.
   * Body (optional): { "reason": "..." }
   */
  terminateAccount = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { reason } = req.body;
      const user = await UserAdminService.terminateAccount(req.params.userId, adminId, reason);
      // Service returns existing user object idempotently when already terminated
      ResponseUtil.success(res, { user }, 'Account permanently terminated. All data has been preserved.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'User not found') { ResponseUtil.notFound(res, 'User'); return; }
      logger.error('terminateAccount error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  getPlatformStats = async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await UserAdminService.getPlatformStats();
      ResponseUtil.success(res, stats, 'Platform stats retrieved');
    } catch (err: unknown) {
      logger.error('getPlatformStats error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
