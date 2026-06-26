import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import userService from '../services/user.service';
import ResponseUtil from '../utils/response';

class UserController {
  /**
   * Get current user
   */
  async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      const user = await userService.getUserById(authReq.user!.userId);
      ResponseUtil.success(res, user, 'User retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      const user = await userService.updateProfile(authReq.user!.userId, req.body);
      ResponseUtil.success(res, user, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user roles (Admin only)
   */
  async updateRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      
      // Check if user is admin
      if (authReq.user!.role !== 'admin') {
        ResponseUtil.error(res, 'Only admins can update user roles', 403);
        return;
      }

      const { userId } = req.params;
      const { roles, activeRole } = req.body;

      const user = await userService.updateRoles(userId || authReq.user!.userId, roles, activeRole);
      ResponseUtil.success(res, user, 'Roles updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Switch active role
   */
  async switchActiveRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      const { activeRole } = req.body;

      if (!activeRole) {
        ResponseUtil.error(res, 'Active role is required', 400);
        return;
      }

      const user = await userService.switchActiveRole(authReq.user!.userId, activeRole);
      ResponseUtil.success(res, user, 'Active role switched successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * Change password
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      await userService.changePassword(
        authReq.user!.userId,
        req.body.currentPassword,
        req.body.newPassword
      );
      ResponseUtil.success(res, null, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/users/account
   * Soft-delete the authenticated user's own account.
   * No rows are removed — status is set to 'account_deleted' on users,
   * drivers, and vendors tables. Email/phone remain so the user can
   * re-register later with the same credentials.
   */
  async deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      const { reason } = req.body;
      await userService.deleteAccount(authReq.user!.userId, reason);
      ResponseUtil.success(res, null, 'Account deleted successfully. Your data has been retained for compliance purposes.');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/phone
   * Update phone number — new number immediately becomes wallet account identifier.
   * Body: { "phone": "08012345678" }
   */
  async updatePhone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authReq = req as AuthRequest;
      const { phone } = req.body;
      if (!phone) {
        ResponseUtil.error(res, 'Phone number is required', 400);
        return;
      }
      const user = await userService.updatePhone(authReq.user!.userId, phone);
      ResponseUtil.success(res, { user }, 'Phone number updated. This is now your wallet account identifier.');
    } catch (error) {
      next(error);
    }
  }
}

export default new UserController();