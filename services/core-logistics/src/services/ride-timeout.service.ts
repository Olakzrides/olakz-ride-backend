import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { RideStatus } from './ride-state-machine.service';
import { PaymentService } from './payment.service';

export interface TimeoutConfig {
  searchTimeout: number; // Minutes to find driver
  driverAcceptanceTimeout: number; // Seconds for driver to accept
  driverArrivalTimeout: number; // Minutes for driver to arrive
  rideCompletionTimeout: number; // Hours for ride to complete
}

export class RideTimeoutService {
  private paymentService: PaymentService;
  private timeouts: Map<string, NodeJS.Timeout> = new Map();
  
  // Industry-standard timeout configurations
  private readonly DEFAULT_CONFIG: TimeoutConfig = {
    searchTimeout: 10, // 10 minutes to find driver
    driverAcceptanceTimeout: 30, // 30 seconds to accept
    driverArrivalTimeout: 15, // 15 minutes to arrive
    rideCompletionTimeout: 4, // 4 hours max ride duration
  };

  constructor() {
    this.paymentService = new PaymentService();
  }

  /**
   * Start search timeout when ride is created
   */
  async startSearchTimeout(rideId: string, config?: Partial<TimeoutConfig>): Promise<void> {
    const timeoutMinutes = config?.searchTimeout || this.DEFAULT_CONFIG.searchTimeout;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    logger.info(`Starting search timeout for ride ${rideId}: ${timeoutMinutes} minutes`);

    const timeout = setTimeout(async () => {
      await this.handleSearchTimeout(rideId);
    }, timeoutMs);

    this.timeouts.set(`search_${rideId}`, timeout);
  }

  /**
   * Start driver acceptance timeout when driver is assigned
   */
  async startDriverAcceptanceTimeout(rideId: string, driverId: string, config?: Partial<TimeoutConfig>): Promise<void> {
    const timeoutSeconds = config?.driverAcceptanceTimeout || this.DEFAULT_CONFIG.driverAcceptanceTimeout;
    const timeoutMs = timeoutSeconds * 1000;

    logger.info(`Starting driver acceptance timeout for ride ${rideId}, driver ${driverId}: ${timeoutSeconds} seconds`);

    const timeout = setTimeout(async () => {
      await this.handleDriverAcceptanceTimeout(rideId, driverId);
    }, timeoutMs);

    this.timeouts.set(`acceptance_${rideId}_${driverId}`, timeout);
  }

  /**
   * Start driver arrival timeout when driver accepts
   */
  async startDriverArrivalTimeout(rideId: string, driverId: string, config?: Partial<TimeoutConfig>): Promise<void> {
    const timeoutMinutes = config?.driverArrivalTimeout || this.DEFAULT_CONFIG.driverArrivalTimeout;
    const timeoutMs = timeoutMinutes * 60 * 1000;

    logger.info(`Starting driver arrival timeout for ride ${rideId}, driver ${driverId}: ${timeoutMinutes} minutes`);

    const timeout = setTimeout(async () => {
      await this.handleDriverArrivalTimeout(rideId, driverId);
    }, timeoutMs);

    this.timeouts.set(`arrival_${rideId}_${driverId}`, timeout);
  }

  /**
   * Start ride completion timeout when ride starts
   */
  async startRideCompletionTimeout(rideId: string, config?: Partial<TimeoutConfig>): Promise<void> {
    const timeoutHours = config?.rideCompletionTimeout || this.DEFAULT_CONFIG.rideCompletionTimeout;
    const timeoutMs = timeoutHours * 60 * 60 * 1000;

    logger.info(`Starting ride completion timeout for ride ${rideId}: ${timeoutHours} hours`);

    const timeout = setTimeout(async () => {
      await this.handleRideCompletionTimeout(rideId);
    }, timeoutMs);

    this.timeouts.set(`completion_${rideId}`, timeout);
  }

  /**
   * Clear all timeouts for a ride
   */
  clearRideTimeouts(rideId: string): void {
    const timeoutKeys = Array.from(this.timeouts.keys()).filter(key => key.includes(rideId));
    
    timeoutKeys.forEach(key => {
      const timeout = this.timeouts.get(key);
      if (timeout) {
        clearTimeout(timeout);
        this.timeouts.delete(key);
      }
    });

    logger.info(`Cleared ${timeoutKeys.length} timeouts for ride ${rideId}`);
  }

