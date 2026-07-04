import { supabase } from '../config/database';
import { logger } from '../config/logger';

export interface DriverAvailability {
  driverId: string;
  isOnline: boolean;
  isAvailable: boolean;
  lastSeenAt: Date;
}

export class DriverAvailabilityService {
  /**
   * Toggle driver online/offline status
   */
  async toggleOnlineStatus(
    driverId: string,
    isOnline: boolean
  ): Promise<{
    success: boolean;
    availability?: DriverAvailability;
    error?: string;
  }> {
    try {
      // Check if driver can go online
      if (isOnline) {
        const canGoOnline = await this.canGoOnline(driverId);
        if (!canGoOnline.canGoOnline) {
          return {
            success: false,
            error: canGoOnline.reason || 'Cannot go online',
          };
        }
      }

      // Update or create availability record
      const { data: existingAvailability } = await supabase
        .from('driver_availability')
        .select('*')
        .eq('driver_id', driverId)
        .single();

      const now = new Date().toISOString();

      if (existingAvailability) {
        // Update existing record
        const { data, error } = await supabase
          .from('driver_availability')
          .update({
            is_online: isOnline,
            is_available: isOnline, // When going online, also set available
            last_seen_at: now,
            updated_at: now,
          })
          .eq('driver_id', driverId)
          .select()
          .single();

        if (error) {
          logger.error('Error updating driver availability:', error);
          return { success: false, error: 'Failed to update availability' };
        }

        logger.info(`Driver ${driverId} ${isOnline ? 'went online' : 'went offline'}`);

        // When driver comes online, check for active hire searches they can join
        if (isOnline) {
          this.notifyDriverOfActiveHires(driverId).catch(() => {});
        }

        return {
          success: true,
          availability: {
            driverId: data.driver_id,
            isOnline: data.is_online,
            isAvailable: data.is_available,
            lastSeenAt: new Date(data.last_seen_at),
          },
        };
      } else {
        // Create new availability record
        const { data, error } = await supabase
          .from('driver_availability')
          .insert({
            driver_id: driverId,
            is_online: isOnline,
            is_available: isOnline,
            last_seen_at: now,
          })
          .select()
          .single();

        if (error) {
          logger.error('Error creating driver availability:', error);
          return { success: false, error: 'Failed to create availability' };
        }

        logger.info(`Driver ${driverId} availability created (${isOnline ? 'online' : 'offline'})`);

        return {
          success: true,
          availability: {
            driverId: data.driver_id,
            isOnline: data.is_online,
            isAvailable: data.is_available,
            lastSeenAt: new Date(data.last_seen_at),
          },
        };
      }
    } catch (error: any) {
      logger.error('Toggle online status error:', error);
      return { success: false, error: 'Failed to toggle online status' };
    }
  }

  /**
   * Get current availability status
   */
  async getAvailability(driverId: string): Promise<DriverAvailability | null> {
    try {
      const { data, error } = await supabase
        .from('driver_availability')
        .select('*')
        .eq('driver_id', driverId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        driverId: data.driver_id,
        isOnline: data.is_online,
        isAvailable: data.is_available,
        lastSeenAt: new Date(data.last_seen_at),
      };
    } catch (error: any) {
      logger.error('Get availability error:', error);
      return null;
    }
  }

  /**
   * Set availability (called by system during ride assignment/completion)
   */
  async setAvailable(driverId: string, isAvailable: boolean): Promise<void> {
    try {
      const { error } = await supabase
        .from('driver_availability')
        .update({
          is_available: isAvailable,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('driver_id', driverId);

      if (error) {
        logger.error('Error setting driver availability:', error);
      } else {
        logger.info(`Driver ${driverId} availability set to ${isAvailable}`);
      }
    } catch (error: any) {
      logger.error('Set available error:', error);
    }
  }

  /**
   * When a driver comes online, check if there are any active hire searches
   * that match their service tier and insert them into hire_requests so they
   * can see and accept the hire.
   */
  private async notifyDriverOfActiveHires(driverId: string): Promise<void> {
    try {
      // Get driver's service_tier_id
      const { data: driver } = await supabase
        .from('drivers')
        .select('id, service_tier_id')
        .eq('id', driverId)
        .single();

      if (!driver) return;

      const SERVICE_TIER_MAP: Record<string, string> = {
        '00000000-0000-0000-0000-000000000011': 'standard',
        '00000000-0000-0000-0000-000000000012': 'premium',
        '00000000-0000-0000-0000-000000000013': 'vip',
      };
      const subType = SERVICE_TIER_MAP[driver.service_tier_id] ?? null;

      // Find active hire searches for matching vehicle sub-types
      // Car hires use service_tier_id; bus/truck use any available driver
      let hiresQuery = supabase
        .from('transport_hires')
        .select('id, vehicle_sub_type, vehicle_category')
        .eq('status', 'searching');

      if (subType) {
        // Match car tiers specifically
        hiresQuery = hiresQuery.eq('vehicle_sub_type', subType);
      }

      const { data: activeHires } = await hiresQuery;
      if (!activeHires || activeHires.length === 0) return;

      // Check which ones this driver is NOT already in hire_requests for
      const hireIds = activeHires.map(h => h.id);
      const { data: existing } = await supabase
        .from('hire_requests')
        .select('hire_id')
        .eq('driver_id', driverId)
        .in('hire_id', hireIds);

      const existingHireIds = new Set((existing ?? []).map(r => r.hire_id));
      const newHireIds = hireIds.filter(id => !existingHireIds.has(id));

      if (newHireIds.length === 0) return;

      // Insert hire_requests for this driver for the active hires
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const rows = newHireIds.map(hireId => ({
        hire_id:    hireId,
        driver_id:  driverId,
        status:     'pending',
        batch_number: 2, // batch 2 = late-joining driver
        expires_at: expiresAt,
      }));

      await supabase.from('hire_requests').insert(rows);

      logger.info('Driver joined active hire searches on coming online', {
        driverId, newHireIds,
      });
    } catch (err: any) {
      logger.warn('notifyDriverOfActiveHires failed (non-fatal)', { error: err.message });
    }
  }

  /**
   * Check if driver can go online
   */
  async canGoOnline(driverId: string): Promise<{
    canGoOnline: boolean;
    reason?: string;
  }> {
    try {
      // Check driver status
      const { data: driver, error } = await supabase
        .from('drivers')
        .select('status')
        .eq('id', driverId)
        .single();

      if (error || !driver) {
        return {
          canGoOnline: false,
          reason: 'Driver not found',
        };
      }

      if (driver.status !== 'approved') {
        return {
          canGoOnline: false,
          reason: 'DRIVER_NOT_APPROVED',
        };
      }

      return { canGoOnline: true };
    } catch (error: any) {
      logger.error('Can go online check error:', error);
      return {
        canGoOnline: false,
        reason: 'Failed to check driver status',
      };
    }
  }
}
