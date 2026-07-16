import { supabase } from '../config/database';
import { MapsUtil } from '../utils/maps';
import logger from '../utils/logger';

export interface FareBreakdown {
  distanceKm: number;
  distanceText: string;
  durationMinutes: number;
  durationText: string;
  deliveryFee: number;
  serviceFee: number;
  roundingFee: number;
  currencyCode: string;
  vehicleType: string;
}

export class FareService {
  /**
   * Get fare config for a vehicle type from DB (admin-configurable)
   */
  static async getFareConfig(vehicleType: string, cityTier = 'low') {
    const { data, error } = await supabase
      .from('food_fare_config')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .eq('city_tier', cityTier)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new Error('Failed to fetch fare config');

    // No config found — throw so the caller knows pricing isn't set up yet
    if (!data) {
      throw new Error(`Fare config not found for vehicle_type="${vehicleType}" city_tier="${cityTier}". Admin must configure pricing first.`);
    }
    return data;
  }

  /**
   * Calculate delivery fare based on distance + vehicle type
   */
  static async calculateFare(params: {
    restaurantLat: number;
    restaurantLng: number;
    deliveryLat: number;
    deliveryLng: number;
    vehicleType?: string;
    cityTier?: string;
  }): Promise<FareBreakdown> {
    const vehicleType = params.vehicleType || 'motorcycle';
    const cityTier    = params.cityTier    || 'low';

    const [fareConfig, routeInfo] = await Promise.all([
      this.getFareConfig(vehicleType, cityTier),
      MapsUtil.getRouteInfo(
        params.restaurantLat,
        params.restaurantLng,
        params.deliveryLat,
        params.deliveryLng
      ),
    ]);

    // Effective billing unit = base rate + high-traffic surcharge (0 when not set by admin)
    const ratePerKm      = parseFloat(fareConfig.estimated_billing_unit)
                         + parseFloat(fareConfig.high_traffic_estimated_billing_unit ?? 0);
    const minimumFee     = parseFloat(fareConfig.min_amount_less_than_3km);
    const serviceFeeRaw  = parseFloat(fareConfig.service_fee);
    const roundingFeeRaw = parseFloat(fareConfig.rounding_fee);

    const rawDeliveryFee = routeInfo.distanceKm * ratePerKm;

    // > 3km: delivery_fee = distance × estimated_billing_unit
    // ≤ 3km: delivery_fee = min_amount_less_than_3km (flat)
    const deliveryFee = routeInfo.distanceKm < 3
      ? minimumFee
      : rawDeliveryFee;

    const serviceFee = serviceFeeRaw + roundingFeeRaw;

    logger.info('Fare calculated', {
      distanceKm: routeInfo.distanceKm,
      deliveryFee,
      serviceFee,
      vehicleType,
    });

    return {
      distanceKm:      routeInfo.distanceKm,
      distanceText:    routeInfo.distanceText,
      durationMinutes: routeInfo.durationMinutes,
      durationText:    routeInfo.durationText,
      deliveryFee:     Math.round(deliveryFee * 100) / 100,
      serviceFee:      Math.round(serviceFee * 100) / 100,
      roundingFee:     0,
      currencyCode:    fareConfig.currency_code ?? 'NGN',
      vehicleType,
    };
  }
}