  /**
   * Handle search timeout - no driver found
   */
  private async handleSearchTimeout(rideId: string): Promise<void> {
    try {
      logger.warn(`Search timeout reached for ride ${rideId}`);

      // Get ride details
      const { data: ride, error } = await supabase
        .from('rides')
        .select('user_id, status, estimated_fare, currency_code, payment_hold_id')
        .eq('id', rideId)
        .single();

      if (error || !ride) {
        logger.error('Failed to get ride for timeout handling:', error);
        return;
      }

      // Only handle if still searching
      if (ride.status !== RideStatus.SEARCHING) {
        logger.info(`Ride ${rideId} no longer searching, skipping timeout`);
        return;
      }

      // Update ride status to timeout
      await supabase
        .from('rides')
        .update({
          status: RideStatus.TIMEOUT,
          updated_at: new Date().toISOString(),
          metadata: {
            timeout_reason: 'No driver found within time limit',
            timeout_at: new Date().toISOString(),
          },
        })
        .eq('id', rideId);

      // Release payment hold
      if (ride.payment_hold_id) {
        await this.paymentService.releasePaymentHold({
          holdId: ride.payment_hold_id,
          reason: 'Search timeout - no driver found',
        });
      }

      // TODO: Send notification to user
      logger.info(`Ride ${rideId} timed out, payment hold released`);

    } catch (error) {
      logger.error('Error handling search timeout:', error);
    } finally {
      this.timeouts.delete(`search_${rideId}`);
    }
  }

  /**
   * Handle driver acceptance timeout
   */
  private async handleDriverAcceptanceTimeout(rideId: string, driverId: string): Promise<void> {
    try {
      logger.warn(`Driver acceptance timeout for ride ${rideId}, driver ${driverId}`);

      // Check if driver has already accepted
      const { data: rideRequest } = await supabase
        .from('ride_requests')
        .select('status')
        .eq('ride_id', rideId)
        .eq('driver_id', driverId)
        .single();

      if (rideRequest?.status === 'accepted') {
        logger.info(`Driver ${driverId} already accepted ride ${rideId}`);
        return;
      }

      // Mark driver request as timeout
      await supabase
        .from('ride_requests')
        .update({
          status: 'timeout',
          updated_at: new Date().toISOString(),
        })
        .eq('ride_id', rideId)
        .eq('driver_id', driverId);

      // TODO: Find next available driver or restart search
      logger.info(`Driver ${driverId} timed out for ride ${rideId}`);

    } catch (error) {
      logger.error('Error handling driver acceptance timeout:', error);
    } finally {
      this.timeouts.delete(`acceptance_${rideId}_${driverId}`);
    }
  }

  /**
   * Handle driver arrival timeout
   */
  private async handleDriverArrivalTimeout(rideId: string, driverId: string): Promise<void> {
    try {
      logger.warn(`Driver arrival timeout for ride ${rideId}, driver ${driverId}`);

      // Get current ride status
      const { data: ride } = await supabase
        .from('rides')
        .select('status')
        .eq('id', rideId)
        .single();

      if (ride?.status !== RideStatus.DRIVER_ASSIGNED) {
        logger.info(`Ride ${rideId} status changed, skipping arrival timeout`);
        return;
      }

      // TODO: Send notification to driver and user
      // TODO: Consider automatic cancellation or reassignment
      logger.warn(`Driver ${driverId} taking too long to arrive for ride ${rideId}`);

    } catch (error) {
      logger.error('Error handling driver arrival timeout:', error);
    } finally {
      this.timeouts.delete(`arrival_${rideId}_${driverId}`);
    }
  }

  /**
   * Handle ride completion timeout
   */
  private async handleRideCompletionTimeout(rideId: string): Promise<void> {
    try {
      logger.warn(`Ride completion timeout for ride ${rideId}`);

      // Get current ride status
      const { data: ride } = await supabase
        .from('rides')
        .select('status, user_id')
        .eq('id', rideId)
        .single();

      if (ride?.status !== RideStatus.IN_PROGRESS) {
        logger.info(`Ride ${rideId} no longer in progress, skipping completion timeout`);
        return;
      }

      // TODO: Send emergency notification
      // TODO: Contact support team
      // TODO: Consider automatic completion with investigation flag
      logger.error(`Ride ${rideId} has been in progress for too long - possible emergency`);

    } catch (error) {
      logger.error('Error handling ride completion timeout:', error);
    } finally {
      this.timeouts.delete(`completion_${rideId}`);
    }
  }

  /**
   * Get active timeouts for monitoring
   */
  getActiveTimeouts(): { rideId: string; type: string; count: number }[] {
    const timeoutsByRide = new Map<string, string[]>();

    this.timeouts.forEach((_, key) => {
      const [type, rideId] = key.split('_');
      if (!timeoutsByRide.has(rideId)) {
        timeoutsByRide.set(rideId, []);
      }
      timeoutsByRide.get(rideId)!.push(type);
    });

    return Array.from(timeoutsByRide.entries()).map(([rideId, types]) => ({
      rideId,
      type: types.join(', '),
      count: types.length,
    }));
  }

  /**
   * Cleanup expired timeouts (called periodically)
   */
  cleanup(): void {
    const activeCount = this.timeouts.size;
    logger.info(`Timeout service cleanup: ${activeCount} active timeouts`);
  }
}