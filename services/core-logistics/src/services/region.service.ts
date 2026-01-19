import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { config } from '../config/env';

export class RegionService {
  /**
   * Get region by location
   * Phase 1: Returns default region
   * Phase 3: Will implement geospatial lookup
   */
  async getRegionByLocation(_latitude: number, _longitude: number): Promise<any> {
    try {
      // Phase 1: Return default region
      const { data, error } = await supabase
        .from('regions')
        .select('*')
        .eq('id', config.defaults.regionId)
        .eq('is_active', true)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get region by location error:', error);
      throw error;
    }
  }

  /**
   * Get all active regions
   */
  async getActiveRegions(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('regions')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Get active regions error:', error);
      throw error;
    }
  }

  /**
   * Get region by ID
   */
  async getRegionById(regionId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('regions')
        .select('*')
        .eq('id', regionId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get region by ID error:', error);
      throw error;
    }
  }
}
