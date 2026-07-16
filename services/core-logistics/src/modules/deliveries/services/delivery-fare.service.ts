import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { MapsUtil } from '../../../utils/maps.util';

interface FareCalculationParams {
  vehicleTypeId:    string;
  regionId:         string;
  pickupLatitude:   number;
  pickupLongitude:  number;
  dropoffLatitude:  number;
  dropoffLongitude: number;
  deliveryType:     'instant' | 'scheduled';
}

export interface FareBreakdown {
  distanceKm:   number;
  distanceText: string;
  /** Distance-based delivery charge (uses min_amount_less_than_3km when < 3 km) */
  deliveryFee:  number;
  /** service_fee + rounding_fee combined — one line item for the customer */
  serviceFee:   number;
  /** deliveryFee + serviceFee */
  totalAmount:  number;
  /** Resolved city tier — high | middle | low */
  cityTier:     string;
  currencyCode: string;
}

export class DeliveryFareService {

  // ── City tier resolution ───────────────────────────────────────────────────
  /**
   * Resolve a city tier from a regionId.
   * Looks up the region name (e.g. "Lagos") then checks city_tier_states.
   * Falls back to 'low' if the state is not explicitly assigned to high or middle.
   */
  private static async resolveCityTier(regionId: string): Promise<'high' | 'middle' | 'low'> {
    // 1. Get region name from regions table
    const { data: region } = await supabase
      .from('regions')
      .select('name')
      .eq('id', regionId)
      .maybeSingle();

    if (!region?.name) {
      logger.warn('Region not found for city tier resolution, defaulting to low', { regionId });
      return 'low';
    }

    const regionName = region.name; // e.g. "Lagos"

    // 2. Look up in city_tier_states (shared with ride + marketplace pricing)
    const { data: tierRow } = await supabase
      .from('city_tier_states')
      .select('city_tier')
      .ilike('state_name', regionName) // case-insensitive match
      .maybeSingle();

    const tier = (tierRow?.city_tier ?? 'low') as 'high' | 'middle' | 'low';

    logger.info('Resolved city tier for delivery', { regionId, regionName, cityTier: tier });
    return tier;
  }

  // ── Config lookup ─────────────────────────────────────────────────────────
  /**
   * Fetch the fare config for a vehicle + region, using city tier to pick
   * the right pricing row from the admin-configured columns.
   * Falls back through: exact vehicle+region → vehicle+region with any city_tier.
   */
  private static async getFareConfig(vehicleTypeId: string, regionId: string, cityTier: string) {
    // Try exact match: vehicle + region + tier
    const { data, error } = await supabase
      .from('delivery_fare_config')
      .select('*')
      .eq('vehicle_type_id', vehicleTypeId)
      .eq('region_id', regionId)
      .eq('city_tier', cityTier)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new Error('Failed to fetch fare configuration');
    if (data) return data;

    // Fallback: same vehicle + region but any tier (e.g. only 'low' row exists)
    const { data: fallback } = await supabase
      .from('delivery_fare_config')
      .select('*')
      .eq('vehicle_type_id', vehicleTypeId)
      .eq('region_id', regionId)
      .eq('is_active', true)
      .order('city_tier', { ascending: false }) // high > middle > low
      .limit(1)
      .maybeSingle();

    if (fallback) return fallback;

    throw new Error('Fare configuration not found for this vehicle type and region');
  }

  // ── Fare calculation ──────────────────────────────────────────────────────

  public static async calculateFare(params: FareCalculationParams): Promise<FareBreakdown> {
    // Resolve city tier from the region name → city_tier_states lookup
    const cityTier = await this.resolveCityTier(params.regionId);

    const [fareConfig, routeInfo] = await Promise.all([
      this.getFareConfig(params.vehicleTypeId, params.regionId, cityTier),
      MapsUtil.getDirections(
        { latitude: params.pickupLatitude,  longitude: params.pickupLongitude },
        { latitude: params.dropoffLatitude, longitude: params.dropoffLongitude }
      ),
    ]);

    const distanceKm = routeInfo.distance;

    // Effective billing unit = base rate + high-traffic surcharge (0 when not set by admin).
    // This is uniform regardless of city tier — the admin configures each
    // vehicle + tier + city-tier row independently.
    const baseRate = parseFloat(fareConfig.estimated_billing_unit ?? 0);
    const highRate = parseFloat(fareConfig.high_traffic_estimated_billing_unit ?? 0);
    const ratePerKm = baseRate + highRate;

    const minAmount3km   = parseFloat(fareConfig.min_amount_less_than_3km ?? 0);
    const serviceFeeRaw  = parseFloat(fareConfig.service_fee  ?? 0);
    const roundingFeeRaw = parseFloat(fareConfig.rounding_fee ?? 0);

    // > 3km: deliveryFee = distance × ratePerKm
    // ≤ 3km: deliveryFee = min_amount_less_than_3km (flat — no per-km calc)
    const rawDeliveryFee = distanceKm * ratePerKm;
    const deliveryFee    = distanceKm < 3
      ? minAmount3km
      : rawDeliveryFee;

    // service_fee + rounding_fee → one customer-facing line item
    const serviceFee  = serviceFeeRaw + roundingFeeRaw;
    const totalAmount = deliveryFee + serviceFee;

    logger.info('Delivery fare calculated', {
      vehicleTypeId: params.vehicleTypeId,
      regionId:      params.regionId,
      cityTier,
      distanceKm,
      ratePerKm,
      deliveryFee,
      serviceFee,
      totalAmount,
      deliveryType: params.deliveryType,
    });

    return {
      distanceKm:   Math.round(distanceKm * 100) / 100,
      distanceText: routeInfo.distanceText,
      deliveryFee:  Math.round(deliveryFee),
      serviceFee:   Math.round(serviceFee),
      totalAmount:  Math.round(totalAmount),
      cityTier,
      currencyCode: fareConfig.currency_code ?? 'NGN',
    };
  }

  // ── Estimate (no delivery created) ───────────────────────────────────────

  public static async estimateFare(
    vehicleTypeId:    string,
    regionId:         string,
    pickupLatitude:   number,
    pickupLongitude:  number,
    dropoffLatitude:  number,
    dropoffLongitude: number,
    deliveryType:     'instant' | 'scheduled' = 'instant'
  ): Promise<FareBreakdown> {
    return this.calculateFare({
      vehicleTypeId,
      regionId,
      pickupLatitude,
      pickupLongitude,
      dropoffLatitude,
      dropoffLongitude,
      deliveryType,
    });
  }

  // ── Config helpers ────────────────────────────────────────────────────────

  public static async getFareConfigsByRegion(regionId: string) {
    const { data, error } = await supabase
      .from('delivery_fare_config')
      .select(`*, vehicle_type:vehicle_types(id, name, display_name, icon_url)`)
      .eq('region_id', regionId)
      .eq('is_active', true);

    if (error) throw new Error('Failed to fetch fare configurations');
    return data ?? [];
  }
}
