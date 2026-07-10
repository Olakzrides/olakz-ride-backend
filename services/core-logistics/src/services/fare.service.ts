import { supabase } from '../config/database';
import { MapsUtil } from '../utils/maps.util';
import { FareCalculation, Location, VariantWithPrice } from '../types';
import { logger } from '../config/logger';


interface RideFareConfig {
  vehicle_category: string;
  service_tier: string;
  city_tier: string;
  estimated_billing_unit: number;
  high_traffic_estimated_billing_unit: number;
  min_amount_less_than_3km: number;
  min_amount_for_shared_ride: number;
  shared_discount_percent: number;
  service_fee: number;
  rounding_fee: number;
  booking_fee: number;
  fleet_commission_percent: number;
}


/**
 * Map a vehicle type name (from ride_variants → vehicle_types) to a
 * vehicle_category key used in ride_fare_config.
 */
function resolveVehicleCategory(vehicleTypeName: string): string {
  const name = vehicleTypeName.toLowerCase();
  if (name.includes('bicycle') || name.includes('bike')) return 'bicycle';
  if (name.includes('motorcycle') || name.includes('moto') || name.includes('okada')) return 'motorcycle';
  if (name.includes('bus') || name.includes('minibus')) return 'bus';
  if (name.includes('truck') || name.includes('lorry')) return 'truck';
  return 'car'; // default — covers car, minibus, standard, premium, vip
}

/**
 * Map a variant title (Standard / Premium / VIP) to a service_tier key.
 * Only applies to cars — all other categories use 'default'.
 */
function resolveServiceTier(variantTitle: string, vehicleCategory: string): string {
  if (vehicleCategory !== 'car') return 'default';
  const title = variantTitle.toLowerCase();
  if (title.includes('premium')) return 'premium';
  if (title.includes('vip')) return 'vip';
  return 'standard';
}


export class FareService {
  /**
   * Resolve which city_tier a given Nigerian state belongs to.
   * Looks up city_tier_states table. Returns 'low' if not found
   * (unassigned states implicitly belong to low tier).
   */
  private async resolveCityTierForState(state: string): Promise<string> {
    const { data, error } = await supabase
      .from('city_tier_states')
      .select('city_tier')
      .ilike('state_name', state)
      .maybeSingle();

    if (error) {
      logger.error('resolveCityTierForState DB error', { state, error: error.message });
      return 'low';
    }

    if (!data) {
      logger.warn('resolveCityTierForState: state not found in city_tier_states — defaulting to low', { state });
      return 'low';
    }

    logger.info('resolveCityTierForState: resolved', { state, cityTier: data.city_tier });
    return data.city_tier;
  }

  /**
   * Load the fare config for a given vehicle category + service tier.
   *
   * If a pickup state is provided:
   *   1. Resolve which city_tier that state belongs to (high | middle | low).
   *   2. Load the config for that city_tier.
   *   3. If not found, fall back to 'low' (the universal fallback).
   *
   * If no state is provided, loads the 'low' config directly.
   * Falls back to 'default' service tier if the specific tier has no config.
   */
  async getFareConfig(
    vehicleCategory: string,
    serviceTier: string,
    pickupState?: string
  ): Promise<RideFareConfig | null> {
    const cityTier = pickupState
      ? await this.resolveCityTierForState(pickupState)
      : 'low';

    logger.info('getFareConfig: looking up config', { vehicleCategory, serviceTier, cityTier, pickupState });

    // Try exact match: vehicleCategory + serviceTier + cityTier
    const { data, error } = await supabase
      .from('ride_fare_config')
      .select('*')
      .eq('vehicle_category', vehicleCategory)
      .eq('service_tier', serviceTier)
      .eq('city_tier', cityTier)
      .eq('is_active', true)
      .single();

    if (!error && data) return data as RideFareConfig;

    // If city-tier config not found, fall back to 'low' (universal fallback)
    if (cityTier !== 'low') {
      logger.warn(`No fare config for ${vehicleCategory}/${serviceTier}/${cityTier}, falling back to low`, { pickupState });
      const { data: lowConfig } = await supabase
        .from('ride_fare_config')
        .select('*')
        .eq('vehicle_category', vehicleCategory)
        .eq('service_tier', serviceTier)
        .eq('city_tier', 'low')
        .eq('is_active', true)
        .single();
      if (lowConfig) return lowConfig as RideFareConfig;
    }

    // Final fallback: 'default' service tier + low city tier
    const { data: fallback } = await supabase
      .from('ride_fare_config')
      .select('*')
      .eq('vehicle_category', vehicleCategory)
      .eq('service_tier', 'default')
      .eq('city_tier', 'low')
      .eq('is_active', true)
      .single();

    return fallback ?? null;
  }

