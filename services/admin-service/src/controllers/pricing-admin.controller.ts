import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { PricingAdminService } from '../services/pricing-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const VALID_CATEGORIES = ['car', 'bicycle', 'motorcycle', 'bus', 'truck'];
const VALID_TIERS = ['standard', 'premium', 'vip', 'default'];

export class PricingAdminController {
  /**
   * GET /api/admin/pricing
   * Returns all fare configs grouped by vehicle category.
   */
  getAllConfigs = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const result = await PricingAdminService.getAllConfigs();
      ResponseUtil.success(res, result, 'Pricing configs retrieved');
    } catch (err: unknown) {
      logger.error('getAllConfigs error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve pricing configs', 'PRICING_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/pricing/:vehicleCategory
   * Returns all tier configs for a specific vehicle category.
   * e.g. GET /api/admin/pricing/car  → returns standard, premium, vip rows
   */
  getConfigsByCategory = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { vehicleCategory } = req.params;

      if (!VALID_CATEGORIES.includes(vehicleCategory)) {
        ResponseUtil.badRequest(res, `Invalid vehicle category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, 'INVALID_CATEGORY');
        return;
      }

      const configs = await PricingAdminService.getConfigsByCategory(vehicleCategory);
      ResponseUtil.success(res, { configs }, `Pricing configs for ${vehicleCategory} retrieved`);
    } catch (err: unknown) {
      logger.error('getConfigsByCategory error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve pricing configs', 'PRICING_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/pricing/:vehicleCategory/:serviceTier
   * Returns a single config.
   * e.g. GET /api/admin/pricing/car/standard
   *      GET /api/admin/pricing/motorcycle/default
   */
  getConfig = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { vehicleCategory, serviceTier } = req.params;

      if (!VALID_CATEGORIES.includes(vehicleCategory)) {
        ResponseUtil.badRequest(res, `Invalid vehicle category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, 'INVALID_CATEGORY');
        return;
      }
      if (!VALID_TIERS.includes(serviceTier)) {
        ResponseUtil.badRequest(res, `Invalid service tier. Must be one of: ${VALID_TIERS.join(', ')}`, 'INVALID_TIER');
        return;
      }

      const config = await PricingAdminService.getConfig(vehicleCategory, serviceTier);
      if (!config) {
        ResponseUtil.notFound(res, `Pricing config for ${vehicleCategory}/${serviceTier}`);
        return;
      }

      ResponseUtil.success(res, { config }, 'Pricing config retrieved');
    } catch (err: unknown) {
      logger.error('getConfig error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve pricing config', 'PRICING_FETCH_ERROR');
    }
  };

  /**
   * PUT /api/admin/pricing/:vehicleCategory/:serviceTier
   * Update a fare config. Only send the fields you want to change.
   *
   * e.g. PUT /api/admin/pricing/car/standard
   * Body: { "estimated_billing_unit": 520, "service_fee": 600 }
   *
   * e.g. PUT /api/admin/pricing/motorcycle/default
   * Body: { "booking_fee": 150, "rounding_fee": 50 }
   */
  updateConfig = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }

      const { vehicleCategory, serviceTier } = req.params;

      if (!VALID_CATEGORIES.includes(vehicleCategory)) {
        ResponseUtil.badRequest(res, `Invalid vehicle category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, 'INVALID_CATEGORY');
        return;
      }
      if (!VALID_TIERS.includes(serviceTier)) {
        ResponseUtil.badRequest(res, `Invalid service tier. Must be one of: ${VALID_TIERS.join(', ')}`, 'INVALID_TIER');
        return;
      }

      if (!req.body || Object.keys(req.body).length === 0) {
        ResponseUtil.badRequest(res, 'Request body cannot be empty', 'EMPTY_BODY');
        return;
      }

      const config = await PricingAdminService.updateConfig(vehicleCategory, serviceTier, req.body, adminId);
      ResponseUtil.success(res, { config }, `Pricing config for ${vehicleCategory}/${serviceTier} updated successfully`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('cannot be negative') || msg.includes('cannot exceed 100')) {
        ResponseUtil.badRequest(res, msg, 'INVALID_VALUE'); return;
      }
      if (msg.includes('not found') || msg.includes('Config not found')) {
        ResponseUtil.notFound(res, 'Pricing config'); return;
      }
      logger.error('updateConfig error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to update pricing config', 'PRICING_UPDATE_ERROR');
    }
  };
}
