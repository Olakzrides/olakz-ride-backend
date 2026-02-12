import { supabase } from '../config/database';
import { logger } from '../config/logger';

interface RatingInput {
  stars: number; // 1-5
  feedback?: string;
}

export class RatingService {
  /**
   * Driver rates passenger
   */
  async ratePassenger(
    driverId: string,
    rideId: string,
    rating: RatingInput
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Validate rating
      if (rating.stars < 1 || rating.stars > 5) {
        return {
          success: false,
          error: 'Rating must be between 1 and 5 stars',
        };
      }

      // Get ride details
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('status, driver_id, user_id')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      // Validate ride is completed
      if (ride.status !== 'completed') {
        return {
          success: false,
          error: 'RIDE_NOT_COMPLETED',
        };
      }

      // Validate driver is authorized
      if (ride.driver_id !== driverId) {
        return {
          success: false,
          error: 'UNAUTHORIZED',
        };
      }

      // Update ride with passenger rating
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          passenger_rating: rating.stars,
          passenger_feedback: rating.feedback || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error rating passenger:', updateError);
        return { success: false, error: 'Failed to submit rating' };
      }

      logger.info(`Driver ${driverId} rated passenger for ride ${rideId}: ${rating.stars} stars`);

      return { success: true };
    } catch (error: any) {
      logger.error('Rate passenger error:', error);
      return { success: false, error: 'Failed to submit rating' };
    }
  }

  /**
   * Passenger rates driver
   */
  async rateDriver(
    userId: string,
    rideId: string,
    rating: RatingInput
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Validate rating
      if (rating.stars < 1 || rating.stars > 5) {
        return {
          success: false,
          error: 'Rating must be between 1 and 5 stars',
        };
      }

      // Get ride details
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('status, driver_id, user_id')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      // Validate ride is completed
      if (ride.status !== 'completed') {
        return {
          success: false,
          error: 'RIDE_NOT_COMPLETED',
        };
      }

      // Validate passenger is authorized
      if (ride.user_id !== userId) {
        return {
          success: false,
          error: 'UNAUTHORIZED',
        };
      }

      // Update ride with driver rating
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          driver_rating: rating.stars,
          driver_feedback: rating.feedback || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error rating driver:', updateError);
        return { success: false, error: 'Failed to submit rating' };
      }

      // Recalculate driver's average rating
      await this.recalculateDriverRating(ride.driver_id);

      logger.info(`Passenger ${userId} rated driver ${ride.driver_id} for ride ${rideId}: ${rating.stars} stars`);

      return { success: true };
    } catch (error: any) {
      logger.error('Rate driver error:', error);
      return { success: false, error: 'Failed to submit rating' };
    }
  }

  /**
   * Recalculate driver's average rating
   */
  private async recalculateDriverRating(driverId: string): Promise<void> {
    try {
      // Get all completed rides with driver ratings
      const { data: rides, error } = await supabase
        .from('rides')
        .select('driver_rating')
        .eq('driver_id', driverId)
        .eq('status', 'completed')
        .not('driver_rating', 'is', null);

      if (error || !rides || rides.length === 0) {
        return;
      }

      // Calculate average
      const totalRating = rides.reduce((sum, ride) => sum + (ride.driver_rating || 0), 0);
      const averageRating = totalRating / rides.length;

      // Update driver's rating
      await supabase
        .from('drivers')
        .update({
          rating: averageRating.toFixed(2),
          updated_at: new Date().toISOString(),
        })
        .eq('id', driverId);

      logger.info(`Driver ${driverId} rating recalculated: ${averageRating.toFixed(2)} (${rides.length} ratings)`);
    } catch (error: any) {
      logger.error('Recalculate driver rating error:', error);
    }
  }

  /**
   * Get driver's rating summary
   */
  async getDriverRating(driverId: string): Promise<{
    averageRating: number;
    totalRatings: number;
  }> {
    try {
      // Get driver's current rating
      const { data: driver } = await supabase
        .from('drivers')
        .select('rating')
        .eq('id', driverId)
        .single();

      // Get total number of ratings
      const { count } = await supabase
        .from('rides')
        .select('driver_rating', { count: 'exact', head: true })
        .eq('driver_id', driverId)
        .eq('status', 'completed')
        .not('driver_rating', 'is', null);

      return {
        averageRating: driver ? parseFloat(driver.rating) : 0,
        totalRatings: count || 0,
      };
    } catch (error: any) {
      logger.error('Get driver rating error:', error);
      return {
        averageRating: 0,
        totalRatings: 0,
      };
    }
  }
}