  /**
   * Core fare calculation using ride_fare_config.
   *
   * Rules:
   *   distance <= 3km  → flat fee (min_amount_less_than_3km), NO discount
   *   distance >  3km  → billing_unit × distance
   *                       if shared ride → apply shared_discount_percent
   *   always add       → service_fee + rounding_fee + booking_fee (motorcycle)
   *
   * Returns both the customer total and the driver's portion separately.
   */
  private applyFareFormula(
    config: RideFareConfig,
    distance: number,
    isSharedRide: boolean,
  ): {
    rideFare: number;
    sharedDiscount: number;
    driverFare: number;
    serviceFee: number;
    roundingFee: number;
    bookingFee: number;
    totalFare: number;
  } {
    // Effective billing unit = base rate + high-traffic surcharge.
    // high_traffic_estimated_billing_unit defaults to 0, so when admin hasn't
    // set a surcharge the formula is identical to the old base-only rate.
    // When admin sets a surcharge (e.g. 200) it is immediately added to every
    // fare for that specific vehicle / tier / city-tier config row.
    const billingUnit = Number(config.estimated_billing_unit)
                      + Number(config.high_traffic_estimated_billing_unit ?? 0);

    let rideFare: number;
    let sharedDiscount = 0;

    if (distance <= 3) {
      // Flat fee for short trips — no discount even if shared
      rideFare = Number(config.min_amount_less_than_3km);
    } else {
      // Distance-based fare
      rideFare = billingUnit * distance;

      // Apply shared ride discount only when distance > 3km
      if (isSharedRide && Number(config.shared_discount_percent) > 0) {
        sharedDiscount = rideFare * (Number(config.shared_discount_percent) / 100);
        rideFare = rideFare - sharedDiscount;

        // Enforce minimum shared ride amount
        const minShared = Number(config.min_amount_for_shared_ride);
        if (minShared > 0 && rideFare < minShared) {
          rideFare = minShared;
          sharedDiscount = 0; // reset if minimum overrides
        }
      }
    }

    const serviceFee  = Number(config.service_fee);
    const roundingFee = Number(config.rounding_fee);
    const bookingFee  = Number(config.booking_fee); // motorcycle only, 0 for others

    // Driver only sees rideFare — platform fees are invisible to them
    const driverFare = Math.round(rideFare);
    const totalFare  = Math.round(rideFare + serviceFee + roundingFee + bookingFee);

    return { rideFare: Math.round(rideFare), sharedDiscount: Math.round(sharedDiscount), driverFare, serviceFee, roundingFee, bookingFee, totalFare };
  }

