import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { MapsUtil } from '../../../utils/maps.util';

interface FareCalculationParams {
  vehicleTypeId: string;
  regionId: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffLatitude: number;
  dropoffLongitude: number;
  deliveryType: 'instant' | 'scheduled';
}

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  scheduledSurcharge: number;
  totalFare: number;
  minimumFare: number;
  finalFare: number;
  distance: number;
  distanceText: string;
  currencyCode: string;
}

/**
 * DeliveryFareService
 * Calculates delivery fares based on distance, vehicle type, and delivery type
 */
export class DeliveryFareService {
  /**
   * Get fare configuration for a vehicle type and region
   */
  private static async getFareConfig(vehicleTypeId: string, regionId: string) {
    const { data, error } = await supabase
      .from('delivery_fare_config')
      .select('*')
      .eq('vehicle_type_id', vehicleTypeId)
      .eq('region_id', regionId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logger.error(`Error fetching fare config:`, error);
      throw new Error('Failed to fetch fare configuration');
    }

    if (!data) {
      logger.error(`No fare config found for vehicle ${vehicleTypeId} in region ${regionId}`);
      throw new Error('Fare configuration not found for this vehicle type and region');
    }

    return data;
  }

  /**
   * Calculate delivery fare
   */
  public static async calculateFare(params: FareCalculationParams): Promise<FareBreakdown> {
    try {
      // Get fare configuration
      const fareConfig = await this.getFareConfig(params.vehicleTypeId, params.regionId);

      // Calculate distance using Maps utility
      const routeInfo = await MapsUtil.getDirections(
        {
          latitude: params.pickupLatitude,
          longitude: params.pickupLongitude,
        },
        {
          latitude: params.dropoffLatitude,
          longitude: params.dropoffLongitude,
        }
      );

      const distanceKm = routeInfo.distance;

      // Calculate fare components
      const baseFare = parseFloat(fareConfig.base_fare);
      const pricePerKm = parseFloat(fareConfig.price_per_km);
      const minimumFare = parseFloat(fareConfig.minimum_fare);
      const scheduledSurcharge =
        params.deliveryType === 'scheduled'
          ? parseFloat(fareConfig.scheduled_delivery_surcharge || '0')
          : 0;

      // Calculate distance fare
      const distanceFare = distanceKm * pricePerKm;

      // Calculate total before minimum fare check
      const totalFare = baseFare + distanceFare + scheduledSurcharge;

      // Apply minimum fare
      const finalFare = Math.max(totalFare, minimumFare);

      logger.info(`Fare calculated: ${finalFare} ${fareConfig.currency_code} for ${distanceKm}km`);

      return {
        baseFare,
        distanceFare,
        scheduledSurcharge,
        totalFare,
        minimumFare,
        finalFare,
        distance: distanceKm,
        distanceText: routeInfo.distanceText,
        currencyCode: fareConfig.currency_code,
      };
    } catch (error) {
      logger.error(`Error calculating fare:`, error);
      throw error;
    }
  }

  /**
   * Get fare estimate (without creating delivery)
   */
  public static async estimateFare(
    vehicleTypeId: string,
    regionId: string,
    pickupLatitude: number,
    pickupLongitude: number,
    dropoffLatitude: number,
    dropoffLongitude: number,
    deliveryType: 'instant' | 'scheduled' = 'instant'
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

  /**
   * Get all fare configurations for a region
   */
  public static async getFareConfigsByRegion(regionId: string) {
    const { data, error } = await supabase
      .from('delivery_fare_config')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name, display_name, icon_url)
      `)
      .eq('region_id', regionId)
      .eq('is_active', true);

    if (error) {
      logger.error(`Error fetching fare configs for region:`, error);
      throw new Error('Failed to fetch fare configurations');
    }

    return data || [];
  }

  /**
   * Update fare configuration (admin only)
   */
  public static async updateFareConfig(
    vehicleTypeId: string,
    regionId: string,
    updates: {
      baseFare?: number;
      pricePerKm?: number;
      minimumFare?: number;
      scheduledDeliverySurcharge?: number;
      peakHourMultiplier?: number;
    }
  ) {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.baseFare !== undefined) updateData.base_fare = updates.baseFare;
    if (updates.pricePerKm !== undefined) updateData.price_per_km = updates.pricePerKm;
    if (updates.minimumFare !== undefined) updateData.minimum_fare = updates.minimumFare;
    if (updates.scheduledDeliverySurcharge !== undefined)
      updateData.scheduled_delivery_surcharge = updates.scheduledDeliverySurcharge;
    if (updates.peakHourMultiplier !== undefined)
      updateData.peak_hour_multiplier = updates.peakHourMultiplier;

    const { data, error } = await supabase
      .from('delivery_fare_config')
      .update(updateData)
      .eq('vehicle_type_id', vehicleTypeId)
      .eq('region_id', regionId)
      .select()
      .single();

    if (error) {
      logger.error(`Error updating fare config:`, error);
      throw new Error('Failed to update fare configuration');
    }

    logger.info(`Fare config updated for vehicle ${vehicleTypeId} in region ${regionId}`);
    return data;
  }

  /**
   * Create new fare configuration (admin only)
   */
  public static async createFareConfig(config: {
    vehicleTypeId: string;
    regionId: string;
    baseFare: number;
    pricePerKm: number;
    minimumFare: number;
    scheduledDeliverySurcharge?: number;
    currencyCode?: string;
  }) {
    const { data, error } = await supabase
      .from('delivery_fare_config')
      .insert({
        vehicle_type_id: config.vehicleTypeId,
        region_id: config.regionId,
        base_fare: config.baseFare,
        price_per_km: config.pricePerKm,
        minimum_fare: config.minimumFare,
        scheduled_delivery_surcharge: config.scheduledDeliverySurcharge || 0,
        currency_code: config.currencyCode || 'NGN',
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      logger.error(`Error creating fare config:`, error);
      throw new Error('Failed to create fare configuration');
    }

    logger.info(`Fare config created for vehicle ${config.vehicleTypeId} in region ${config.regionId}`);
    return data;
  }
}
