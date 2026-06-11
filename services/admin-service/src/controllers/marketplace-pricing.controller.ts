import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import {
  MarketplacePricingService,
  MARKETPLACE_VEHICLE_TYPES,
} from '../services/marketplace-pricing.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';
import { CITY_TIERS, CityTier } from '../constants/nigerian-states';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isValidCityTier(tier: string): tier is CityTier {
  return (CITY_TIERS as readonly string[]).includes(tier);
}

function isValidVehicleType(vt: string): boolean {
  return (MARKETPLACE_VEHICLE_TYPES as readonly string[]).includes(vt);
}

const VEHICLE_TYPE_LIST = MARKETPLACE_VEHICLE_TYPES.join(', ');
const TIER_LIST         = CITY_TIERS.join(', ');

export class MarketplacePricingController {

  /**
   * GET /api/admin/marketplace/pricing
   * All marketplace fare configs grouped by vehicle type.
   */
  getAllConfigs = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const result = await MarketplacePricingService.getAllConfigs();
      ResponseUtil.success(res, result, 'Marketplace pricing configs retrieved');
    } catch (err: unknown) {
      logger.error('marketplace getAllConfigs error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve marketplace pricing configs', 'MARKETPLACE_PRICING_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/marketplace/pricing/city-tiers
   * All configs grouped by city tier (high / middle / low) with assigned states.
   */
  getCityTierConfigs = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const result = await MarketplacePricingService.getCityTierConfigs();
      ResponseUtil.success(res, result, 'Marketplace city tier configs retrieved');
    } catch (err: unknown) {
      logger.error('marketplace getCityTierConfigs error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve marketplace city tier configs', 'MARKETPLACE_PRICING_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/marketplace/pricing/vehicle-type/:vehicleType
   * All city-tier configs for one vehicle type (e.g. all three tiers for "car").
   */
  getConfigsByVehicleType = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { vehicleType } = req.params;
      if (!isValidVehicleType(vehicleType)) {
        ResponseUtil.badRequest(res, `Invalid vehicle type. Must be one of: ${VEHICLE_TYPE_LIST}`, 'INVALID_VEHICLE_TYPE');
        return;
      }
      const configs = await MarketplacePricingService.getConfigsByVehicleType(vehicleType);
      ResponseUtil.success(res, { configs }, `Marketplace pricing configs for ${vehicleType} retrieved`);
    } catch (err: unknown) {
      logger.error('marketplace getConfigsByVehicleType error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve marketplace pricing configs', 'MARKETPLACE_PRICING_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/marketplace/pricing/city-tiers/:cityTier
   * All vehicle type configs + assigned states for one city tier.
   */
  getConfigsByCityTier = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { cityTier } = req.params;
      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${TIER_LIST}`, 'INVALID_CITY_TIER');
        return;
      }
      const result = await MarketplacePricingService.getConfigsByCityTier(cityTier);
      ResponseUtil.success(res, result, `Marketplace pricing configs for "${cityTier}" tier retrieved`);
    } catch (err: unknown) {
      logger.error('marketplace getConfigsByCityTier error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve marketplace city tier configs', 'MARKETPLACE_PRICING_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/marketplace/pricing/city-tiers/:cityTier/:vehicleType
   * Single pricing config for a vehicle type + city tier combination.
   * Returns a zeroed default when the row doesn't exist yet — frontend renders
   * the empty form and saving will upsert the row.
   */
  getConfig = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { cityTier, vehicleType } = req.params;

      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${TIER_LIST}`, 'INVALID_CITY_TIER');
        return;
      }
      if (!isValidVehicleType(vehicleType)) {
        ResponseUtil.badRequest(res, `Invalid vehicle type. Must be one of: ${VEHICLE_TYPE_LIST}`, 'INVALID_VEHICLE_TYPE');
        return;
      }

      const config = await MarketplacePricingService.getConfig(vehicleType, cityTier);

      const result = config ?? {
        vehicle_type:                        vehicleType,
        city_tier:                           cityTier,
        estimated_billing_unit:              0,
        high_traffic_estimated_billing_unit: 0,
        min_amount_less_than_3km:            0,
        service_fee:                         0,
        rounding_fee:                        0,
        booking_fee:                         0,
        fleet_commission_percent:            0,
        is_active:                           true,
        exists:                              false,
      };

      ResponseUtil.success(res, { config: result }, 'Marketplace pricing config retrieved');
    } catch (err: unknown) {
      logger.error('marketplace getConfig error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve marketplace pricing config', 'MARKETPLACE_PRICING_FETCH_ERROR');
    }
  };

  /**
   * PUT /api/admin/marketplace/pricing/city-tiers/:cityTier/:vehicleType
   * Upsert marketplace pricing for a vehicle type + city tier.
   *
   * Body (all fields optional — only send what changed):
   * {
   *   "estimated_billing_unit": 500,
   *   "high_traffic_estimated_billing_unit": 750,
   *   "min_amount_less_than_3km": 1500,
   *   "service_fee": 300,
   *   "rounding_fee": 50,
   *   "booking_fee": 100,
   *   "fleet_commission_percent": 15,
   *   "is_active": true
   * }
   */
  updateConfig = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }

      const { cityTier, vehicleType } = req.params;

      if (!isValidCityTier(cityTier)) {
        ResponseUtil.badRequest(res, `Invalid city tier. Must be one of: ${TIER_LIST}`, 'INVALID_CITY_TIER');
        return;
      }
      if (!isValidVehicleType(vehicleType)) {
        ResponseUtil.badRequest(res, `Invalid vehicle type. Must be one of: ${VEHICLE_TYPE_LIST}`, 'INVALID_VEHICLE_TYPE');
        return;
      }
      if (!req.body || Object.keys(req.body).length === 0) {
        ResponseUtil.badRequest(res, 'Request body cannot be empty', 'EMPTY_BODY');
        return;
      }

      const config = await MarketplacePricingService.updateConfig(
        vehicleType, cityTier, req.body, adminId
      );

      ResponseUtil.success(
        res,
        { config },
        `Marketplace pricing config for ${vehicleType}/${cityTier} saved`
      );
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('cannot be negative') || msg.includes('cannot exceed 100')) {
        ResponseUtil.badRequest(res, msg, 'INVALID_VALUE');
        return;
      }
      logger.error('marketplace updateConfig error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to save marketplace pricing config', 'MARKETPLACE_PRICING_UPDATE_ERROR');
    }
  };
}
