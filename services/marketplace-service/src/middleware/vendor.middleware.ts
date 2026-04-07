import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { AuthRequest } from './auth.middleware';
import { ResponseUtil } from '../utils/response';
import { prisma } from '../config/database';
import logger from '../utils/logger';

export async function isVendorApproved(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = (req as AuthRequest).user?.id;
  if (!userId) {
    ResponseUtil.unauthorized(res);
    return;
  }

  try {
    // Check platform-service for vendor approval
    const platformUrl = process.env.PLATFORM_SERVICE_URL || 'http://localhost:3004';
    const response = await axios.get(`${platformUrl}/api/internal/vendor/status/${userId}`, {
      headers: { 'x-internal-api-key': process.env.INTERNAL_API_KEY },
      timeout: 5000,
    });

    const vendor = response.data?.data?.vendor;
    if (!vendor || vendor.verification_status !== 'approved' || vendor.business_type !== 'marketplace') {
      ResponseUtil.forbidden(res, 'Vendor account not approved for marketplace');
      return;
    }

    next();
  } catch (err: any) {
    // Fallback: check local marketplace_stores table
    try {
      const store = await prisma.marketplaceStore.findUnique({ where: { ownerId: userId } });
      if (!store || !store.isVerified) {
        ResponseUtil.forbidden(res, 'Vendor account not approved for marketplace');
        return;
      }
      next();
    } catch {
      logger.error('Vendor approval check failed', { userId, error: err.message });
      ResponseUtil.forbidden(res, 'Could not verify vendor status');
    }
  }
}
