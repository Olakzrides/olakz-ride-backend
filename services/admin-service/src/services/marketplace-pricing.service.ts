import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { CITY_TIERS, CityTier, getStateNames } from '../constants/nigerian-states';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MarketplaceFareConfigUpdate {
  /** Cost per km charged to the customer */
  estimated_billing_unit?: number;
  /** Cost per km during peak / high-traffic hours */
  high_traffic_estimated_billing_unit?: number;
  /** Minimum delivery fee for orders under 3 km */
  min_amount_less_than_3km?: number;
  /** Flat platform service fee added to every order */
  service_fee?: number;
  /** Rounding fee applied to the final fare */
  rounding_fee?: number;
  /** Booking / processing fee charged upfront */
  booking_fee?: number;
  /** Commission the platform takes from the courier's delivery earning (%) */
  fleet_commission_percent?: number;
  is_active?: boolean;
}

// Vehicle types available for marketplace delivery
// Uses vehicle_type to stay consistent with the marketplace_fare_config table
// (avoids renaming what the marketplace-service already knows as vehicle_type)
export const MARKETPLACE_VEHICLE_TYPES = [
  'car',
  'motorcycle',
  'bicycle',
  'bus',
  'fleet',
] as const;

export type MarketplaceVehicleType = typeof MARKETPLACE_VEHICLE_TYPES[number];

// ─── Validation ───────────────────────────────────────────────────────────────

