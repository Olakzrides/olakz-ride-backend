import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { NIGERIAN_STATES, CITY_TIERS, CityTier, isValidState, getStateNames } from '../constants/nigerian-states';

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

  // ── Config CRUD ───────────────────────────────────────────────────────────

  /**
   * Get all fare configs grouped by vehicle category.
   */
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

  /**
   * Get all configs for a specific vehicle category.
   */
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

  /**
   * Get a single config by vehicle + service tier + city tier.
   */
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
   * Create a new pricing config (upsert — never errors on duplicate).
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

  // ── City-tier state management ─────────────────────────────────────────────

  /**
   * Get all 36+1 Nigerian states with their current city tier assignment.
   * States not explicitly assigned to high or middle are implicitly 'low'.
   */
  static async getStatesWithTierAssignments() {
    const { data, error } = await supabase
      .from('city_tier_states')
      .select('city_tier, state_name');

    if (error) throw new Error(`Failed to fetch tier assignments: ${error.message}`);

    const stateToTier: Record<string, CityTier> = {};
    for (const row of data ?? []) {
      stateToTier[row.state_name] = row.city_tier as CityTier;
    }

    // Unassigned states implicitly belong to 'low'
    const states = NIGERIAN_STATES.map(s => ({
      ...s,
      cityTier: (stateToTier[s.name] ?? 'low') as CityTier,
    }));

    return { states, stateToTier };
  }

  /**
   * Get all configs grouped by city tier, each enriched with its assigned states.
   * 'low' includes all states not explicitly assigned to high or middle.
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

    const tierStates: Record<string, string[]> = { high: [], middle: [], low: [] };
    const assignedStateNames = new Set<string>();

    for (const row of statesResult.data ?? []) {
      if (!tierStates[row.city_tier]) tierStates[row.city_tier] = [];
      tierStates[row.city_tier].push(row.state_name);
      assignedStateNames.add(row.state_name);
    }

    // All states not in high or middle implicitly fall to low
    for (const name of getStateNames()) {
      if (!assignedStateNames.has(name)) {
        tierStates['low'].push(name);
      }
    }
    tierStates['low'].sort();

    const grouped: Record<string, any> = {
      high:   { configs: [], assignedStates: tierStates.high },
      middle: { configs: [], assignedStates: tierStates.middle },
      low:    { configs: [], assignedStates: tierStates.low },
    };

    for (const row of configsResult.data ?? []) {
      const tier = row.city_tier ?? 'low';
      if (!grouped[tier]) grouped[tier] = { configs: [], assignedStates: [] };
      grouped[tier].configs.push(row);
    }

    return { configs: configsResult.data ?? [], grouped, tierStates };
  }

  /**
   * Get all configs for a specific city tier, plus the states assigned to it.
   * For 'low', includes all states not assigned to high or middle.
   */
  static async getConfigsByCityTier(cityTier: CityTier) {
    const [configsResult, statesResult] = await Promise.all([
      supabase
        .from('ride_fare_config')
        .select('*')
        .eq('city_tier', cityTier)
        .order('vehicle_category', { ascending: true })
        .order('service_tier', { ascending: true }),
      supabase
        .from('city_tier_states')
        .select('city_tier, state_name')
        .order('state_name', { ascending: true }),
    ]);

    if (configsResult.error) throw new Error(`Failed to fetch configs: ${configsResult.error.message}`);
    if (statesResult.error) throw new Error(`Failed to fetch states: ${statesResult.error.message}`);

    let assignedStates: string[];

    if (cityTier === 'low') {
      // low = all states NOT explicitly in high or middle
      const explicitlyHighOrMiddle = new Set(
        (statesResult.data ?? [])
          .filter(r => r.city_tier !== 'low')
          .map(r => r.state_name)
      );
      const explicitLow = (statesResult.data ?? [])
        .filter(r => r.city_tier === 'low')
        .map(r => r.state_name);
      const implicitLow = getStateNames().filter(
        n => !explicitlyHighOrMiddle.has(n) && !explicitLow.includes(n)
      );
      assignedStates = [...new Set([...explicitLow, ...implicitLow])].sort();
    } else {
      assignedStates = (statesResult.data ?? [])
        .filter(r => r.city_tier === cityTier)
        .map(r => r.state_name);
    }

    return { configs: configsResult.data ?? [], assignedStates };
  }

  /**
   * Assign states to a city tier (merge — adds to existing).
   * Automatically removes each state from any other tier it was previously in.
   * Assigning to 'low' just removes them from high/middle (they're implicitly low).
   */
  static async assignStatesToCityTier(
    cityTier: CityTier,
    statesToAdd: string[],
    adminId: string
  ) {
    const invalidStates = statesToAdd.filter(s => !isValidState(s));
    if (invalidStates.length > 0) {
      throw new Error(`Invalid state names: ${invalidStates.join(', ')}`);
    }

    // Remove from any other tier first
    await supabase
      .from('city_tier_states')
      .delete()
      .in('state_name', statesToAdd)
      .neq('city_tier', cityTier);

    if (cityTier === 'low') {
      // Low is implicit — no need to store rows, just removing from high/middle is enough
      logger.info('Admin moved states to low tier (implicit)', { adminId, states: statesToAdd });
      const allLow = await this._computeLowStates();
      return { cityTier, assignedStates: allLow };
    }

    const rows = statesToAdd.map(state_name => ({ city_tier: cityTier, state_name }));
    const { error } = await supabase
      .from('city_tier_states')
      .upsert(rows, { onConflict: 'city_tier,state_name', ignoreDuplicates: true });

    if (error) throw new Error(`Failed to assign states: ${error.message}`);

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
   * Removed states automatically fall back to low.
   */
  static async setStatesForCityTier(
    cityTier: CityTier,
    states: string[],
    adminId: string
  ) {
    const invalidStates = states.filter(s => !isValidState(s));
    if (invalidStates.length > 0) {
      throw new Error(`Invalid state names: ${invalidStates.join(', ')}`);
    }

    if (cityTier === 'low') {
      // Setting low = remove all these states from high/middle so they fall to low
      if (states.length > 0) {
        await supabase
          .from('city_tier_states')
          .delete()
          .in('state_name', states)
          .in('city_tier', ['high', 'middle']);
      }
      logger.info('Admin set states for low tier (implicit)', { adminId, count: states.length });
      return { cityTier, states: await this._computeLowStates() };
    }

    // Clear current assignments for this tier
    await supabase.from('city_tier_states').delete().eq('city_tier', cityTier);

    if (states.length > 0) {
      // Remove these states from any other tier
      await supabase
        .from('city_tier_states')
        .delete()
        .in('state_name', states)
        .neq('city_tier', cityTier);

      const rows = states.map(state_name => ({ city_tier: cityTier, state_name }));
      const { error } = await supabase.from('city_tier_states').insert(rows);
      if (error) throw new Error(`Failed to set states: ${error.message}`);
    }

    logger.info('Admin set states for city tier', { adminId, cityTier, count: states.length });
    return { cityTier, states };
  }

  /**
   * Remove specific states from a city tier.
   * Removed states automatically fall back to low.
   */
  static async removeStatesFromCityTier(
    cityTier: CityTier,
    statesToRemove: string[],
    adminId: string
  ) {
    const invalidStates = statesToRemove.filter(s => !isValidState(s));
    if (invalidStates.length > 0) {
      throw new Error(`Invalid state names: ${invalidStates.join(', ')}`);
    }

    await supabase
      .from('city_tier_states')
      .delete()
      .eq('city_tier', cityTier)
      .in('state_name', statesToRemove);

    const { data: remaining } = await supabase
      .from('city_tier_states')
      .select('state_name')
      .eq('city_tier', cityTier)
      .order('state_name', { ascending: true });

    const remainingStates = (remaining ?? []).map(r => r.state_name);
    logger.info('Admin removed states from city tier — states fall to low', { adminId, cityTier, removed: statesToRemove });
    return {
      cityTier,
      remainingStates,
      removedStates: statesToRemove,
      note: 'Removed states now fall to low tier',
    };
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Compute the full list of states that belong to 'low':
   * all states NOT explicitly assigned to high or middle.
   */
  private static async _computeLowStates(): Promise<string[]> {
    const { data } = await supabase
      .from('city_tier_states')
      .select('state_name')
      .in('city_tier', ['high', 'middle']);

    const assignedElsewhere = new Set((data ?? []).map(r => r.state_name));
    return getStateNames().filter(n => !assignedElsewhere.has(n)).sort();
  }
}
