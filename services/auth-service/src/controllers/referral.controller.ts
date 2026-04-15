import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import referralService from '../services/referral.service';
import ResponseUtil from '../utils/response';

class ReferralController {
  async getReferral(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const data = await referralService.getReferralInfo(userId);
      ResponseUtil.success(res, data, 'Referral info retrieved');
    } catch (error) { next(error); }
  }

  async updateCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { referralCode } = req.body;
      if (!referralCode) { ResponseUtil.error(res, 'referralCode is required', 400); return; }
      const data = await referralService.updateReferralCode(userId, referralCode);
      ResponseUtil.success(res, data, 'Referral code updated');
    } catch (error) { next(error); }
  }
}

export default new ReferralController();
