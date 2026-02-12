import { supabase } from '../config/database';
import { logger } from '../config/logger';

interface DriverLocationUpdate {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  batteryLevel?: number;
  appVersion?: string;
}

interface DriverLocation extends DriverLocationUpdate {
  driverId: string;
  createdAt: Date;
}

export class DriverLocationService {
  private lastUpdateTimes: Map<string, number> = new Map();
  private readonly MIN_UPDATE_INTERVAL_MS = 5000; // 5 seconds

  /**
   * Update driver location with rate limiting
   */
  async updateLocation(
    driverId: string,
    location: DriverLocationUpdate
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Check if driver is online
      const { data: availability } = await supabase
        .from('driver_availability')
        .select('is_online')
        .eq('driver_id', driverId)
        .single();

      if (!availability || !availability.is_online) {
        return {
          success: false,
          error: 'DRIVER_NOT_ONLINE',
        };
      }

      // Rate limiting check
      const now = Date.now();
      const lastUpdate = this.lastUpdateTimes.get(driverId) || 0;
      
      if (now - lastUpdate < this.MIN_UPDATE_INTERVAL_MS) {
        return {
          success: false,
          error: 'Rate limit exceeded. Minimum 5 seconds between updates.',
        };
      }

      // Save location to database
      const { error } = await supabase
        .from('driver_location_tracking')
        .insert({
          driver_id: driverId,
          latitude: location.latitude,
          longitude: location.longitude,
          heading: location.heading,
          speed: location.speed,
          accuracy: location.accuracy,
          is_online: true,
          is_available: availability.is_online,
          battery_level: location.batteryLevel,
          app_version: location.appVersion,
        });

      if (error) {
        logger.error('Error saving driver location:', error);
        return { success: false, error: 'Failed to save location' };
      }

      // Update last update time
      this.lastUpdateTimes.set(driverId, now);

      logger.debug(`Driver ${driverId} location updated`);

      return { success: true };
    } catch (error: any) {
      logger.error('Update location error:', error);
      return { success: false, error: 'Failed to update location' };
    }
  }

  /**
   * Get latest location for driver
   */
  async getLatestLocation(driverId: string): Promise<DriverLocation | null> {
    try {
      const { data, error } = await supabase
        .from('driver_location_tracking')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        driverId: data.driver_id,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        heading: data.heading ? parseFloat(data.heading) : undefined,
        speed: data.speed ? parseFloat(data.speed) : undefined,
        accuracy: data.accuracy ? parseFloat(data.accuracy) : undefined,
        batteryLevel: data.battery_level,
        appVersion: data.app_version,
        createdAt: new Date(data.created_at),
      };
    } catch (error: any) {
      logger.error('Get latest location error:', error);
      return null;
    }
  }

  /**
   * Get location history for driver
   */
  async getLocationHistory(
    driverId: string,
    options: {
      startDate: Date;
      endDate: Date;
      limit?: number;
    }
  ): Promise<DriverLocation[]> {
    try {
      const limit = options.limit || 100;

      const { data, error } = await supabase
        .from('driver_location_tracking')
        .select('*')
        .eq('driver_id', driverId)
        .gte('created_at', options.startDate.toISOString())
        .lte('created_at', options.endDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) {
        logger.error('Get location history error:', error);
        return [];
      }

      return data.map(loc => ({
        driverId: loc.driver_id,
        latitude: parseFloat(loc.latitude),
        longitude: parseFloat(loc.longitude),
        heading: loc.heading ? parseFloat(loc.heading) : undefined,
        speed: loc.speed ? parseFloat(loc.speed) : undefined,
        accuracy: loc.accuracy ? parseFloat(loc.accuracy) : undefined,
        batteryLevel: loc.battery_level,
        appVersion: loc.app_version,
        createdAt: new Date(loc.created_at),
      }));
    } catch (error: any) {
      logger.error('Get location history error:', error);
      return [];
    }
  }
}
