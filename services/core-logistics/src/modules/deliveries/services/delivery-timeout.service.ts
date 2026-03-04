import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { DeliveryNotificationService } from './delivery-notification.service';

/**
 * DeliveryTimeoutService
 * Handles delivery timeouts and no-show scenarios
 * 
 * Timeout Rules:
 * - assigned: 30 minutes
 * - picked_up: depends on distance (not auto-timeout)
 * - in_transit: 2x estimated duration
 * 
 * On timeout: Flag for admin review, notify admin (NO auto-refund)
 */
export class DeliveryTimeoutService {
  /**
   * Calculate and set timeout for delivery based on status
   */
  public static async setDeliveryTimeout(deliveryId: string, status: string): Promise<void> {
    try {
      const now = new Date();
      let timeoutAt: Date | null = null;

      switch (status) {
        case 'assigned':
          // 30 minutes timeout
          timeoutAt = new Date(now.getTime() + 30 * 60 * 1000);
          break;

        case 'in_transit':
          // Get delivery to calculate timeout based on distance
          const { data: delivery } = await supabase
            .from('deliveries')
            .select('distance_km')
            .eq('id', deliveryId)
            .single();

          if (delivery && delivery.distance_km) {
            // Estimate: 30 km/h average speed
            const estimatedMinutes = (parseFloat(delivery.distance_km) / 30) * 60;
            // 2x estimated duration
            const timeoutMinutes = estimatedMinutes * 2;
            timeoutAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);
          }
          break;

        default:
          // No timeout for other statuses
          timeoutAt = null;
      }

      if (timeoutAt) {
        await supabase
          .from('deliveries')
          .update({ timeout_at: timeoutAt.toISOString() })
          .eq('id', deliveryId);

        logger.info(`Timeout set for delivery ${deliveryId}: ${timeoutAt.toISOString()}`);
      }
    } catch (error) {
      logger.error(`Error setting timeout for delivery ${deliveryId}:`, error);
    }
  }

  /**
   * Check for timed out deliveries and flag them
   * Called periodically by scheduler
   */
  public static async checkTimeouts(): Promise<void> {
    try {
      const now = new Date();

      // Find deliveries that have timed out
      const { data: timedOutDeliveries, error } = await supabase
        .from('deliveries')
        .select('id, order_number, customer_id, courier_id, status, timeout_at')
        .not('timeout_at', 'is', null)
        .lte('timeout_at', now.toISOString())
        .is('timed_out_at', null)
        .in('status', ['assigned', 'in_transit']);

      if (error) {
        logger.error('Error checking timeouts:', error);
        return;
      }

      if (!timedOutDeliveries || timedOutDeliveries.length === 0) {
        return;
      }

      logger.info(`Found ${timedOutDeliveries.length} timed out deliveries`);

      for (const delivery of timedOutDeliveries) {
        await this.handleTimeout(delivery);
      }
    } catch (error) {
      logger.error('Error in checkTimeouts:', error);
    }
  }

  /**
   * Handle a timed out delivery
   */
  private static async handleTimeout(delivery: any): Promise<void> {
    try {
      // Flag delivery for review
      await supabase
        .from('deliveries')
        .update({
          timed_out_at: new Date().toISOString(),
          flagged_for_review: true,
          review_reason: `Delivery timed out in ${delivery.status} status`,
        })
        .eq('id', delivery.id);

      // Add to status history
      await supabase
        .from('delivery_status_history')
        .insert({
          delivery_id: delivery.id,
          status: delivery.status,
          notes: `Delivery timed out - flagged for admin review`,
        });

      // TODO: Send notification to admin
      // This would integrate with your admin notification system

      logger.warn(`Delivery ${delivery.id} (${delivery.order_number}) timed out in ${delivery.status} status`);
    } catch (error) {
      logger.error(`Error handling timeout for delivery ${delivery.id}:`, error);
    }
  }

  /**
   * Mark courier as no-show
   * Called by customer after courier doesn't arrive
   */
  public static async markCourierNoShow(params: {
    deliveryId: string;
    customerId: string;
    reason?: string;
  }): Promise<void> {
    try {
      const { deliveryId, customerId, reason } = params;

      // Get delivery details
      const { data: delivery, error: deliveryError } = await supabase
        .from('deliveries')
        .select('id, order_number, courier_id, status, rematch_count, customer_id')
        .eq('id', deliveryId)
        .single();

      if (deliveryError || !delivery) {
        throw new Error('Delivery not found');
      }

      // Verify customer owns this delivery
      if (delivery.customer_id !== customerId) {
        throw new Error('Unauthorized');
      }

      // Check if delivery is in correct status
      if (!['assigned', 'arrived_pickup'].includes(delivery.status)) {
        throw new Error('Cannot mark no-show for delivery in current status');
      }

      // Mark as no-show
      await supabase
        .from('deliveries')
        .update({
          courier_no_show: true,
          no_show_reported_at: new Date().toISOString(),
          status: 'searching', // Back to searching
          courier_id: null, // Remove courier assignment
          assigned_at: null,
          rematch_count: delivery.rematch_count + 1,
        })
        .eq('id', deliveryId);

      // Add to status history
      await supabase
        .from('delivery_status_history')
        .insert({
          delivery_id: deliveryId,
          status: 'searching',
          notes: `Courier no-show reported. Reason: ${reason || 'Not provided'}. Rematch attempt: ${delivery.rematch_count + 1}`,
          created_by: customerId,
        });

      logger.info(`Courier no-show marked for delivery ${deliveryId}. Rematch count: ${delivery.rematch_count + 1}`);

      // Check rematch count
      if (delivery.rematch_count + 1 >= 2) {
        // Second courier failed - cancel and refund
        await this.cancelAfterSecondNoShow(deliveryId, customerId);
      } else {
        // First no-show - rematch once
        await this.rematchDelivery(deliveryId);
      }
    } catch (error) {
      logger.error('Error marking courier no-show:', error);
      throw error;
    }
  }

  /**
   * Rematch delivery after first no-show
   */
  private static async rematchDelivery(deliveryId: string): Promise<void> {
    try {
      // Get delivery details
      const { data: delivery } = await supabase
        .from('deliveries')
        .select('*')
        .eq('id', deliveryId)
        .single();

      if (!delivery) {
        return;
      }

      // Trigger courier matching
      const { DeliveryService } = await import('./delivery.service');
      await (DeliveryService as any).triggerCourierMatching(deliveryId, {
        pickupLatitude: parseFloat(delivery.pickup_latitude),
        pickupLongitude: parseFloat(delivery.pickup_longitude),
        vehicleTypeId: delivery.vehicle_type_id,
        regionId: delivery.region_id,
        maxDistance: 15,
        maxCouriers: 5,
      });

      logger.info(`Rematching delivery ${deliveryId} after no-show`);
    } catch (error) {
      logger.error(`Error rematching delivery ${deliveryId}:`, error);
    }
  }

  /**
   * Cancel delivery after second courier no-show
   */
  private static async cancelAfterSecondNoShow(deliveryId: string, customerId: string): Promise<void> {
    try {
      // Cancel delivery
      await supabase
        .from('deliveries')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          payment_status: 'refunded',
        })
        .eq('id', deliveryId);

      // Add to status history
      await supabase
        .from('delivery_status_history')
        .insert({
          delivery_id: deliveryId,
          status: 'cancelled',
          notes: 'Delivery cancelled after second courier no-show. Refund processed.',
          created_by: customerId,
        });

      // Get delivery details for notification
      const { data: delivery } = await supabase
        .from('deliveries')
        .select('order_number, estimated_fare, currency_code')
        .eq('id', deliveryId)
        .single();

      if (delivery) {
        // Send cancellation notification
        await DeliveryNotificationService.sendDeliveryCancelled({
          customerId,
          customerEmail: '', // Will be fetched if needed
          deliveryId,
          orderNumber: delivery.order_number,
          reason: 'Second courier no-show',
          refundAmount: parseFloat(delivery.estimated_fare),
          currencyCode: delivery.currency_code,
        });
      }

      logger.info(`Delivery ${deliveryId} cancelled after second no-show. Refund processed.`);
    } catch (error) {
      logger.error(`Error cancelling delivery ${deliveryId} after second no-show:`, error);
    }
  }
}
