import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { DeliveryNotificationService } from './delivery-notification.service';

/**
 * DeliverySchedulerService
 * Handles scheduled delivery reminders and auto-matching
 * 
 * Features:
 * - Send reminders 1 hour and 15 minutes before pickup
 * - Auto-start matching 10-15 minutes before pickup
 * - Runs every 60 seconds
 */
export class DeliverySchedulerService {
  private static intervalId: NodeJS.Timeout | null = null;
  private static isRunning = false;

  /**
   * Start the scheduler
   */
  public static start(): void {
    if (this.intervalId) {
      logger.warn('DeliverySchedulerService is already running');
      return;
    }

    logger.info('Starting DeliverySchedulerService...');

    // Run immediately on start
    this.runScheduledTasks().catch(error => {
      logger.error('Error in initial scheduler run:', error);
    });

    // Then run every 60 seconds
    this.intervalId = setInterval(() => {
      this.runScheduledTasks().catch(error => {
        logger.error('Error in scheduler interval:', error);
      });
    }, 60000); // 60 seconds

    logger.info('DeliverySchedulerService started successfully');
  }

  /**
   * Stop the scheduler
   */
  public static stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('DeliverySchedulerService stopped');
    }
  }

  /**
   * Run all scheduled tasks
   */
  private static async runScheduledTasks(): Promise<void> {
    if (this.isRunning) {
      logger.debug('Scheduler already running, skipping this cycle');
      return;
    }

    this.isRunning = true;

    try {
      await Promise.all([
        this.processReminders(),
        this.processAutoMatching(),
        this.checkTimeouts(),
      ]);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process delivery reminders
   * Send reminders 1 hour and 15 minutes before pickup
   */
  private static async processReminders(): Promise<void> {
    try {
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      // const fifteenMinFromNow = new Date(now.getTime() + 15 * 60 * 1000); // Not used currently

      // Get scheduled deliveries that need reminders
      const { data: deliveries, error } = await supabase
        .from('deliveries')
        .select('id, customer_id, order_number, scheduled_pickup_at, pickup_address, dropoff_address')
        .eq('delivery_type', 'scheduled')
        .eq('status', 'pending')
        .not('scheduled_pickup_at', 'is', null)
        .gte('scheduled_pickup_at', now.toISOString())
        .lte('scheduled_pickup_at', oneHourFromNow.toISOString());

      if (error) {
        logger.error('Error fetching deliveries for reminders:', error);
        return;
      }

      if (!deliveries || deliveries.length === 0) {
        return;
      }

      for (const delivery of deliveries) {
        const scheduledTime = new Date(delivery.scheduled_pickup_at);
        const timeDiff = scheduledTime.getTime() - now.getTime();
        const minutesUntilPickup = Math.floor(timeDiff / (60 * 1000));

        // Determine reminder type
        let reminderType: '1_hour_before' | '15_min_before' | null = null;

        if (minutesUntilPickup <= 60 && minutesUntilPickup > 50) {
          reminderType = '1_hour_before';
        } else if (minutesUntilPickup <= 15 && minutesUntilPickup > 10) {
          reminderType = '15_min_before';
        }

        if (!reminderType) {
          continue;
        }

        // Check if reminder already sent
        const { data: existingReminder } = await supabase
          .from('delivery_reminders')
          .select('id')
          .eq('delivery_id', delivery.id)
          .eq('reminder_type', reminderType)
          .eq('status', 'sent')
          .single();

        if (existingReminder) {
          continue; // Already sent
        }

        // Send reminder
        await this.sendReminder(delivery, reminderType, minutesUntilPickup);
      }
    } catch (error) {
      logger.error('Error processing reminders:', error);
    }
  }

  /**
   * Send reminder notification
   */
  private static async sendReminder(
    delivery: any,
    reminderType: '1_hour_before' | '15_min_before',
    minutesUntilPickup: number
  ): Promise<void> {
    try {
      // Create reminder record
      const { data: reminder, error: reminderError } = await supabase
        .from('delivery_reminders')
        .insert({
          delivery_id: delivery.id,
          reminder_type: reminderType,
          scheduled_for: new Date().toISOString(),
          status: 'pending',
        })
        .select()
        .single();

      if (reminderError) {
        logger.error(`Error creating reminder record:`, reminderError);
        return;
      }

      // Send notification
      await DeliveryNotificationService.sendScheduledDeliveryReminder({
        customerId: delivery.customer_id,
        deliveryId: delivery.id,
        orderNumber: delivery.order_number,
        scheduledPickupAt: delivery.scheduled_pickup_at,
        minutesUntilPickup,
        pickupAddress: delivery.pickup_address,
        dropoffAddress: delivery.dropoff_address,
      });

      // Update reminder status
      await supabase
        .from('delivery_reminders')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', reminder.id);

      logger.info(`Sent ${reminderType} reminder for delivery ${delivery.id}`);
    } catch (error) {
      logger.error(`Error sending reminder for delivery ${delivery.id}:`, error);

      // Update reminder status to failed
      await supabase
        .from('delivery_reminders')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
        })
        .eq('delivery_id', delivery.id)
        .eq('reminder_type', reminderType);
    }
  }

  /**
   * Process auto-matching for scheduled deliveries
   * Start matching 10-15 minutes before pickup
   */
  private static async processAutoMatching(): Promise<void> {
    try {
      const now = new Date();
      const fifteenMinFromNow = new Date(now.getTime() + 15 * 60 * 1000);
      const tenMinFromNow = new Date(now.getTime() + 10 * 60 * 1000);

      // Get scheduled deliveries ready for matching
      const { data: deliveries, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('delivery_type', 'scheduled')
        .eq('status', 'pending')
        .is('matching_started_at', null)
        .not('scheduled_pickup_at', 'is', null)
        .gte('scheduled_pickup_at', tenMinFromNow.toISOString())
        .lte('scheduled_pickup_at', fifteenMinFromNow.toISOString());

      if (error) {
        logger.error('Error fetching deliveries for auto-matching:', error);
        return;
      }

      if (!deliveries || deliveries.length === 0) {
        return;
      }

      for (const delivery of deliveries) {
        await this.startMatching(delivery);
      }
    } catch (error) {
      logger.error('Error processing auto-matching:', error);
    }
  }

  /**
   * Start matching for a scheduled delivery
   */
  private static async startMatching(delivery: any): Promise<void> {
    try {
      // Update status to searching and mark matching as started
      const { error: updateError } = await supabase
        .from('deliveries')
        .update({
          status: 'searching',
          searching_at: new Date().toISOString(),
          matching_started_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);

      if (updateError) {
        logger.error(`Error updating delivery ${delivery.id} to searching:`, updateError);
        return;
      }

      logger.info(`Started auto-matching for scheduled delivery ${delivery.id} (${delivery.order_number})`);

      // Trigger courier matching
      const { DeliveryService } = await import('./delivery.service');
      await (DeliveryService as any).triggerCourierMatching(delivery.id, {
        pickupLatitude: parseFloat(delivery.pickup_latitude),
        pickupLongitude: parseFloat(delivery.pickup_longitude),
        vehicleTypeId: delivery.vehicle_type_id,
        regionId: delivery.region_id,
        maxDistance: 15,
        maxCouriers: 5,
      });
    } catch (error) {
      logger.error(`Error starting matching for delivery ${delivery.id}:`, error);
    }
  }

  /**
   * Check for timed out deliveries
   */
  private static async checkTimeouts(): Promise<void> {
    try {
      const { DeliveryTimeoutService } = await import('./delivery-timeout.service');
      await DeliveryTimeoutService.checkTimeouts();
    } catch (error) {
      logger.error('Error checking delivery timeouts:', error);
    }
  }
}