function validateNumericFields(updates: MarketplaceFareConfigUpdate): void {
  const numericFields: (keyof MarketplaceFareConfigUpdate)[] = [
    'estimated_billing_unit',
    'high_traffic_estimated_billing_unit',
    'min_amount_less_than_3km',
    'service_fee',
    'rounding_fee',
    'booking_fee',
    'fleet_commission_percent',
  ];

  for (const field of numericFields) {
    const val = updates[field];
    if (val !== undefined && typeof val === 'number' && val < 0) {
      throw new Error(`${field} cannot be negative`);
    }
  }

  if (
    updates.fleet_commission_percent !== undefined &&
    typeof updates.fleet_commission_percent === 'number' &&
    updates.fleet_commission_percent > 100
  ) {
    throw new Error('fleet_commission_percent cannot exceed 100');
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MarketplacePricingService {

  /**
   * Get all marketplace fare configs grouped by vehicle type.
   */
  static async getAllConfigs() {
    const { data, error } = await supabase
      .from('marketplace_fare_config')
      .select('*')
      .order('vehicle_type', { ascending: true })
      .order('city_tier', { ascending: true });

    if (error) throw new Error(`Failed to fetch marketplace pricing configs: ${error.message}`);

    const grouped: Record<string, unknown[]> = {};
    for (const row of data ?? []) {
      if (!grouped[row.vehicle_type]) grouped[row.vehicle_type] = [];
      grouped[row.vehicle_type].push(row);
    }

    return { configs: data ?? [], grouped };
  }

  /**
   * Get all configs for a specific vehicle type across all city tiers.
   */
  static async getConfigsByVehicleType(vehicleType: string) {
    const { data, error } = await supabase
      .from('marketplace_fare_config')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .order('city_tier', { ascending: true });

    if (error) throw new Error(`Failed to fetch configs for ${vehicleType}: ${error.message}`);
    return data ?? [];
  }

  /**
   * Get a single config by vehicle type + city tier.
   * Returns null if not yet saved — frontend renders empty form.
   */
  static async getConfig(vehicleType: string, cityTier: CityTier) {
    const { data, error } = await supabase
      .from('marketplace_fare_config')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .eq('city_tier', cityTier)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch config: ${error.message}`);
    return data ?? null;
  }

  /**
   * Upsert pricing for a vehicle type + city tier.
   * Creates the row if it doesn't exist, updates it if it does.
   * Automatically syncs the same values to food_fare_config and delivery_fare_config
   * so all three delivery channels always use the same pricing.
   */
  static async updateConfig(
    vehicleType: string,
    cityTier: CityTier,
    updates: MarketplaceFareConfigUpdate,
    adminId: string
  ) {
    validateNumericFields(updates);

    const { data: existing } = await supabase
      .from('marketplace_fare_config')
      .select('*')
      .eq('vehicle_type', vehicleType)
      .eq('city_tier', cityTier)
      .maybeSingle();

    const payload = {
      vehicle_type:                        vehicleType,
      city_tier:                           cityTier,
      estimated_billing_unit:              updates.estimated_billing_unit              ?? existing?.estimated_billing_unit              ?? 0,
      high_traffic_estimated_billing_unit: updates.high_traffic_estimated_billing_unit ?? existing?.high_traffic_estimated_billing_unit ?? 0,
      min_amount_less_than_3km:            updates.min_amount_less_than_3km            ?? existing?.min_amount_less_than_3km            ?? 0,
      service_fee:                         updates.service_fee                         ?? existing?.service_fee                         ?? 0,
      rounding_fee:                        updates.rounding_fee                        ?? existing?.rounding_fee                        ?? 0,
      booking_fee:                         updates.booking_fee                         ?? existing?.booking_fee                         ?? 0,
      fleet_commission_percent:            updates.fleet_commission_percent            ?? existing?.fleet_commission_percent            ?? 0,
      is_active:                           updates.is_active                           ?? existing?.is_active                           ?? true,
      updated_at: new Date().toISOString(),
    };

    // ── 1. Save to marketplace_fare_config (source of truth) ─────────────────
    const { data, error } = await supabase
      .from('marketplace_fare_config')
      .upsert(payload, { onConflict: 'vehicle_type,city_tier', ignoreDuplicates: false })
      .select()
      .single();

    if (error || !data) {
      logger.error('Failed to save marketplace_fare_config', {
        error: error?.message,
        vehicleType,
        cityTier,
        payload,
      });
      throw new Error(`Failed to save config: ${error?.message}`);
    }

    logger.info('marketplace_fare_config saved', {
      adminId, vehicleType, cityTier,
      min_amount_less_than_3km: payload.min_amount_less_than_3km,
      service_fee: payload.service_fee,
    });

    // ── 2. Sync to food_fare_config ───────────────────────────────────────────
    const foodPayload = {
      vehicle_type:                        vehicleType,
      city_tier:                           cityTier,
      estimated_billing_unit:              payload.estimated_billing_unit,
      high_traffic_estimated_billing_unit: payload.high_traffic_estimated_billing_unit,
      min_amount_less_than_3km:            payload.min_amount_less_than_3km,
      service_fee:                         payload.service_fee,
      rounding_fee:                        payload.rounding_fee,
      booking_fee:                         payload.booking_fee,
      fleet_commission_percent:            payload.fleet_commission_percent,
      is_active:                           payload.is_active,
      updated_at:                          payload.updated_at,
    };

    const { error: foodErr } = await supabase
      .from('food_fare_config')
      .upsert(foodPayload, { onConflict: 'vehicle_type,city_tier', ignoreDuplicates: false });

    if (foodErr) {
      logger.warn('Failed to sync pricing to food_fare_config', {
        error: foodErr.message, vehicleType, cityTier,
      });
    } else {
      logger.info('food_fare_config synced', { vehicleType, cityTier });
    }

    // ── 3. Sync to delivery_fare_config ───────────────────────────────────────
    // delivery_fare_config is keyed by (vehicle_type_id, region_id).
    // We look up the vehicle_type UUID from vehicle_types by name, then update
    // ALL rows for that vehicle type (all regions) with the new pricing values.
    // city_tier on delivery_fare_config is also updated to reflect the admin setting.
    const { data: vehicleTypeRow } = await supabase
      .from('vehicle_types')
      .select('id, name')
      .ilike('name', vehicleType)
      .maybeSingle();

    if (vehicleTypeRow) {
      const deliveryPayload = {
        estimated_billing_unit:              payload.estimated_billing_unit,
        high_traffic_estimated_billing_unit: payload.high_traffic_estimated_billing_unit,
        min_amount_less_than_3km:            payload.min_amount_less_than_3km,
        service_fee:                         payload.service_fee,
        rounding_fee:                        payload.rounding_fee,
        booking_fee:                         payload.booking_fee,
        fleet_commission_percent:            payload.fleet_commission_percent,
        city_tier:                           cityTier,
        is_active:                           payload.is_active,
        updated_at:                          payload.updated_at,
      };

      // Update the row for this vehicle_type_id + city_tier (all regions)
      const { data: deliveryUpdated, error: deliveryErr } = await supabase
        .from('delivery_fare_config')
        .update(deliveryPayload)
        .eq('vehicle_type_id', vehicleTypeRow.id)
        .eq('city_tier', cityTier)
        .select('id');

      if (deliveryErr) {
        logger.warn('Failed to sync pricing to delivery_fare_config', {
          error: deliveryErr.message, vehicleType, vehicleTypeId: vehicleTypeRow.id, cityTier,
        });
      } else if ((deliveryUpdated?.length ?? 0) === 0) {
        // No row yet for this vehicle + tier — insert one for the default Lagos region
        const DEFAULT_REGION_ID = '00000000-0000-0000-0000-000000000001';

        const { error: insertErr } = await supabase
          .from('delivery_fare_config')
          .insert({
            vehicle_type_id: vehicleTypeRow.id,
            region_id:       DEFAULT_REGION_ID,
            ...deliveryPayload,
            base_fare:    0,
            price_per_km: payload.estimated_billing_unit,
            minimum_fare: payload.min_amount_less_than_3km,
            currency_code: 'NGN',
          });

        if (insertErr) {
          // Legacy columns may have been dropped — try without them
          const { error: insertErr2 } = await supabase
            .from('delivery_fare_config')
            .insert({
              vehicle_type_id: vehicleTypeRow.id,
              region_id:       DEFAULT_REGION_ID,
              ...deliveryPayload,
              currency_code: 'NGN',
            });

          if (insertErr2) {
            logger.warn('Failed to seed delivery_fare_config row', {
              error: insertErr2.message, vehicleType, cityTier,
            });
          } else {
            logger.info('delivery_fare_config seeded (no legacy cols)', { vehicleType, cityTier });
          }
        } else {
          logger.info('delivery_fare_config seeded with default region', { vehicleType, cityTier });
        }
      } else {
        logger.info('delivery_fare_config synced', {
          vehicleType, vehicleTypeId: vehicleTypeRow.id, cityTier,
          rowsUpdated: deliveryUpdated?.length ?? 0,
        });
      }
    } else {
      logger.warn('vehicle_type not found in vehicle_types table — delivery sync skipped', { vehicleType });
    }

    logger.info('Marketplace pricing config saved + synced', { adminId, vehicleType, cityTier });
    return data;
  }

  /**
   * Get all configs grouped by city tier, each enriched with assigned states.
   * Reuses the shared city_tier_states table — same state assignments as ride pricing.
   */
  static async getCityTierConfigs() {
    const [configsResult, statesResult] = await Promise.all([
      supabase
        .from('marketplace_fare_config')
        .select('*')
        .order('city_tier', { ascending: true })
        .order('vehicle_type', { ascending: true }),
      supabase
        .from('city_tier_states')
        .select('city_tier, state_name')
        .order('state_name', { ascending: true }),
    ]);

    if (configsResult.error) throw new Error(`Failed to fetch configs: ${configsResult.error.message}`);
    if (statesResult.error) throw new Error(`Failed to fetch tier states: ${statesResult.error.message}`);

    const tierStates: Record<string, string[]> = { high: [], middle: [], low: [] };
    const assignedStateNames = new Set<string>();

    for (const row of statesResult.data ?? []) {
      if (!tierStates[row.city_tier]) tierStates[row.city_tier] = [];
      tierStates[row.city_tier].push(row.state_name);
      assignedStateNames.add(row.state_name);
    }

    for (const name of getStateNames()) {
      if (!assignedStateNames.has(name)) tierStates['low'].push(name);
    }
    tierStates['low'].sort();

    const grouped: Record<string, unknown> = {
      high:   { configs: [], assignedStates: tierStates.high },
      middle: { configs: [], assignedStates: tierStates.middle },
      low:    { configs: [], assignedStates: tierStates.low },
    };

    for (const row of configsResult.data ?? []) {
      const tier = row.city_tier ?? 'low';
      (grouped[tier] as Record<string, unknown[]>).configs.push(row);
    }

    return { configs: configsResult.data ?? [], grouped, tierStates };
  }

  /**
   * Get all configs for a specific city tier, plus states assigned to it.
   */
  static async getConfigsByCityTier(cityTier: CityTier) {
    const [configsResult, statesResult] = await Promise.all([
      supabase
        .from('marketplace_fare_config')
        .select('*')
        .eq('city_tier', cityTier)
        .order('vehicle_type', { ascending: true }),
      supabase
        .from('city_tier_states')
        .select('city_tier, state_name')
        .order('state_name', { ascending: true }),
    ]);

    if (configsResult.error) throw new Error(`Failed to fetch configs: ${configsResult.error.message}`);
    if (statesResult.error) throw new Error(`Failed to fetch states: ${statesResult.error.message}`);

    let assignedStates: string[];

    if (cityTier === 'low') {
      const explicitlyHighOrMiddle = new Set(
        (statesResult.data ?? [])
          .filter(r => r.city_tier !== 'low')
          .map(r => r.state_name)
      );
      const explicitLow  = (statesResult.data ?? []).filter(r => r.city_tier === 'low').map(r => r.state_name);
      const implicitLow  = getStateNames().filter(n => !explicitlyHighOrMiddle.has(n) && !explicitLow.includes(n));
      assignedStates     = [...new Set([...explicitLow, ...implicitLow])].sort();
    } else {
      assignedStates = (statesResult.data ?? [])
        .filter(r => r.city_tier === cityTier)
        .map(r => r.state_name);
    }

    return { configs: configsResult.data ?? [], assignedStates };
  }
}
