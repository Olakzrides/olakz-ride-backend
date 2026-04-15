import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import safetyService from '../services/safety.service';
import ResponseUtil from '../utils/response';

class SafetyController {
  /**
   * GET /api/users/safety
   */
  async getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const settings = await safetyService.getSafetySettings(userId);
      ResponseUtil.success(res, settings, 'Safety settings retrieved');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/safety/emergency-contact
   * Body: { name, phone, email? }
   */
  async updateEmergencyContact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { name, phone, email } = req.body;

      if (!name || !phone) {
        ResponseUtil.error(res, 'name and phone are required', 400);
        return;
      }

      const result = await safetyService.updateEmergencyContact(userId, { name, phone, email });
      ResponseUtil.success(res, result, 'Emergency contact updated');
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/safety/alert-timer
   * Body: { enabled, minutes? }
   */
  async updateAlertTimer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { enabled, minutes } = req.body;

      if (typeof enabled !== 'boolean') {
        ResponseUtil.error(res, 'enabled must be a boolean', 400);
        return;
      }

      const result = await safetyService.updateAlertTimer(userId, { enabled, minutes });
      ResponseUtil.success(res, result, 'Alert timer updated');
    } catch (error) {
      next(error);
    }
  }
}

export default new SafetyController();
