import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import securityService from '../services/security.service';
import ResponseUtil from '../utils/response';

class SecurityController {
  /**
   * GET /api/users/security
   */
  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const settings = await securityService.getSecuritySettings(userId);
      ResponseUtil.success(res, settings, 'Security settings retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/security/password
   * Body: { currentPassword, newPassword, confirmPassword }
   */
  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        ResponseUtil.error(res, 'currentPassword, newPassword and confirmPassword are required', 400);
        return;
      }

      await securityService.changePassword(userId, currentPassword, newPassword, confirmPassword);
      ResponseUtil.success(res, null, 'Password updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/security/biometric
   * Body: { enabled: boolean }
   */
  async updateBiometric(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        ResponseUtil.error(res, 'enabled must be a boolean', 400);
        return;
      }

      const result = await securityService.updateBiometric(userId, enabled);
      ResponseUtil.success(res, result, `Biometric ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/users/security/wallet-pin
   * Set PIN for the first time
   * Body: { pin, accountPassword }
   */
  async setWalletPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { pin, accountPassword } = req.body;

      if (!pin || !accountPassword) {
        ResponseUtil.error(res, 'pin and accountPassword are required', 400);
        return;
      }

      const result = await securityService.setWalletPin(userId, pin, accountPassword);
      ResponseUtil.success(res, result, 'Wallet PIN set successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/security/wallet-pin
   * Update existing PIN
   * Body: { currentPin, newPin, accountPassword }
   */
  async updateWalletPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { currentPin, newPin, accountPassword } = req.body;

      if (!currentPin || !newPin || !accountPassword) {
        ResponseUtil.error(res, 'currentPin, newPin and accountPassword are required', 400);
        return;
      }

      const result = await securityService.updateWalletPin(userId, currentPin, newPin, accountPassword);
      ResponseUtil.success(res, result, 'Wallet PIN updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/users/security/wallet-pin/verify
   * Verify PIN before a wallet operation
   * Body: { pin }
   */
  async verifyWalletPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { pin } = req.body;

      if (!pin) {
        ResponseUtil.error(res, 'pin is required', 400);
        return;
      }

      const result = await securityService.verifyWalletPin(userId, pin);
      ResponseUtil.success(res, result, result.valid ? 'PIN verified' : 'Invalid PIN');
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/users/security/wallet-pin
   * Remove wallet PIN
   * Body: { accountPassword }
   */
  async removeWalletPin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { accountPassword } = req.body;

      if (!accountPassword) {
        ResponseUtil.error(res, 'accountPassword is required', 400);
        return;
      }

      const result = await securityService.removeWalletPin(userId, accountPassword);
      ResponseUtil.success(res, result, 'Wallet PIN removed');
    } catch (error) {
      next(error);
    }
  }
}

export default new SecurityController();
