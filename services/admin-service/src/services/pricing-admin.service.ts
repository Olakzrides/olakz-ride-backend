import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { NIGERIAN_STATES, CITY_TIERS, CityTier, isValidState } from '../constants/nigerian-states';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RideFareConfigUpdate {
  estimated_billing_unit?: number;
  high_traffic_estimated_billing_unit?: number;
  min_amount_less_than_3km?: number;
  min_amount_for_shared_ride?: number;
  shared_discount_percent?: number;
  service_fee?: number;
  rounding_fee?: number;
  booking_fee?: number;
  fleet_commission_percent?: number;
  is_active?: boolean;
}

export interface CityTierConfigCreate extends RideFareConfigUpdate {}

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateNumericFields(updates: RideFareConfigUpdate): void {
  const numericFields: (keyof RideFareConfigUpdate)[] = [
    'estimated_billing_unit',
    'high_traffic_estimated_billing_unit',
    'min_amount_less_than_3km',
    'min_amount_for_shared_ride',
    'shared_discount_percent',
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
  const percentFields: (keyof RideFareConfigUpdate)[] = [
    'shared_discount_percent',
    'fleet_commission_percent',
  ];
  for (const field of percentFields) {
    const val = updates[field];
    if (val !== undefined && typeof val === 'number' && val > 100) {
      throw new Error(`${field} cannot exceed 100`);
    }
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PricingAdminService {

  // ── Original methods (preserved) ──────────────────────────────────────────

  static async getAllConfigs() {
    const { data, error } = await supabase
      .from('ride_fare_config')
      .select('*')
      .order('vehicle_category', { ascending: true })
      .order('service_tier', { ascending: true })
      .order('city_tier', { ascending: true });

    if (error) throw new Error(`Failed to fetch pricing configs: ${error.message}`);

    const grouped: Record<string, any[]> = {};
    for (const row of data ?? []) {
      if (!grouped[row.vehicle_category]) grouped[row.vehicle_category] = [];
      grouped[row.vehicle_category].push(row);
    }
    return { configs: data ?? [], grouped };
  }

  static async getConfigsByCategory(vehicleCategory: string) {
    const { data, error } = await supabase
      .from('ride_fare_config')
      .select('*')
      .eq('vehicle_category', vehicleCategory)
      .order('service_tier', { ascending: true })
      .order('city_tier', { ascending: true });

    if (error) throw new Error(`Failed to fetch configs for ${vehicleCategory}: ${error.message}`);
    return data ?? [];
  }

  static async getConfig(vehicleCategory: string, serviceTier: string) {
    const { data, error } = await supabase
      .from('ride_fare_config')
      .select('*')
      .eq('vehicle_category', vehicleCategory)
      .eq('service_tier', serviceTier)
      .eq('city_tier', 'national')
      .single();

    if (error || !data) return null;
    return data;
  }

  static async updateConfig(
    vehicleCategory: string,
    serviceTier: string,
    updates: RideFareConfigUpdate,
    adminId: string
  ) {
    validateNumericFields(updates);

    const { data, error } = await supabase
      .from('ride_fare_config')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('vehicle_category', vehicleCategory)
      .eq('service_tier', serviceTier)
      .eq('city_tier', 'national')
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to update config: ${error?.message ?? 'Config not found'}`);

    logger.info('Admin updated ride fare config (national)', { adminId, vehicleCategory, serviceTier, updates });
    return data;
  }

  // ── City-tier state management (uses city_tier_states table) ──────────────

  /**
   * Get all 36+1 Nigerian states enriched with their current city tier assignment.
   */
  static async getStatesWithTierAssignments() {
    const { data, error } = await supabase
      .from('city_tier_states')
      .select('city_tier, state_name');

    if (error) throw new Error(`Failed to fetch tier assignments: ${error.message}`);

    // Build map: stateName → cityTier
    const stateToTier: Record<string, CityTier> = {};
    for (const row of data ?? []) {
      stateToTier[row.state_name] = row.city_tier as CityTier;
    }

    const states = NIGERIAN_STATES.map(s => ({
      ...s,
      cityTier: stateToTier[s.name] ?? null,
    }));

    return { states, stateToTier };
  }

  /**
   * Get all configs grouped by city tier, each tier enriched with its assigned states.
   */
  static async getCityTierConfigs() {
    const [configsResult, statesResult] = await Promise.all([
      supabase
        .from('ride_fare_config')
        .select('*')
        .order('city_tier', { ascending: true })
        .order('vehicle_category', { ascending: true })
        .order('service_tier', { ascending: true }),
      supabase
        .from('city_tier_states')
        .select('city_tier, state_name')
        .order('state_name', { ascending: true }),
    ]);

    if (configsResult.error) throw new Error(`Failed to fetch configs: ${configsResult.error.message}`);
    if (statesResult.error) throw new Error(`Failed to fetch tier states: ${statesResult.error.message}`);

    // Build states-per-tier map
    const tierStates: Record<string, string[]> = { high: [], middle: [], low: [], national: [] };
    for (const row of statesResult.data ?? []) {
      if (!tierStates[row.city_tier]) tierStates[row.city_tier] = [];
      tierStates[row.city_tier].push(row.state_name);
    }

    // Group configs by tier
    const grouped: Record<string, any> = { high: {}, middle: {}, low: {}, national: {} };
    for (const row of configsResult.data ?? []) {
      const tier = row.city_tier ?? 'national';
      if (!grouped[tier]) grouped[tier] = {};
      grouped[tier] = {
        configs: [...(grouped[tier].configs ?? []), row],
        assignedStates: tierStates[tier] ?? [],
      };
    }

    return { configs: configsResult.data ?? [], grouped, tierStates };
  }

  /**
   * Get all configs for a specific city tier, plus the states assigned to it.
   */
  static async getConfigsByCityTier(cityTier: CityTier) {
    const [configsResult, statesResult] = await Promise.all([
      supabase
        .from('ride_fare_config')
        .select('*')
        .eq('city_tier', cityTier)
        .order('vehicle_category', { ascending: true })
        .order('service_tier', { ascending: true }),
      cityTier !== 'national'
        ? supabase
            .from('city_tier_states')
            .select('state_name')
            .eq('city_tier', cityTier)
            .order('state_name', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (configsResult.error) throw new Error(`Failed to fetch configs: ${configsResult.error.message}`);
    if (statesResult.error) throw new Error(`Failed to fetch states: ${statesResult.error.message}`);

    const assignedStates = (statesResult.data ?? []).map((r: any) => r.state_name);
    return { configs: configsResult.data ?? [], assignedStates };
  }

  /**
   * Assign states to a city tier (merge — adds to existing).
   * Automatically removes each state from any other tier it was previously in.
   */
  static async assignStatesToCityTier(
    cityTier: CityTier,
    statesToAdd: string[],
    adminId: string
  ) {
    if (cityTier === 'national') {
      throw new Error('Cannot assign states to the national tier — it is the global fallback');
    }

    const invalidStates = statesToAdd.filter(s => !isValidState(s));
    if (invalidStates.length > 0) {
      throw new Error(`Invalid state names: ${invalidStates.join(', ')}`);
    }

    // Remove these states from any other tier first (enforces one-state-one-tier)
    const { error: deleteError } = await supabase
      .from('city_tier_states')
      .delete()
      .in('state_name', statesToAdd)
      .neq('city_tier', cityTier);

    if (deleteError) throw new Error(`Failed to remove conflicting state assignments: ${deleteError.message}`);

    // Insert into target tier (ignore if already there)
    const rows = statesToAdd.map(state_name => ({ city_tier: cityTier, state_name }));
    const { error: insertError } = await supabase
      .from('city_tier_states')
      .upsert(rows, { onConflict: 'city_tier,state_name', ignoreDuplicates: true });

    if (insertError) throw new Error(`Failed to assign states: ${insertError.message}`);

    // Return the full updated list for this tier
    const { data: updated } = await supabase
      .from('city_tier_states')
      .select('state_name')
      .eq('city_tier', cityTier)
      .order('state_name', { ascending: true });

    const assignedStates = (updated ?? []).map(r => r.state_name);

    logger.info('Admin assigned states to city tier', { adminId, cityTier, added: statesToAdd, total: assignedStates.length });
    return { cityTier, assignedStates };
  }

  /**
   * Replace the full states list for a city tier (overwrite).
   * Removes states from other tiers if they conflict.
   */
  static async setStatesForCityTier(
    cityTier: CityTier,
    states: string[],
    adminId: string
  ) {
    if (cityTier === 'national') {
      throw new Error('Cannot assign states to the national tier');
    }

    const invalidStates = states.filter(s => !isValidState(s));
    if (invalidStates.length > 0) {
      throw new Error(`Invalid state names: ${invalidStates.join(', ')}`);
    }

    // Remove ALL current assignments for this tier
    const { error: clearError } = await supabase
      .from('city_tier_states')
      .delete()
      .eq('city_tier', cityTier);

    if (clearError) throw new Error(`Failed to clear existing states: ${clearError.message}`);

    if (states.length === 0) {
      logger.info('Admin cleared all states for city tier', { adminId, cityTier });
      return { cityTier, states: [] };
    }

    // Remove these states from any other tier (conflict resolution)
    await supabase
      .from('city_tier_states')
      .delete()
      .in('state_name', states)
      .neq('city_tier', cityTier);

    // Insert the new list
    const rows = states.map(state_name => ({ city_tier: cityTier, state_name }));
    const { error: insertError } = await supabase
      .from('city_tier_states')
      .insert(rows);

    if (insertError) throw new Error(`Failed to set states: ${insertError.message}`);

    logger.info('Admin set states for city tier', { adminId, cityTier, count: states.length });
    return { cityTier, states };
  }

  /**
   * Remove specific states from a city tier.
   */
  static async removeStatesFromCityTier(
    cityTier: CityTier,
    statesToRemove: string[],
    adminId: string
  ) {
    if (cityTier === 'national') {
      throw new Error('Cannot modify states on the national tier');
    }

    const invalidStates = statesToRemove.filter(s => !isValidState(s));
    if (invalidStates.length > 0) {
      throw new Error(`Invalid state names: ${invalidStates.join(', ')}`);
    }

    const { error } = await supabase
      .from('city_tier_states')
      .delete()
      .eq('city_tier', cityTier)
      .in('state_name', statesToRemove);

    if (error) throw new Error(`Failed to remove states: ${error.message}`);

    const { data: remaining } = await supabase
      .from('city_tier_states')
      .select('state_name')
      .eq('city_tier', cityTier)
      .order('state_name', { ascending: true });

    const remainingStates = (remaining ?? []).map(r => r.state_name);

    logger.info('Admin removed states from city tier', { adminId, cityTier, removed: statesToRemove });
    return { cityTier, remainingStates, removedStates: statesToRemove };
  }

  // ── City-tier pricing config ───────────────────────────────────────────────

  static async getCityTierConfig(
    vehicleCategory: string,
    serviceTier: string,
    cityTier: CityTier
  ) {
    const { data, error } = await supabase
      .from('ride_fare_config')
      .select('*')
      .eq('vehicle_category', vehicleCategory)
      .eq('service_tier', serviceTier)
      .eq('city_tier', cityTier)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch config: ${error.message}`);
    return data ?? null;
  }

  /**
   * Upsert pricing for a specific vehicle + service tier + city tier.
   * Creates the row if it doesn't exist, updates it if it does.
   */
  static async updateCityTierConfig(
    vehicleCategory: string,
    serviceTier: string,
    cityTier: CityTier,
    updates: RideFareConfigUpdate,
    adminId: string
  ) {
    validateNumericFields(updates);

    // Fetch existing row to merge partial updates
    const { data: existing } = await supabase
      .from('ride_fare_config')
      .select('*')
      .eq('vehicle_category', vehicleCategory)
      .eq('service_tier', serviceTier)
      .eq('city_tier', cityTier)
      .maybeSingle();

    const payload = {
      vehicle_category: vehicleCategory,
      service_tier: serviceTier,
      city_tier: cityTier,
      estimated_billing_unit:              updates.estimated_billing_unit              ?? existing?.estimated_billing_unit              ?? 0,
      high_traffic_estimated_billing_unit: updates.high_traffic_estimated_billing_unit ?? existing?.high_traffic_estimated_billing_unit ?? 0,
      min_amount_less_than_3km:            updates.min_amount_less_than_3km            ?? existing?.min_amount_less_than_3km            ?? 0,
      min_amount_for_shared_ride:          updates.min_amount_for_shared_ride          ?? existing?.min_amount_for_shared_ride          ?? 0,
      shared_discount_percent:             updates.shared_discount_percent             ?? existing?.shared_discount_percent             ?? 0,
      service_fee:                         updates.service_fee                         ?? existing?.service_fee                         ?? 0,
      rounding_fee:                        updates.rounding_fee                        ?? existing?.rounding_fee                        ?? 0,
      booking_fee:                         updates.booking_fee                         ?? existing?.booking_fee                         ?? 0,
      fleet_commission_percent:            updates.fleet_commission_percent            ?? existing?.fleet_commission_percent            ?? 0,
      is_active:                           updates.is_active                           ?? existing?.is_active                           ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ride_fare_config')
      .upsert(payload, { onConflict: 'vehicle_category,service_tier,city_tier', ignoreDuplicates: false })
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to save config: ${error?.message}`);

    logger.info('Admin upserted city tier pricing config', { adminId, vehicleCategory, serviceTier, cityTier });
    return data;
  }

  /**
   * Create a new pricing config for a vehicle + service tier + city tier.
   * Uses upsert so it never errors on duplicate.
   */
  static async createCityTierConfig(
    vehicleCategory: string,
    serviceTier: string,
    cityTier: CityTier,
    data: CityTierConfigCreate,
    adminId: string
  ) {
    validateNumericFields(data);

    const payload = {
      vehicle_category: vehicleCategory,
      service_tier: serviceTier,
      city_tier: cityTier,
      estimated_billing_unit:              data.estimated_billing_unit              ?? 0,
      high_traffic_estimated_billing_unit: data.high_traffic_estimated_billing_unit ?? 0,
      min_amount_less_than_3km:            data.min_amount_less_than_3km            ?? 0,
      min_amount_for_shared_ride:          data.min_amount_for_shared_ride          ?? 0,
      shared_discount_percent:             data.shared_discount_percent             ?? 0,
      service_fee:                         data.service_fee                         ?? 0,
      rounding_fee:                        data.rounding_fee                        ?? 0,
      booking_fee:                         data.booking_fee                         ?? 0,
      fleet_commission_percent:            data.fleet_commission_percent            ?? 0,
      is_active:                           data.is_active                           ?? true,
      updated_at: new Date().toISOString(),
    };

    const { data: created, error } = await supabase
      .from('ride_fare_config')
      .upsert(payload, { onConflict: 'vehicle_category,service_tier,city_tier', ignoreDuplicates: false })
      .select()
      .single();

    if (error || !created) throw new Error(`Failed to create config: ${error?.message}`);

    logger.info('Admin created city tier pricing config', { adminId, vehicleCategory, serviceTier, cityTier });
    return created;
  }
}
