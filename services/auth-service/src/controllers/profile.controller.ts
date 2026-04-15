import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import profileService from '../services/profile.service';
import ResponseUtil from '../utils/response';

class ProfileController {
  /**
   * GET /api/users/profile
   */
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const profile = await profileService.getProfile(userId);
      ResponseUtil.success(res, profile, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/profile
   * Body: { firstName?, lastName?, phone? }
   */
  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { firstName, lastName, phone } = req.body;
      const profile = await profileService.updateProfile(userId, { firstName, lastName, phone });
      ResponseUtil.success(res, profile, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/profile/avatar
   * Body: { image: base64string, mimeType: "image/jpeg" | "image/png" | "image/webp" }
   */
  async updateAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { image, mimeType } = req.body;

      if (!image || !mimeType) {
        ResponseUtil.error(res, 'image (base64) and mimeType are required', 400);
        return;
      }

      const result = await profileService.updateAvatar(userId, image, mimeType);
      ResponseUtil.success(res, result, 'Avatar updated successfully');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/profile/notifications
   * Body: { enabled: boolean }
   */
  async updateNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        ResponseUtil.error(res, 'enabled must be a boolean', 400);
        return;
      }

      const result = await profileService.updateNotifications(userId, enabled);
      ResponseUtil.success(res, result, `Notifications ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/profile/language
   * Body: { language: "en" | "fr" | "ha" | "yo" | "ig" }
   */
  async updateLanguage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { language } = req.body;

      if (!language) {
        ResponseUtil.error(res, 'language is required', 400);
        return;
      }

      const result = await profileService.updateLanguage(userId, language);
      ResponseUtil.success(res, result, 'Language preference updated');
    } catch (error) {
      next(error);
    }
  }
}

export default new ProfileController();
