import { supabase } from '../config/database';
import { logger } from '../utils/logger';

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

export class PricingAdminService {
  /**
   * Get all fare configs grouped by vehicle category.
   */
  static async getAllConfigs() {
    const { data, error } = await supabase
      .from('ride_fare_config')
      .select('*')
      .order('vehicle_category', { ascending: true })
      .order('service_tier', { ascending: true });

    if (error) throw new Error(`Failed to fetch pricing configs: ${error.message}`);

    // Group by vehicle_category for a cleaner response
    const grouped: Record<string, any[]> = {};
    for (const row of data ?? []) {
      if (!grouped[row.vehicle_category]) grouped[row.vehicle_category] = [];
      grouped[row.vehicle_category].push(row);
    }

    return { configs: data ?? [], grouped };
  }

  /**
   * Get all configs for a specific vehicle category (e.g. all car tiers).
   */
  static async getConfigsByCategory(vehicleCategory: string) {
    const { data, error } = await supabase
      .from('ride_fare_config')
      .select('*')
      .eq('vehicle_category', vehicleCategory)
      .order('service_tier', { ascending: true });

    if (error) throw new Error(`Failed to fetch configs for ${vehicleCategory}: ${error.message}`);
    return data ?? [];
  }

  /**
   * Get a single config by vehicle category + service tier.
   */
  static async getConfig(vehicleCategory: string, serviceTier: string) {
    const { data, error } = await supabase
      .from('ride_fare_config')
      .select('*')
      .eq('vehicle_category', vehicleCategory)
      .eq('service_tier', serviceTier)
      .single();

    if (error || !data) return null;
    return data;
  }

  /**
   * Update a fare config. Only the fields provided are updated.
   * Admin can update any pricing field independently.
   */
  static async updateConfig(
    vehicleCategory: string,
    serviceTier: string,
    updates: RideFareConfigUpdate,
    adminId: string
  ) {
    // Validate numeric fields are non-negative
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

    // Validate percent fields don't exceed 100
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

    const { data, error } = await supabase
      .from('ride_fare_config')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('vehicle_category', vehicleCategory)
      .eq('service_tier', serviceTier)
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to update config: ${error?.message ?? 'Config not found'}`);

    logger.info('Admin updated ride fare config', {
      adminId,
      vehicleCategory,
      serviceTier,
      updates,
    });

    return data;
  }
}
