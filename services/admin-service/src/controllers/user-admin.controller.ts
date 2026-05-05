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
      const validStatuses = ['active', 'suspended', 'banned'];
      if (!status || !validStatuses.includes(status)) {
        ResponseUtil.badRequest(res, `status must be one of: ${validStatuses.join(', ')}`); return;
      }
      const user = await UserAdminService.setUserStatus(req.params.userId, status);
      ResponseUtil.success(res, { user }, `User ${status}`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'User not found') { ResponseUtil.notFound(res, 'User'); return; }
      logger.error('setUserStatus error', { error: msg });
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