  /**
   * Calculate prices for all variants shown to the customer on the cart screen.
   * Called when the customer sets a dropoff location.
   *
   * @param pickupState - Optional Nigerian state name derived from pickup coordinates.
   *                      When provided, city-tier pricing is applied automatically.
   */
  async calculateVariantPrices(
    variants: any[],
    pickupLocation: Location,
    dropoffLocation: Location | null,
    currencyCode: string = 'NGN',
    bookingType: string = 'for_me',
    pickupState?: string
  ): Promise<VariantWithPrice[]> {
    try {
      const isSharedRide = bookingType === 'for_friend';

      // No dropoff yet — return minimum fares as placeholder
      if (!dropoffLocation) {
        const results: VariantWithPrice[] = [];
        for (const variant of variants) {
          const vehicleCategory = resolveVehicleCategory(variant.vehicle_type?.name ?? '');
          const serviceTier = resolveServiceTier(variant.title ?? '', vehicleCategory);
          const config = await this.getFareConfig(vehicleCategory, serviceTier, pickupState);
          const minFare = config ? Number(config.min_amount_less_than_3km) : Number(variant.minimum_fare ?? 0);

          results.push({
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            product_id: variant.product_id,
            calculated_price: {
              calculated_amount: Math.round(minFare * 100),
              currency_code: currencyCode,
            },
            metadata: {
              ...variant.metadata,
              estimatedWaitTime: variant.metadata?.estimatedWaitTime,
              description: variant.metadata?.description,
            },
          });
        }
        return results;
      }

      // Get route info
      const routeInfo = await MapsUtil.getDirections(
        { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
        { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude }
      );

      const results: VariantWithPrice[] = [];

      for (const variant of variants) {
        const vehicleCategory = resolveVehicleCategory(variant.vehicle_type?.name ?? '');
        const serviceTier = resolveServiceTier(variant.title ?? '', vehicleCategory);
        const config = await this.getFareConfig(vehicleCategory, serviceTier, pickupState);

        if (!config) {
          // Fallback to old formula if no config found
          logger.warn(`No fare config found for ${vehicleCategory}/${serviceTier}, using variant pricing`);
          const baseFare = parseFloat(variant.base_price ?? 0);
          const distanceFare = parseFloat(variant.price_per_km ?? 0) * routeInfo.distance;
          const timeFare = parseFloat(variant.price_per_minute ?? 0) * routeInfo.duration;
          const totalFare = Math.max(baseFare + distanceFare + timeFare, parseFloat(variant.minimum_fare ?? 0));

          results.push({
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            product_id: variant.product_id,
            calculated_price: {
              calculated_amount: Math.round(totalFare * 100),
              currency_code: currencyCode,
            },
            metadata: { ...variant.metadata, distance_km: routeInfo.distance, duration_minutes: routeInfo.duration },
          });
          continue;
        }

        const { rideFare, sharedDiscount, driverFare, serviceFee, roundingFee, bookingFee, totalFare } =
          this.applyFareFormula(config, routeInfo.distance, isSharedRide);

        // Build breakdown — only include shared_discount when it applies
        const fareBreakdown: Record<string, number> = {
          ride_fare: rideFare,
          service_fee: serviceFee,
          rounding_fee: roundingFee,
        };
        if (bookingFee > 0) fareBreakdown.booking_fee = bookingFee;
        if (sharedDiscount > 0) fareBreakdown.shared_discount = -sharedDiscount;

        results.push({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          product_id: variant.product_id,
          calculated_price: {
            calculated_amount: Math.round(totalFare * 100),
            currency_code: currencyCode,
          },
          metadata: {
            ...variant.metadata,
            distance_km: routeInfo.distance,
            duration_minutes: routeInfo.duration,
            driver_fare: driverFare,
            fare_breakdown: fareBreakdown,
          },
        });
      }

      return results;
    } catch (error) {
      logger.error('Calculate variant prices error:', error);
      throw error;
    }
  }

  /**
   * Calculate the final fare for a specific variant at booking time.
   * Returns both the customer total and the driver's portion.
   *
   * @param pickupState - Optional Nigerian state name derived from pickup coordinates.
   *                      When provided, city-tier pricing is applied automatically.
   */
  async calculateFinalFare(params: {
    variantId: string;
    pickupLocation: Location;
    dropoffLocation: Location;
    currencyCode: string;
    bookingType?: string;
    pickupState?: string;
  }): Promise<FareCalculation> {
    try {
      const { variantId, pickupLocation, dropoffLocation, bookingType = 'for_me', pickupState } = params;
      const isSharedRide = bookingType === 'for_friend';

      // Get variant + vehicle type name
      const { data: variant, error } = await supabase
        .from('ride_variants')
        .select(`
          *,
          vehicle_type:vehicle_types(name, display_name)
        `)
        .eq('id', variantId)
        .single();

      if (error || !variant) throw new Error('Variant not found');

      const vehicleCategory = resolveVehicleCategory((variant.vehicle_type as any)?.name ?? '');
      const serviceTier = resolveServiceTier(variant.title ?? '', vehicleCategory);
      const config = await this.getFareConfig(vehicleCategory, serviceTier, pickupState);

      // Get route info
      const routeInfo = await MapsUtil.getDirections(
        { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
        { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude }
      );

      if (!config) {
        // Fallback to old formula
        logger.warn(`No fare config for ${vehicleCategory}/${serviceTier}, using variant pricing`);
        const baseFare = parseFloat(variant.base_price);
        const distanceFare = parseFloat(variant.price_per_km) * routeInfo.distance;
        const timeFare = parseFloat(variant.price_per_minute) * routeInfo.duration;
        const totalFare = Math.round(Math.max(baseFare + distanceFare + timeFare, parseFloat(variant.minimum_fare)));

        return {
          totalFare,
          driverFare: totalFare,
          serviceFee: 0,
          roundingFee: 0,
          bookingFee: 0,
          sharedDiscount: 0,
          distance: routeInfo.distance,
          duration: routeInfo.duration,
          distanceText: routeInfo.distanceText,
          durationText: routeInfo.durationText,
          isSharedRide,
          fareBreakdown: {
            rideFare: totalFare,
            sharedDiscount: 0,
            serviceFee: 0,
            roundingFee: 0,
            bookingFee: 0,
          },
        };
      }

      const { rideFare, sharedDiscount, driverFare, serviceFee, roundingFee, bookingFee, totalFare } =
        this.applyFareFormula(config, routeInfo.distance, isSharedRide);

      return {
        totalFare,
        driverFare,
        serviceFee,
        roundingFee,
        bookingFee,
        sharedDiscount,
        distance: routeInfo.distance,
        duration: routeInfo.duration,
        distanceText: routeInfo.distanceText,
        durationText: routeInfo.durationText,
        isSharedRide,
        fareBreakdown: {
          rideFare,
          sharedDiscount: isSharedRide && routeInfo.distance > 3 ? -sharedDiscount : 0,
          serviceFee,
          roundingFee,
          bookingFee,
        },
      };
    } catch (error) {
      logger.error('Calculate final fare error:', error);
      throw error;
    }
  }

  /**
   * Calculate the final fare at trip completion using actual distance.
   * Used by completeTrip() in driver-ride.service.ts.
   *
   * @param pickupState - Optional Nigerian state name. When provided, city-tier
   *                      pricing is applied (same config used at booking time).
   */
  async calculateCompletionFare(params: {
    variantId: string;
    actualDistance: number;
    bookingType?: string;
    pickupState?: string;
  }): Promise<{
    totalFare: number;
    driverFare: number;
    serviceFee: number;
    roundingFee: number;
    bookingFee: number;
    sharedDiscount: number;
  }> {
    try {
      const { variantId, actualDistance, bookingType = 'for_me', pickupState } = params;
      const isSharedRide = bookingType === 'for_friend';

      const { data: variant } = await supabase
        .from('ride_variants')
        .select('*, vehicle_type:vehicle_types(name)')
        .eq('id', variantId)
        .single();

      if (!variant) throw new Error('Variant not found');

      const vehicleCategory = resolveVehicleCategory((variant.vehicle_type as any)?.name ?? '');
      const serviceTier = resolveServiceTier(variant.title ?? '', vehicleCategory);
      const config = await this.getFareConfig(vehicleCategory, serviceTier, pickupState);

      if (!config) {
        // Fallback
        const baseFare = parseFloat(variant.base_price);
        const distanceFare = parseFloat(variant.price_per_km) * actualDistance;
        const totalFare = Math.round(Math.max(baseFare + distanceFare, parseFloat(variant.minimum_fare)));
        return { totalFare, driverFare: totalFare, serviceFee: 0, roundingFee: 0, bookingFee: 0, sharedDiscount: 0 };
      }

      const { sharedDiscount, driverFare, serviceFee, roundingFee, bookingFee, totalFare } =
        this.applyFareFormula(config, actualDistance, isSharedRide);

      return { totalFare, driverFare, serviceFee, roundingFee, bookingFee, sharedDiscount };
    } catch (error) {
      logger.error('Calculate completion fare error:', error);
      throw error;
    }
  }
}
