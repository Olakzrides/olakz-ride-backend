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

/**
 * Extract Nigerian state name from a delivery address string.
 * Inlined here because food-service MapsUtil only has distance/routing helpers.
 */
function extractStateFromAddress(address: string): string | null {
  if (!address) return null;
  const lower = address.toLowerCase();

  const cityToState: Record<string, string> = {
    // Lagos
    'ikeja': 'Lagos', 'lekki': 'Lagos', 'victoria island': 'Lagos', 'ikoyi': 'Lagos',
    'surulere': 'Lagos', 'yaba': 'Lagos', 'apapa': 'Lagos', 'oshodi': 'Lagos',
    'ikorodu': 'Lagos', 'mushin': 'Lagos', 'agege': 'Lagos', 'ketu': 'Lagos',
    'ajah': 'Lagos', 'sangotedo': 'Lagos', 'gbagada': 'Lagos', 'ogba': 'Lagos',
    'ojodu': 'Lagos', 'magodo': 'Lagos', 'festac': 'Lagos', 'orile': 'Lagos',
    'isolo': 'Lagos', 'okota': 'Lagos', 'mile 2': 'Lagos', 'mile 12': 'Lagos',
    'ipaja': 'Lagos', 'egbeda': 'Lagos', 'idimu': 'Lagos', 'ikotun': 'Lagos',
    'ogudu': 'Lagos', 'anthony': 'Lagos', 'maryland': 'Lagos', 'berger': 'Lagos',
    'ojota': 'Lagos', 'palmgrove': 'Lagos', 'palm grove': 'Lagos', 'marina': 'Lagos',
    'balogun': 'Lagos', 'idumota': 'Lagos', 'onipanu': 'Lagos', 'bariga': 'Lagos',
    'dopemu': 'Lagos', 'akowonjo': 'Lagos', 'alimosho': 'Lagos', 'abule egba': 'Lagos',
    'satellite town': 'Lagos', 'trade fair': 'Lagos', 'ibeju': 'Lagos',
    'ebute metta': 'Lagos', 'chevron': 'Lagos', 'banana island': 'Lagos',
    // FCT
    'abuja': 'FCT', 'garki': 'FCT', 'wuse': 'FCT', 'maitama': 'FCT',
    'asokoro': 'FCT', 'gwarinpa': 'FCT', 'lugbe': 'FCT', 'kubwa': 'FCT',
    'nyanya': 'FCT', 'karu': 'FCT', 'jabi': 'FCT', 'utako': 'FCT',
    'gudu': 'FCT', 'apo': 'FCT', 'galadimawa': 'FCT', 'lokogoma': 'FCT',
    // Rivers
    'port harcourt': 'Rivers', 'portharcourt': 'Rivers', 'rumuola': 'Rivers',
    'trans amadi': 'Rivers', 'rumuokoro': 'Rivers', 'eliozu': 'Rivers',
    // Other cities
    'ibadan': 'Oyo', 'benin city': 'Edo', 'warri': 'Delta', 'asaba': 'Delta',
    'enugu city': 'Enugu', 'owerri': 'Imo', 'uyo': 'Akwa Ibom',
    'calabar': 'Cross River', 'maiduguri': 'Borno', 'jos': 'Plateau',
    'ilorin': 'Kwara', 'abeokuta': 'Ogun', 'akure': 'Ondo',
    'osogbo': 'Osun', 'ado-ekiti': 'Ekiti', 'ado ekiti': 'Ekiti',
    'awka': 'Anambra', 'onitsha': 'Anambra', 'nnewi': 'Anambra',
    'umuahia': 'Abia', 'aba': 'Abia', 'abakaliki': 'Ebonyi',
    'yenagoa': 'Bayelsa', 'lokoja': 'Kogi', 'minna': 'Niger',
    'kano city': 'Kano', 'kaduna city': 'Kaduna', 'makurdi': 'Benue',
  };

  for (const [city, state] of Object.entries(cityToState)) {
    if (lower.includes(city)) return state;
  }

  // Direct state name match as final fallback
  const nigerianStates = [
    'Lagos', 'FCT', 'Rivers', 'Kano', 'Oyo', 'Kaduna', 'Ogun', 'Anambra',
    'Delta', 'Edo', 'Imo', 'Abia', 'Enugu', 'Benue', 'Plateau', 'Kwara',
    'Ondo', 'Osun', 'Ekiti', 'Cross River', 'Akwa Ibom', 'Ebonyi', 'Bayelsa',
    'Bauchi', 'Borno', 'Adamawa', 'Gombe', 'Taraba', 'Yobe', 'Jigawa',
    'Katsina', 'Kebbi', 'Niger', 'Nasarawa', 'Kogi', 'Zamfara', 'Sokoto',
  ];
  for (const state of nigerianStates) {
    const regex = new RegExp(`\\b${state.replace(' ', '\\s+')}\\b`, 'i');
    if (regex.test(address)) return state;
  }

  return null;
}

/**
 * Resolve which city_tier the delivery address belongs to.
 * Extracts state name from address string, then queries city_tier_states.
 * Returns 'low' if state cannot be determined or isn't assigned a tier.
 */
async function resolveCityTierFromAddress(address: string): Promise<string> {
  try {
    const state = extractStateFromAddress(address);
    if (!state) {
      logger.warn('[FoodFare] Could not extract state from address — defaulting to low', { address });
      return 'low';
    }

    // Normalize: strip " State" suffix
    const normalized = state.replace(/\s+state$/i, '').replace(/^abuja$/i, 'FCT').trim();

    const { data, error } = await supabase
      .from('city_tier_states')
      .select('city_tier')
      .ilike('state_name', normalized)
      .order('city_tier', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      logger.warn('[FoodFare] State not in city_tier_states — defaulting to low', { state: normalized });
      return 'low';
    }

    logger.info('[FoodFare] Resolved city tier', { state: normalized, cityTier: data.city_tier });
    return data.city_tier;
  } catch (err: any) {
    logger.error('[FoodFare] resolveCityTierFromAddress error', { error: err?.message });
    return 'low';
  }
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
   * Calculate delivery fare based on distance + vehicle type.
   * City tier is resolved automatically from the delivery address string
   * using the city_tier_states table — same source of truth as ride pricing.
   */
  static async calculateFare(params: {
    restaurantLat: number;
    restaurantLng: number;
    deliveryLat: number;
    deliveryLng: number;
    vehicleType?: string;
    cityTier?: string;           // optional override — resolved from address if not provided
    deliveryAddress?: string;    // delivery address string for auto city-tier resolution
  }): Promise<FareBreakdown> {
    const vehicleType = params.vehicleType || 'motorcycle';

    // Resolve city tier: use explicit override if provided, otherwise resolve from address
    let cityTier = params.cityTier ?? 'low';
    if (!params.cityTier && params.deliveryAddress) {
      cityTier = await resolveCityTierFromAddress(params.deliveryAddress);
    }

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
