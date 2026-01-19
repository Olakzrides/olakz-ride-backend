import { supabase } from '../config/database';
import { MapsUtil } from '../utils/maps.util';
import { FareCalculation, Location, VariantWithPrice } from '../types';
import { logger } from '../config/logger';

export class FareService {
  /**
   * Calculate prices for all variants
   */
  async calculateVariantPrices(
    variants: any[],
    pickupLocation: Location,
    dropoffLocation: Location | null,
    currencyCode: string = 'NGN'
  ): Promise<VariantWithPrice[]> {
    try {
      // If no dropoff, return base fares (minimum fare)
      if (!dropoffLocation) {
        return variants.map((variant) => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          product_id: variant.product_id,
          calculated_price: {
            calculated_amount: Math.round(parseFloat(variant.minimum_fare) * 100),
            currency_code: currencyCode,
          },
          metadata: {
            ...variant.metadata,
            estimatedWaitTime: variant.metadata?.estimatedWaitTime,
            description: variant.metadata?.description,
          },
        }));
      }

      // Get route information
      const routeInfo = await MapsUtil.getDirections(
        { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
        { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude }
      );

      // Calculate fare for each variant
      const variantsWithPrices = variants.map((variant) => {
        const fare = this.calculateFareForVariant(
          variant,
          routeInfo.distance,
          routeInfo.duration
        );

        return {
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          product_id: variant.product_id,
          calculated_price: {
            calculated_amount: Math.round(fare * 100),
            currency_code: currencyCode,
          },
          metadata: {
            ...variant.metadata,
            distance_km: routeInfo.distance,
            duration_minutes: routeInfo.duration,
            fare_breakdown: {
              base_fare: parseFloat(variant.base_price),
              distance_fare: parseFloat(variant.price_per_km) * routeInfo.distance,
              time_fare: parseFloat(variant.price_per_minute) * routeInfo.duration,
              minimum_fare: parseFloat(variant.minimum_fare),
            },
          },
        };
      });

      return variantsWithPrices;
    } catch (error) {
      logger.error('Calculate variant prices error:', error);
      throw error;
    }
  }

  /**
   * Calculate final fare for a specific variant
   */
  async calculateFinalFare(params: {
    variantId: string;
    pickupLocation: Location;
    dropoffLocation: Location;
    currencyCode: string;
  }): Promise<FareCalculation> {
    try {
      const { variantId, pickupLocation, dropoffLocation } = params;

      // Get variant details
      const { data: variant, error } = await supabase
        .from('ride_variants')
        .select('*')
        .eq('id', variantId)
        .single();

      if (error || !variant) {
        throw new Error('Variant not found');
      }

      // Get route information
      const routeInfo = await MapsUtil.getDirections(
        { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude },
        { latitude: dropoffLocation.latitude, longitude: dropoffLocation.longitude }
      );

      // Calculate fare components
      const baseFare = parseFloat(variant.base_price);
      const distanceFare = parseFloat(variant.price_per_km) * routeInfo.distance;
      const timeFare = parseFloat(variant.price_per_minute) * routeInfo.duration;

      let totalBeforeSurge = baseFare + distanceFare + timeFare;

      // Apply minimum fare
      const minimumFare = parseFloat(variant.minimum_fare);
      if (totalBeforeSurge < minimumFare) {
        totalBeforeSurge = minimumFare;
      }

      const totalFare = Math.round(totalBeforeSurge);

      return {
        totalFare,
        distance: routeInfo.distance,
        duration: routeInfo.duration,
        distanceText: routeInfo.distanceText,
        durationText: routeInfo.durationText,
        fareBreakdown: {
          baseFare,
          distanceFare,
          timeFare,
          totalBeforeSurge,
        },
      };
    } catch (error) {
      logger.error('Calculate final fare error:', error);
      throw error;
    }
  }

  /**
   * Calculate fare for a single variant
   */
  private calculateFareForVariant(
    variant: any,
    distance: number,
    duration: number
  ): number {
    const baseFare = parseFloat(variant.base_price);
    const distanceFare = parseFloat(variant.price_per_km) * distance;
    const timeFare = parseFloat(variant.price_per_minute) * duration;

    let totalFare = baseFare + distanceFare + timeFare;

    // Apply minimum fare
    const minimumFare = parseFloat(variant.minimum_fare);
    if (totalFare < minimumFare) {
      totalFare = minimumFare;
    }

    return totalFare;
  }
}
