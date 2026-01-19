import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { Location } from '../types';
import { RideMatchingService } from './ride-matching.service';

export class RideService {
  private rideMatchingService?: RideMatchingService;

  /**
   * Set ride matching service (injected after initialization)
   */
  setRideMatchingService(rideMatchingService: RideMatchingService): void {
    this.rideMatchingService = rideMatchingService;
  }
  /**
   * Create a new ride with real-time driver matching
   */
  async createRide(data: {
    cart_id?: string;
    user_id: string;
    variant_id: string;
    pickup_location: Location;
    dropoff_location: Location;
    estimated_distance: number;
    estimated_duration: number;
    estimated_fare: number;
    payment_method: string;
    scheduled_at?: Date | null;
    metadata?: any;
  }): Promise<any> {
    try {
      // Create the ride record
      const { data: ride, error } = await supabase
        .from('rides')
        .insert({
          cart_id: data.cart_id,
          user_id: data.user_id,
          variant_id: data.variant_id,
          pickup_latitude: data.pickup_location.latitude,
          pickup_longitude: data.pickup_location.longitude,
          pickup_address: data.pickup_location.address,
          dropoff_latitude: data.dropoff_location.latitude,
          dropoff_longitude: data.dropoff_location.longitude,
          dropoff_address: data.dropoff_location.address,
          estimated_distance: data.estimated_distance,
          estimated_duration: data.estimated_duration,
          estimated_fare: data.estimated_fare,
          payment_method: data.payment_method,
          payment_status: 'pending',
          status: 'searching',
          scheduled_at: data.scheduled_at,
          metadata: data.metadata || {},
        })
        .select()
        .single();

      if (error) throw error;

      // Get vehicle type for driver matching
      const { data: variant } = await supabase
        .from('ride_variants')
        .select('vehicle_type_id')
        .eq('id', data.variant_id)
        .single();

      if (variant && this.rideMatchingService) {
        // Start real-time driver matching
        logger.info(`Starting driver matching for ride: ${ride.id}`);
        
        const matchingResult = await this.rideMatchingService.findAndNotifyDriversForRide(
          ride.id,
          {
            pickupLatitude: data.pickup_location.latitude,
            pickupLongitude: data.pickup_location.longitude,
            vehicleTypeId: variant.vehicle_type_id,
            maxDistance: 15, // 15km radius
            maxDrivers: 5, // Max 5 drivers per batch
          }
        );

        logger.info(`Driver matching result for ride ${ride.id}:`, matchingResult);
      }

      return ride;
    } catch (error) {
      logger.error('Create ride error:', error);
      throw error;
    }
  }

  /**
   * Get ride by ID
   */
  async getRide(rideId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('rides')
        .select('*, variant:ride_variants(*)')
        .eq('id', rideId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get ride error:', error);
      throw error;
    }
  }

  /**
   * Update ride status
   */
  async updateRideStatus(
    rideId: string,
    status: string,
    additionalData?: any
  ): Promise<any> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
        ...additionalData,
      };

      const { data, error } = await supabase
        .from('rides')
        .update(updateData)
        .eq('id', rideId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Update ride status error:', error);
      throw error;
    }
  }

  /**
   * Cancel ride
   */
  async cancelRide(rideId: string, reason: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('rides')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Cancel ride error:', error);
      throw error;
    }
  }

  /**
   * Get user's recent rides
   */
  async getUserRecentRides(userId: string, limit: number = 5): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('rides')
        .select('*, variant:ride_variants(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Get user recent rides error:', error);
      throw error;
    }
  }

  /**
   * Get user's ride history with pagination
   */
  async getUserRideHistory(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ rides: any[]; total: number }> {
    try {
      const offset = (page - 1) * limit;

      // Get total count
      const { count } = await supabase
        .from('rides')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Get rides
      const { data, error } = await supabase
        .from('rides')
        .select('*, variant:ride_variants(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        rides: data || [],
        total: count || 0,
      };
    } catch (error) {
      logger.error('Get user ride history error:', error);
      throw error;
    }
  }

  /**
   * Complete ride
   */
  async completeRide(rideId: string, finalFare: number): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('rides')
        .update({
          status: 'completed',
          final_fare: finalFare,
          completed_at: new Date().toISOString(),
          payment_status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Complete ride error:', error);
      throw error;
    }
  }

  /**
   * Rate driver
   */
  async rateDriver(
    rideId: string,
    rating: number,
    feedback?: string
  ): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('rides')
        .update({
          driver_rating: rating,
          driver_feedback: feedback,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Rate driver error:', error);
      throw error;
    }
  }
}
