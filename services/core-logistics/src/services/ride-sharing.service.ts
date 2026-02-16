import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export class RideSharingService {
  /**
   * Generate a shareable link for a ride
   * Link expires 2 hours after ride completion
   */
  async generateShareLink(rideId: string, userId: string): Promise<{
    success: boolean;
    shareToken?: string;
    shareUrl?: string;
    expiresAt?: Date;
    error?: string;
  }> {
    try {
      // Get ride details
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('id, user_id, status, completed_at, share_token, share_token_revoked')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      // Verify ownership
      if (ride.user_id !== userId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Check if ride is in a shareable state
      const shareableStatuses = ['driver_assigned', 'driver_arrived', 'in_progress', 'completed'];
      if (!shareableStatuses.includes(ride.status)) {
        return { success: false, error: 'Ride cannot be shared in current status' };
      }

      // If token exists and not revoked, return existing
      if (ride.share_token && !ride.share_token_revoked) {
        const baseUrl = process.env.FRONTEND_URL || 'https://olakzride.com';
        return {
          success: true,
          shareToken: ride.share_token,
          shareUrl: `${baseUrl}/track/${ride.share_token}`,
        };
      }

      // Generate new token
      const shareToken = uuidv4();
      const now = new Date();
      
      // Calculate expiry: 2 hours after ride completion, or 24 hours from now if not completed
      let expiresAt: Date;
      if (ride.completed_at) {
        expiresAt = new Date(new Date(ride.completed_at).getTime() + 2 * 60 * 60 * 1000);
      } else {
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      }

      // Update ride with share token
      const { error: updateError } = await supabase
        .from('rides')
        .update({
          share_token: shareToken,
          share_token_created_at: now.toISOString(),
          share_token_expires_at: expiresAt.toISOString(),
          share_token_revoked: false,
        })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error generating share token:', updateError);
        return { success: false, error: 'Failed to generate share link' };
      }

      const baseUrl = process.env.FRONTEND_URL || 'https://olakzride.com';
      const shareUrl = `${baseUrl}/track/${shareToken}`;

      logger.info('Share link generated', { rideId, shareToken, expiresAt });

      return {
        success: true,
        shareToken,
        shareUrl,
        expiresAt,
      };
    } catch (error: any) {
      logger.error('Generate share link error:', error);
      return { success: false, error: 'Failed to generate share link' };
    }
  }

  /**
   * Revoke a share link
   */
  async revokeShareLink(rideId: string, userId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Verify ownership
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select('id, user_id')
        .eq('id', rideId)
        .single();

      if (fetchError || !ride) {
        return { success: false, error: 'Ride not found' };
      }

      if (ride.user_id !== userId) {
        return { success: false, error: 'Unauthorized' };
      }

      // Revoke token
      const { error: updateError } = await supabase
        .from('rides')
        .update({ share_token_revoked: true })
        .eq('id', rideId);

      if (updateError) {
        logger.error('Error revoking share token:', updateError);
        return { success: false, error: 'Failed to revoke share link' };
      }

      logger.info('Share link revoked', { rideId });

      return { success: true };
    } catch (error: any) {
      logger.error('Revoke share link error:', error);
      return { success: false, error: 'Failed to revoke share link' };
    }
  }

  /**
   * Get ride details by share token (public endpoint - no auth required)
   */
  async getRideByShareToken(shareToken: string): Promise<{
    success: boolean;
    ride?: any;
    error?: string;
  }> {
    try {
      logger.info('🔍 Looking up ride by share token:', { shareToken });

      // Get ride with driver details
      // Note: Using simpler query to avoid Supabase alias issues
      const { data: ride, error: fetchError } = await supabase
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
          estimated_distance,
          estimated_duration,
          started_at,
          completed_at,
          share_token_expires_at,
          share_token_revoked,
          driver_id
        `)
        .eq('share_token', shareToken)
        .single();

      if (fetchError) {
        logger.error('❌ Error fetching ride by share token:', { 
          error: fetchError,
          shareToken,
          code: fetchError.code,
          message: fetchError.message 
        });
        return { success: false, error: 'Invalid or expired share link' };
      }

      if (!ride) {
        logger.warn('⚠️ No ride found with share token:', { shareToken });
        return { success: false, error: 'Invalid or expired share link' };
      }

      // Fetch driver details separately if driver is assigned
      let driverData = null;
      if (ride.driver_id) {
        logger.info('🔍 Fetching driver details:', { driverId: ride.driver_id });
        
        // Get driver record (has userId, rating, total_rides)
        const { data: driver, error: driverError } = await supabase
          .from('drivers')
          .select(`
            id,
            user_id,
            rating,
            total_rides
          `)
          .eq('id', ride.driver_id)
          .single();

        if (driverError) {
          logger.error('❌ Error fetching driver:', { 
            driverId: ride.driver_id,
            error: driverError 
          });
        } else if (driver) {
          logger.info('✅ Driver found:', { driverId: driver.id, userId: driver.user_id });
          
          // Get user details from auth database (first_name, last_name, phone, photo)
          // Note: This requires cross-database query or API call to auth service
          // For now, we'll use a simplified approach with just driver info
          
          // Fetch driver's vehicle
          const { data: vehicles, error: vehicleError } = await supabase
            .from('driver_vehicles')
            .select('manufacturer, model, year, color, plate_number')
            .eq('driver_id', driver.id)
            .eq('is_active', true)
            .limit(1);

          if (vehicleError) {
            logger.error('❌ Error fetching vehicle:', { 
              driverId: driver.id,
              error: vehicleError 
            });
          } else {
            logger.info('✅ Vehicle query result:', { 
              driverId: driver.id,
              vehicleCount: vehicles?.length || 0 
            });
          }

          driverData = {
            id: driver.id,
            rating: driver.rating ? parseFloat(driver.rating) : null,
            totalRides: driver.total_rides,
            vehicle: vehicles && vehicles.length > 0 ? vehicles : []
          };
        } else {
          logger.warn('⚠️ No driver found with id:', { driverId: ride.driver_id });
        }
      } else {
        logger.info('ℹ️ No driver assigned to ride yet');
      }

      logger.info('✅ Found ride by share token:', { 
        rideId: ride.id, 
        status: ride.status,
        hasDriver: !!driverData,
        revoked: ride.share_token_revoked,
        expiresAt: ride.share_token_expires_at
      });

      // Check if token is revoked
      if (ride.share_token_revoked) {
        return { success: false, error: 'This share link has been revoked' };
      }

      // Check if token is expired
      if (ride.share_token_expires_at && new Date(ride.share_token_expires_at) < new Date()) {
        return { success: false, error: 'This share link has expired' };
      }

      // Format response (hide sensitive data)
      const publicRideData = {
        id: ride.id,
        status: ride.status,
        pickup: {
          latitude: parseFloat(ride.pickup_latitude),
          longitude: parseFloat(ride.pickup_longitude),
          address: ride.pickup_address,
        },
        dropoff: ride.dropoff_latitude ? {
          latitude: parseFloat(ride.dropoff_latitude),
          longitude: parseFloat(ride.dropoff_longitude),
          address: ride.dropoff_address,
        } : null,
        estimatedDistance: ride.estimated_distance ? parseFloat(ride.estimated_distance) : null,
        estimatedDuration: ride.estimated_duration,
        startedAt: ride.started_at,
        completedAt: ride.completed_at,
        driver: driverData ? {
          id: driverData.id,
          rating: driverData.rating,
          totalRides: driverData.totalRides,
          vehicle: driverData.vehicle && driverData.vehicle.length > 0 ? {
            manufacturer: driverData.vehicle[0].manufacturer,
            model: driverData.vehicle[0].model,
            year: driverData.vehicle[0].year,
            color: driverData.vehicle[0].color,
            plateNumber: driverData.vehicle[0].plate_number,
          } : null,
        } : null,
      };

      return {
        success: true,
        ride: publicRideData,
      };
    } catch (error: any) {
      logger.error('Get ride by share token error:', error);
      return { success: false, error: 'Failed to fetch ride details' };
    }
  }

  /**
   * Generate WhatsApp share message
   */
  generateWhatsAppShareLink(shareUrl: string, rideDetails?: {
    pickupAddress: string;
    dropoffAddress?: string;
  }): string {
    const message = rideDetails
      ? `🚗 I'm on my way!\n\nFrom: ${rideDetails.pickupAddress}\n${rideDetails.dropoffAddress ? `To: ${rideDetails.dropoffAddress}\n` : ''}\nTrack my ride: ${shareUrl}`
      : `🚗 Track my ride: ${shareUrl}`;

    // WhatsApp share link format
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
}
