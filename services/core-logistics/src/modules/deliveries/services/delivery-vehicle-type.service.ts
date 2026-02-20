import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';

export interface DeliveryVehicleType {
  id: string;
  name: string;
  displayName: string;
  description: string;
  capacity: number;
  iconUrl: string;
  baseFare: number;
  pricePerKm: number;
  minimumFare: number;
  currencyCode: string;
}

/**
 * DeliveryVehicleTypeService
 * Manages vehicle types available for delivery service
 */
export class DeliveryVehicleTypeService {
  /**
   * Get all vehicle types available for delivery in a region
   */
  static async getAvailableVehicleTypes(regionId: string): Promise<DeliveryVehicleType[]> {
    try {
      // Get vehicle types with delivery fare configuration
      const { data: fareConfigs, error } = await supabase
        .from('delivery_fare_config')
        .select(`
          vehicle_type_id,
          base_fare,
          price_per_km,
          minimum_fare,
          currency_code,
          vehicle_type:vehicle_types(
            id,
            name,
            display_name,
            description,
            capacity,
            icon_url
          )
        `)
        .eq('region_id', regionId)
        .eq('is_active', true);

      if (error) {
        logger.error('Error fetching delivery vehicle types:', error);
        throw new Error('Failed to fetch delivery vehicle types');
      }

      if (!fareConfigs || fareConfigs.length === 0) {
        logger.warn(`No delivery vehicle types configured for region ${regionId}`);
        return [];
      }

      // Transform to DeliveryVehicleType format
      const vehicleTypes: DeliveryVehicleType[] = fareConfigs.map((config: any) => ({
        id: config.vehicle_type.id,
        name: config.vehicle_type.name,
        displayName: config.vehicle_type.display_name,
        description: config.vehicle_type.description,
        capacity: config.vehicle_type.capacity,
        iconUrl: config.vehicle_type.icon_url,
        baseFare: parseFloat(config.base_fare),
        pricePerKm: parseFloat(config.price_per_km),
        minimumFare: parseFloat(config.minimum_fare),
        currencyCode: config.currency_code,
      }));

      logger.info(`Found ${vehicleTypes.length} delivery vehicle types for region ${regionId}`);
      return vehicleTypes;
    } catch (error) {
      logger.error('Get available vehicle types error:', error);
      throw error;
    }
  }

  /**
   * Check if a vehicle type is available for delivery
   */
  static async isVehicleTypeAvailable(vehicleTypeId: string, regionId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('delivery_fare_config')
        .select('id')
        .eq('vehicle_type_id', vehicleTypeId)
        .eq('region_id', regionId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        logger.error('Error checking vehicle type availability:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      logger.error('Is vehicle type available error:', error);
      return false;
    }
  }

  /**
   * Get vehicle type details by ID
   */
  static async getVehicleTypeById(vehicleTypeId: string, regionId: string): Promise<DeliveryVehicleType | null> {
    try {
      const { data, error } = await supabase
        .from('delivery_fare_config')
        .select(`
          vehicle_type_id,
          base_fare,
          price_per_km,
          minimum_fare,
          currency_code,
          vehicle_type:vehicle_types!vehicle_type_id(
            id,
            name,
            display_name,
            description,
            capacity,
            icon_url
          )
        `)
        .eq('vehicle_type_id', vehicleTypeId)
        .eq('region_id', regionId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return null;
      }

      // Type assertion since Supabase returns vehicle_type as object
      const vehicleType = data.vehicle_type as any;

      return {
        id: vehicleType.id,
        name: vehicleType.name,
        displayName: vehicleType.display_name,
        description: vehicleType.description,
        capacity: vehicleType.capacity,
        iconUrl: vehicleType.icon_url,
        baseFare: parseFloat(data.base_fare),
        pricePerKm: parseFloat(data.price_per_km),
        minimumFare: parseFloat(data.minimum_fare),
        currencyCode: data.currency_code,
      };
    } catch (error) {
      logger.error('Get vehicle type by ID error:', error);
      return null;
    }
  }
}
