import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';
import { FareService } from './fare.service';
import { PushNotificationService } from './push-notification.service';

// Resolve vehicle category from vehicle type name (mirrors fare.service.ts logic)
function resolveVehicleCategory(vehicleTypeName: string): string {
  const name = (vehicleTypeName ?? '').toLowerCase();
  if (name.includes('bicycle') || name.includes('bike')) return 'bicycle';
  if (name.includes('motorcycle') || name.includes('moto') || name.includes('okada')) return 'motorcycle';
  if (name.includes('bus') || name.includes('minibus')) return 'bus';
  if (name.includes('truck') || name.includes('lorry')) return 'truck';
  return 'car';
}

function resolveServiceTier(variantTitle: string, vehicleCategory: string): string {
  if (vehicleCategory !== 'car') return 'default';
  const title = (variantTitle ?? '').toLowerCase();
  if (title.includes('premium')) return 'premium';
  if (title.includes('vip')) return 'vip';
  return 'standard';
}

export class RideSharingService {
  private fareService  = new FareService();
  private pushService  = PushNotificationService.getInstance();

  /**
   * Generate a shareable link for a ride.
   * The FIRST time a link is generated, the fare is split between the ride
   * owner and the second party using shared_discount_percent from ride_fare_config.
   * Subsequent calls return the existing token without recalculating.
   */
  async generateShareLink(rideId: string, userId: string): Promise<{
    success: boolean;
    shareToken?: string;
    shareUrl?: string;
    expiresAt?: Date;
    fare_split?: {
      total_fare: number;
      owner_share: number;
      second_party_share: number;
      split_percent: number;
      distance_km: number;
      split_applied: boolean;
      no_split_reason?: string;
    };
    error?: string;
  }> {
    try {
      // Get ride details — include everything needed for split calculation
      const { data: ride, error: fetchError } = await supabase
        .from('rides')
        .select(`
          id, user_id, status, completed_at,
          share_token, share_token_revoked,
          share_discount_applied,
          estimated_fare, estimated_distance,
          variant_id, driver_id,
          variant:ride_variants(
            title,
            vehicle_type:vehicle_types(name)
          )
        `)
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

      // ── Calculate fare split ──────────────────────────────────────────────
      const totalFare    = Number(ride.estimated_fare ?? 0);
      const distanceKm   = Number(ride.estimated_distance ?? 0);
      let fare_split: NonNullable<Awaited<ReturnType<typeof this.generateShareLink>>['fare_split']>;

      if ((ride as any).share_discount_applied) {
        // Already split — recalculate display values from stored shared_discount
        const { data: rideWithDiscount } = await supabase
          .from('rides')
          .select('shared_discount, estimated_fare')
          .eq('id', rideId)
          .single();

        const ownerShare       = Number((rideWithDiscount as any)?.shared_discount ?? 0);
        const secondPartyShare = totalFare - ownerShare;
        const splitPercent     = totalFare > 0 ? Math.round((ownerShare / totalFare) * 100) : 0;

        fare_split = {
          total_fare: totalFare,
          owner_share: ownerShare,
          second_party_share: secondPartyShare,
          split_percent: splitPercent,
          distance_km: distanceKm,
          split_applied: true,
        };
      } else if (distanceKm > 3 && ride.status !== 'completed') {
        // First time sharing — calculate the split
        const variantData  = ride.variant as any;
        const vehicleName  = variantData?.vehicle_type?.name ?? '';
        const variantTitle = variantData?.title ?? '';
        const category     = resolveVehicleCategory(vehicleName);
        const tier         = resolveServiceTier(variantTitle, category);
        const config       = await this.fareService.getFareConfig(category, tier);

        const splitPercent = config ? Number(config.shared_discount_percent) : 0;

        if (splitPercent > 0) {
          const ownerShare       = Math.round(totalFare * (splitPercent / 100));
          const secondPartyShare = totalFare - ownerShare;

          // Persist the split on the ride record
          await supabase
            .from('rides')
            .update({
              shared_discount: ownerShare,
              share_discount_applied: true,
            })
            .eq('id', rideId);

          fare_split = {
            total_fare: totalFare,
            owner_share: ownerShare,
            second_party_share: secondPartyShare,
            split_percent: splitPercent,
            distance_km: distanceKm,
            split_applied: true,
          };

          logger.info(`Ride share split applied for ride ${rideId}: owner=₦${ownerShare}, second=₦${secondPartyShare}`);
        } else {
          fare_split = {
            total_fare: totalFare,
            owner_share: totalFare,
            second_party_share: 0,
            split_percent: 0,
            distance_km: distanceKm,
            split_applied: false,
            no_split_reason: 'No shared ride discount configured for this vehicle type',
          };
        }
      } else {
        // Distance ≤ 3km or ride already completed — no split
        fare_split = {
          total_fare: totalFare,
          owner_share: totalFare,
          second_party_share: 0,
          split_percent: 0,
          distance_km: distanceKm,
          split_applied: false,
          no_split_reason: ride.status === 'completed'
            ? 'Ride already completed, split no longer available'
            : 'Trip distance is 3km or under, no split applies',
        };
      }

      // ── Generate or return share token ────────────────────────────────────
      // If token exists and not revoked, return existing
      if ((ride as any).share_token && !(ride as any).share_token_revoked) {
        const baseUrl = process.env.FRONTEND_URL || 'https://olakzride.com';
        return {
          success: true,
          shareToken: (ride as any).share_token,
          shareUrl: `${baseUrl}/track/${(ride as any).share_token}`,
          fare_split,
        };
      }

      // Generate new token
      const shareToken = uuidv4();
      const now        = new Date();

      let expiresAt: Date;
      if ((ride as any).completed_at) {
        expiresAt = new Date(new Date((ride as any).completed_at).getTime() + 2 * 60 * 60 * 1000);
      } else {
        expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      }

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

      // ── Notify the assigned driver that a second passenger has been added ──
      const driverId = (ride as any).driver_id ?? null;
      if (driverId) {
        try {
          const { data: driverRow } = await supabase
            .from('drivers')
            .select('user_id')
            .eq('id', driverId)
            .single();

          if (driverRow?.user_id) {
            await this.pushService.sendToUser({
              userId: driverRow.user_id,
              rideId,
              notificationType: 'second_passenger_added',
              payload: {
                title: '👥 Second Passenger Added',
                body: 'Your passenger has shared this ride. Expect a second passenger to board.',
                data: {
                  type: 'second_passenger_added',
                  rideId,
                },
              },
              priority: 'high',
            });
            // logger.info(`Driver ${driverId} notified of second passenger for ride ${rideId}`);
          }
        } catch (notifyError) {
          // Non-fatal — log and continue
          logger.error('Failed to notify driver of second passenger:', notifyError);
        }
      }

      const baseUrl  = process.env.FRONTEND_URL || 'https://olakzride.com';
      const shareUrl = `${baseUrl}/track/${shareToken}`;

      logger.info('Share link generated', { rideId, shareToken, expiresAt });

      return {
        success: true,
        shareToken,
        shareUrl,
        expiresAt,
        fare_split,
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
          estimated_fare,
          shared_discount,
          share_discount_applied,
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
      const totalFare        = Number(ride.estimated_fare ?? 0);
      const ownerShare       = Number((ride as any).shared_discount ?? 0);
      const splitApplied     = (ride as any).share_discount_applied ?? false;
      const secondPartyShare = splitApplied && ownerShare > 0 ? totalFare - ownerShare : 0;

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
        // Second party sees their share of the fare
        fare_split: splitApplied && secondPartyShare > 0 ? {
          your_share: secondPartyShare,
          message: `Your share of this ride is ₦${secondPartyShare.toLocaleString()}`,
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
