import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { ResponseUtil } from '../utils/response';
import logger from '../utils/logger';
import { AuthRequest } from './auth.middleware';

const PLATFORM_SERVICE_URL = process.env.PLATFORM_SERVICE_URL || 'http://localhost:3004';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';

/**
 * Checks that the authenticated user is an approved vendor in platform-service.
 * Must be used AFTER authenticate middleware.
 */
export const isVendorApproved = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    const userId = (req as AuthRequest).user?.id;
    if (!userId) return ResponseUtil.unauthorized(res, 'Authentication required');

    const response = await axios.get(
      `${PLATFORM_SERVICE_URL}/api/vendor/internal/status/${userId}`,
      {
        headers: { 'x-internal-api-key': INTERNAL_API_KEY },
        timeout: 5000,
      }
    );

    if (!response.data?.data?.approved) {
      return ResponseUtil.forbidden(res, 'Vendor registration not approved. Please complete registration and wait for admin approval.');
    }

    next();
  } catch (err: any) {
    if (err.response?.status === 404) {
      return ResponseUtil.forbidden(res, 'Vendor not registered. Please complete vendor registration first.');
    }
    logger.error('Vendor approval check failed:', err.message);
    return ResponseUtil.serverError(res, 'Could not verify vendor status');
  }
};
