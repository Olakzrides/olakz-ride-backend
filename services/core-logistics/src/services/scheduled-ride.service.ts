import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { RideMatchingService } from './ride-matching.service';

/**
 * Service for managing scheduled rides
 * Runs a cron job every minute to activate scheduled rides
 */
export class ScheduledRideService {
  private rideMatchingService?: RideMatchingService;
  private cronInterval?: NodeJS.Timeout;
  private readonly CHECK_INTERVAL_MS = 60000; // 1 minute

  constructor() {
    // Cron job will be started after ride matching service is injected
  }

  /**
   * Set ride matching service (injected after initialization)
   */
  setRideMatchingService(rideMatchingService: RideMatchingService): void {
    this.rideMatchingService = rideMatchingService;
    logger.info('✅ Ride matching service set in ScheduledRideService');
  }

  /**
   * Start the cron job to check for scheduled rides
   */
  startCronJob(): void {
    if (this.cronInterval) {
      logger.warn('Scheduled ride cron job already running');
      return;
    }

    logger.info('🕐 Starting scheduled ride cron job (runs every minute)');

    // Run immediately on start
    this.checkAndActivateScheduledRides();

    // Then run every minute
    this.cronInterval = setInterval(() => {
      this.checkAndActivateScheduledRides();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the cron job
   */
  stopCronJob(): void {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.cronInterval = undefined;
      logger.info('🛑 Scheduled ride cron job stopped');
    }
  }

  /**
   * Check for scheduled rides that need to be activated
   */
  private async checkAndActivateScheduledRides(): Promise<void> {
    try {
      const now = new Date();
      
      // Find scheduled rides that should be activated now
      const { data: scheduledRides, error } = await supabase
        .from('rides')
        .select(`
          id,
          user_id,
          variant_id,
          pickup_latitude,
          pickup_longitude,
          scheduled_at,
          booking_type,
          recipient_name
        `)
        .eq('status', 'scheduled')
        .lte('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) {
        logger.error('Error fetching scheduled rides:', error);
        return;
      }

      if (!scheduledRides || scheduledRides.length === 0) {
        return; // No rides to activate
      }

      logger.info(`📅 Found ${scheduledRides.length} scheduled ride(s) to activate`);

      // Activate each ride
      for (const ride of scheduledRides) {
        await this.activateScheduledRide(ride);
      }
    } catch (error) {
      logger.error('Error in checkAndActivateScheduledRides:', error);
    }
  }

  /**
   * Activate a scheduled ride
   */
  private async activateScheduledRide(ride: any): Promise<void> {
    try {
      logger.info(`🚀 Activating scheduled ride: ${ride.id}`, {
        scheduledAt: ride.scheduled_at,
        bookingType: ride.booking_type,
      });

      // Update ride status to searching
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          status: 'searching',
          updated_at: new Date().toISOString(),
        })
        .eq('id', ride.id);

      if (updateError) {
        logger.error(`Failed to update ride status for ${ride.id}:`, updateError);
        return;
      }

      // Start driver matching if service is available
      if (!this.rideMatchingService) {
        logger.error('❌ Ride matching service not available for scheduled ride:', ride.id);
        return;
      }

      // Get variant details for driver matching
      const { data: variant, error: variantError } = await supabase
        .from('ride_variants')
        .select('vehicle_type_id')
        .eq('id', ride.variant_id)
        .single();

      if (variantError || !variant) {
        logger.error(`Failed to get variant for ride ${ride.id}:`, variantError);
        return;
      }

      // Start driver matching
      const matchingResult = await this.rideMatchingService.findAndNotifyDriversForRide(ride.id, {
        pickupLatitude: parseFloat(ride.pickup_latitude),
        pickupLongitude: parseFloat(ride.pickup_longitude),
        serviceTierId: variant.vehicle_type_id,
        maxDistance: 15,
        maxDrivers: 5,
      });

      logger.info(`✅ Scheduled ride ${ride.id} activated:`, {
        success: matchingResult.success,
        driversNotified: matchingResult.driversNotified,
        batchNumber: matchingResult.batchNumber,
      });

      // TODO: Send push notification to user
      // await this.notifyUserRideActivated(ride.user_id, ride.id);
    } catch (error) {
      logger.error(`Error activating scheduled ride ${ride.id}:`, error);
    }
  }

  /**
   * Validate scheduled time
   */
  static validateScheduledTime(scheduledAt: Date): { valid: boolean; error?: string } {
    const now = new Date();
    const minTime = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
    const maxTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

    if (scheduledAt < minTime) {
      return {
        valid: false,
        error: 'Scheduled time must be at least 30 minutes in the future',
      };
    }

    if (scheduledAt > maxTime) {
      return {
        valid: false,
        error: 'Scheduled time cannot be more than 7 days in the future',
      };
    }

    return { valid: true };
  }

  /**
   * Get user's scheduled rides
   */
  async getUserScheduledRides(userId: string): Promise<any[]> {
    try {
      const { data: rides, error } = await supabase
        .from('rides')
        .select(`
          id,
          status,
          pickup_latitude,
          pickup_longitude,
          pickup_address,
          dropoff_latitude,
          dropoff_longitude,
          dropoff_address,
          estimated_fare,
          scheduled_at,
          booking_type,
          recipient_name,
          recipient_phone,
          created_at,
          variant:ride_variants(
            id,
            title,
            vehicle_type:vehicle_types(
              name,
              display_name
            )
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'scheduled')
        .order('scheduled_at', { ascending: true });

      if (error) {
        logger.error('Error fetching user scheduled rides:', error);
        return [];
      }

      return rides || [];
    } catch (error) {
      logger.error('Error in getUserScheduledRides:', error);
      return [];
    }
  }

  /**
   * Cancel a scheduled ride
   */
  async cancelScheduledRide(rideId: string, userId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify ride ownership and status
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('id, user_id, status, estimated_fare')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      if (ride.user_id !== userId) {
        return { success: false, error: 'Unauthorized' };
      }

      if (ride.status !== 'scheduled') {
        return { success: false, error: 'Only scheduled rides can be cancelled this way' };
      }

      // Update ride status
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || 'Cancelled by user',
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error cancelling scheduled ride:', updateError);
        return { success: false, error: 'Failed to cancel ride' };
      }

      // Release payment hold
      const { error: releaseError } = await supabase
        .from('wallet_transactions')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('ride_id', rideId)
        .eq('transaction_type', 'hold')
        .eq('status', 'hold');

      if (releaseError) {
        logger.error('Error releasing payment hold:', releaseError);
      }

      logger.info(`Scheduled ride ${rideId} cancelled successfully`);
      return { success: true };
    } catch (error) {
      logger.error('Error in cancelScheduledRide:', error);
      return { success: false, error: 'Failed to cancel ride' };
    }
  }
}
