import { supabase } from '../config/database';
import { MapsUtil } from '../utils/maps';
import config from '../config';
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
  static async getFareConfig(vehicleType: string) {
    const { data, error } = await supabase
      .from('food_fare_config')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new Error('Failed to fetch fare config');

    // Fallback to defaults if no DB config
    if (!data) {
      return {
        price_per_km: config.defaults.pricePerKm,
        minimum_delivery_fee: config.defaults.minimumDeliveryFee,
        service_fee: 50,
        rounding_fee: 0,
        currency_code: config.defaults.currency,
      };
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
  }): Promise<FareBreakdown> {
    const vehicleType = params.vehicleType || 'motorcycle';

    const [fareConfig, routeInfo] = await Promise.all([
      this.getFareConfig(vehicleType),
      MapsUtil.getRouteInfo(
        params.restaurantLat,
        params.restaurantLng,
        params.deliveryLat,
        params.deliveryLng
      ),
    ]);

    const pricePerKm = parseFloat(fareConfig.price_per_km);
    const minimumFee = parseFloat(fareConfig.minimum_delivery_fee);
    const serviceFee = parseFloat(fareConfig.service_fee);
    const roundingFee = parseFloat(fareConfig.rounding_fee);

    const rawDeliveryFee = routeInfo.distanceKm * pricePerKm;
    const deliveryFee = Math.max(rawDeliveryFee, minimumFee);

    logger.info('Fare calculated', {
      distanceKm: routeInfo.distanceKm,
      deliveryFee,
      serviceFee,
      vehicleType,
    });

    return {
      distanceKm: routeInfo.distanceKm,
      distanceText: routeInfo.distanceText,
      durationMinutes: routeInfo.durationMinutes,
      durationText: routeInfo.durationText,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
      serviceFee: Math.round(serviceFee * 100) / 100,
      roundingFee: Math.round(roundingFee * 100) / 100,
      currencyCode: fareConfig.currency_code || config.defaults.currency,
      vehicleType,
    };
  }
}
