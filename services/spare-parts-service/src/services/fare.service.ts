import { prisma } from '../config/database';
import { supabase } from '../config/database';
import { haversineKm } from '../utils/maps';
import { logger } from '../config/logger';

/**
 * Extract Nigerian state name from a delivery address string.
 * Mirrors marketplace fare.service.ts — shared city→state mapping.
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
    // Other major cities
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
 * Resolve city tier from delivery address via city_tier_states table.
 * Falls back to 'low' if state cannot be determined.
 */
async function resolveCityTierFromAddress(address: string): Promise<string> {
  try {
    const state = extractStateFromAddress(address);
    if (!state) return 'low';

    const normalized = state
      .replace(/\s+state$/i, '')
      .replace(/^abuja$/i, 'FCT')
      .trim();

    const { data, error } = await supabase
      .from('city_tier_states')
      .select('city_tier')
      .ilike('state_name', normalized)
      .order('city_tier', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return 'low';

    logger.info('[SparePartsFare] Resolved city tier', {
      state: normalized,
      cityTier: data.city_tier,
    });
    return data.city_tier;
  } catch {
    return 'low';
  }
}

export interface FareBreakdown {
  distanceKm:   number;
  distanceText: string;
  /** Distance-based charge (or min_amount_less_than_3km when ≤ 3 km) */
  deliveryFee:  number;
  /**
   * service_fee + rounding_fee combined — what the customer sees.
   */
  serviceFee:   number;
  /**
   * Raw rounding_fee — stored on the order for audit but not shown separately.
   */
  roundingFee:  number;
  /** deliveryFee + serviceFee */
  totalFees:    number;
  currencyCode: string;
}

export class FareService {
  static async calculateFare(params: {
    storeLat:         number;
    storeLng:         number;
    deliveryLat:      number;
    deliveryLng:      number;
    cityTier?:        'high' | 'middle' | 'low';
    vehicleType?:     string;
    deliveryAddress?: string; // used for auto city-tier resolution
  }): Promise<FareBreakdown> {
    const vehicleType = params.vehicleType ?? 'motorcycle';

    // Resolve city tier: explicit override → address resolution → default low
    let cityTier: string = params.cityTier ?? 'low';
    if (!params.cityTier && params.deliveryAddress) {
      cityTier = await resolveCityTierFromAddress(params.deliveryAddress);
    }

    // Fetch fare config with fallback chain:
    // exact match → low tier → any active config for this vehicle type
    const config =
      (await prisma.sparePartsFareConfig.findFirst({
        where: { vehicleType, cityTier, isActive: true },
      })) ??
      (await prisma.sparePartsFareConfig.findFirst({
        where: { vehicleType, cityTier: 'low', isActive: true },
      })) ??
      (await prisma.sparePartsFareConfig.findFirst({
        where: { vehicleType, isActive: true },
      }));

    // Use admin-configured values only — no hardcoded fallbacks
    const estimatedBillingUnit = config ? parseFloat(config.estimatedBillingUnit.toString()) : 0;
    const minAmountLessThan3km = config ? parseFloat(config.minAmountLessThan3km.toString())  : 0;
    const serviceFeeRaw        = config ? parseFloat(config.serviceFee.toString())             : 0;
    const roundingFeeRaw       = config ? parseFloat(config.roundingFee.toString())            : 0;

    const distanceKm     = haversineKm(params.storeLat, params.storeLng, params.deliveryLat, params.deliveryLng);
    const rawDeliveryFee = distanceKm * estimatedBillingUnit;

    // ≤ 3 km → flat minimum   |   > 3 km → distance × rate
    const deliveryFee = distanceKm < 3 ? minAmountLessThan3km : rawDeliveryFee;

    // Combine service + rounding — customer sees one "Service Fee" line
    const serviceFee = serviceFeeRaw + roundingFeeRaw;
    const totalFees  = deliveryFee + serviceFee;

    return {
      distanceKm:   Math.round(distanceKm * 100) / 100,
      distanceText: `${(Math.round(distanceKm * 10) / 10).toFixed(1)} km`,
      deliveryFee:  Math.round(deliveryFee),
      serviceFee:   Math.round(serviceFee),
      roundingFee:  Math.round(roundingFeeRaw),
      totalFees:    Math.round(totalFees),
      currencyCode: 'NGN',
    };
  }
}
