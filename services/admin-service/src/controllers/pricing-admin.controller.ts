import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { PricingAdminService } from '../services/pricing-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';
import { CITY_TIERS, CityTier } from '../constants/nigerian-states';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const VALID_CATEGORIES = ['car', 'bicycle', 'motorcycle', 'bus', 'truck'];
const VALID_SERVICE_TIERS = ['standard', 'premium', 'vip', 'default'];

// CITY_TIERS is now ['high', 'middle', 'low'] — no national
function isValidCityTier(tier: string): tier is CityTier {
  return (CITY_TIERS as readonly string[]).includes(tier);
}

export class PricingAdminController {

  // ── Overview ───────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/pricing
   * All fare configs grouped by vehicle category.
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
   * GET /api/admin/pricing/category/:vehicleCategory
   * All configs for a specific vehicle category across all city tiers.
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

  // ── Nigerian states ────────────────────────────────────────────────────────

  /**
   * GET /api/admin/pricing/states
   * All 36+1 Nigerian states with their current city tier assignment.
   * Unassigned states are shown as 'low'.
   */
  getStates = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const result = await PricingAdminService.getStatesWithTierAssignments();
      ResponseUtil.success(res, result, 'Nigerian states retrieved');
    } catch (err: unknown) {
      logger.error('getStates error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve states', 'STATES_FETCH_ERROR');
    }
  };

  // ── City-tier overview ─────────────────────────────────────────────────────

  /**
   * GET /api/admin/pricing/city-tiers
   * All configs grouped by city tier (high / middle / low), each with assigned states.
   */
  getCityTierConfigs = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const result = await PricingAdminService.getCityTierConfigs();
      ResponseUtil.success(res, result, 'City tier configs retrieved');
    } catch (err: unknown) {
      logger.error('getCityTierConfigs error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve city tier configs', 'PRICING_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/pricing/city-tiers/:cityTier
   * All configs + assigned states for one city tier.
   * For 'low', includes all states not assigned to high or middle.
   */
  getConfigsByCityTier = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { cityTier } = req.params;
      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${CITY_TIERS.join(', ')}`, 'INVALID_CITY_TIER');
        return;
      }
      const result = await PricingAdminService.getConfigsByCityTier(cityTier);
      ResponseUtil.success(res, result, `City tier configs for "${cityTier}" retrieved`);
    } catch (err: unknown) {
      logger.error('getConfigsByCityTier error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve city tier configs', 'PRICING_FETCH_ERROR');
    }
  };

  // ── State assignment ───────────────────────────────────────────────────────

  /**
   * POST /api/admin/pricing/city-tiers/:cityTier/states
   * Add states to a city tier (merge). Removes them from any other tier automatically.
   * Body: { "states": ["Lagos", "FCT"] }
   */
  assignStatesToCityTier = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }

      const { cityTier } = req.params;
      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${CITY_TIERS.join(', ')}`, 'INVALID_CITY_TIER');
        return;
      }

      const { states } = req.body;
      if (!Array.isArray(states) || states.length === 0) {
        ResponseUtil.badRequest(res, 'Body must contain a non-empty "states" array', 'INVALID_BODY');
        return;
      }

      const result = await PricingAdminService.assignStatesToCityTier(cityTier, states, adminId);
      ResponseUtil.success(res, result, `States assigned to "${cityTier}" city tier`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('Invalid state names')) {
        ResponseUtil.badRequest(res, msg, 'INVALID_STATES'); return;
      }
      logger.error('assignStatesToCityTier error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to assign states', 'STATE_ASSIGN_ERROR');
    }
  };

  /**
   * PUT /api/admin/pricing/city-tiers/:cityTier/states
   * Replace the full states list for a city tier (overwrite).
   * Removed states automatically fall to low.
   * Body: { "states": ["Lagos", "FCT"] }
   */
  setStatesForCityTier = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }

      const { cityTier } = req.params;
      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${CITY_TIERS.join(', ')}`, 'INVALID_CITY_TIER');
        return;
      }

      const { states } = req.body;
      if (!Array.isArray(states)) {
        ResponseUtil.badRequest(res, 'Body must contain a "states" array', 'INVALID_BODY');
        return;
      }

      const result = await PricingAdminService.setStatesForCityTier(cityTier, states, adminId);
      ResponseUtil.success(res, result, `States for "${cityTier}" city tier updated`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('Invalid state names')) {
        ResponseUtil.badRequest(res, msg, 'INVALID_STATES'); return;
      }
      logger.error('setStatesForCityTier error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to set states', 'STATE_SET_ERROR');
    }
  };

  /**
   * DELETE /api/admin/pricing/city-tiers/:cityTier/states
   * Remove specific states from a city tier. They fall to low automatically.
   * Body: { "states": ["Lagos"] }
   */
  removeStatesFromCityTier = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }

      const { cityTier } = req.params;
      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${CITY_TIERS.join(', ')}`, 'INVALID_CITY_TIER');
        return;
      }

      const { states } = req.body;
      if (!Array.isArray(states) || states.length === 0) {
        ResponseUtil.badRequest(res, 'Body must contain a non-empty "states" array', 'INVALID_BODY');
        return;
      }

      const result = await PricingAdminService.removeStatesFromCityTier(cityTier, states, adminId);
      ResponseUtil.success(res, result, `States removed from "${cityTier}" — they now fall to low tier`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('Invalid state names')) {
        ResponseUtil.badRequest(res, msg, 'INVALID_STATES'); return;
      }
      logger.error('removeStatesFromCityTier error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to remove states', 'STATE_REMOVE_ERROR');
    }
  };

  // ── Per-vehicle pricing config ─────────────────────────────────────────────

  /**
   * GET /api/admin/pricing/city-tiers/:cityTier/:vehicleCategory/:serviceTier
   * Single pricing config. Returns zeroed default if row doesn't exist yet
   * so the frontend can render the form without treating a missing row as an error.
   */
  getCityTierConfig = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { cityTier, vehicleCategory, serviceTier } = req.params;

      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${CITY_TIERS.join(', ')}`, 'INVALID_CITY_TIER');
        return;
      }
      if (!VALID_CATEGORIES.includes(vehicleCategory)) {
        ResponseUtil.badRequest(res, `Invalid vehicle category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, 'INVALID_CATEGORY');
        return;
      }
      if (!VALID_SERVICE_TIERS.includes(serviceTier)) {
        ResponseUtil.badRequest(res, `Invalid service tier. Must be one of: ${VALID_SERVICE_TIERS.join(', ')}`, 'INVALID_TIER');
        return;
      }

      const config = await PricingAdminService.getCityTierConfig(vehicleCategory, serviceTier, cityTier);

      // Return zeroed default when row doesn't exist yet — frontend renders empty form,
      // saving will upsert the row.
      const result = config ?? {
        vehicle_category: vehicleCategory,
        service_tier: serviceTier,
        city_tier: cityTier,
        estimated_billing_unit: 0,
        high_traffic_estimated_billing_unit: 0,
        min_amount_less_than_3km: 0,
        min_amount_for_shared_ride: 0,
        shared_discount_percent: 0,
        service_fee: 0,
        rounding_fee: 0,
        booking_fee: 0,
        fleet_commission_percent: 0,
        is_active: true,
        exists: false,
      };

      ResponseUtil.success(res, { config: result }, 'City tier pricing config retrieved');
    } catch (err: unknown) {
      logger.error('getCityTierConfig error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve config', 'PRICING_FETCH_ERROR');
    }
  };

  /**
   * PUT /api/admin/pricing/city-tiers/:cityTier/:vehicleCategory/:serviceTier
   * Upsert pricing for a vehicle + service tier + city tier.
   * Body: { "estimated_billing_unit": 650, "service_fee": 700, ... }
   */
  updateCityTierConfig = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }

      const { cityTier, vehicleCategory, serviceTier } = req.params;

      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${CITY_TIERS.join(', ')}`, 'INVALID_CITY_TIER');
        return;
      }
      if (!VALID_CATEGORIES.includes(vehicleCategory)) {
        ResponseUtil.badRequest(res, `Invalid vehicle category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, 'INVALID_CATEGORY');
        return;
      }
      if (!VALID_SERVICE_TIERS.includes(serviceTier)) {
        ResponseUtil.badRequest(res, `Invalid service tier. Must be one of: ${VALID_SERVICE_TIERS.join(', ')}`, 'INVALID_TIER');
        return;
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        ResponseUtil.badRequest(res, 'Request body cannot be empty', 'EMPTY_BODY');
        return;
      }

      const config = await PricingAdminService.updateCityTierConfig(
        vehicleCategory, serviceTier, cityTier, req.body, adminId
      );
      ResponseUtil.success(res, { config }, `Pricing config for ${vehicleCategory}/${serviceTier}/${cityTier} saved`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('cannot be negative') || msg.includes('cannot exceed 100')) {
        ResponseUtil.badRequest(res, msg, 'INVALID_VALUE'); return;
      }
      logger.error('updateCityTierConfig error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to update pricing config', 'PRICING_UPDATE_ERROR');
    }
  };

  /**
   * POST /api/admin/pricing/city-tiers/:cityTier/:vehicleCategory/:serviceTier
   * Create a new pricing config (upsert — safe to call even if row exists).
   * Body: { "estimated_billing_unit": 650, "service_fee": 700, ... }
   */
  createCityTierConfig = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }

      const { cityTier, vehicleCategory, serviceTier } = req.params;

      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${CITY_TIERS.join(', ')}`, 'INVALID_CITY_TIER');
        return;
      }
      if (!VALID_CATEGORIES.includes(vehicleCategory)) {
        ResponseUtil.badRequest(res, `Invalid vehicle category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, 'INVALID_CATEGORY');
        return;
      }
      if (!VALID_SERVICE_TIERS.includes(serviceTier)) {
        ResponseUtil.badRequest(res, `Invalid service tier. Must be one of: ${VALID_SERVICE_TIERS.join(', ')}`, 'INVALID_TIER');
        return;
      }

      const config = await PricingAdminService.createCityTierConfig(
        vehicleCategory, serviceTier, cityTier, req.body ?? {}, adminId
      );
      ResponseUtil.created(res, { config }, `Pricing config for ${vehicleCategory}/${serviceTier}/${cityTier} created`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('cannot be negative') || msg.includes('cannot exceed 100')) {
        ResponseUtil.badRequest(res, msg, 'INVALID_VALUE'); return;
      }
      logger.error('createCityTierConfig error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to create pricing config', 'PRICING_CREATE_ERROR');
    }
  };
}
