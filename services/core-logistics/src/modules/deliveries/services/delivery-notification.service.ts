import { logger } from '../../../config/logger';
import { PushNotificationService } from '../../../services/push-notification.service';

/**
 * DeliveryNotificationService
 * Handles push notifications for delivery events
 */
export class DeliveryNotificationService {
  /**
   * Send delivery confirmation notification
   */
  static async sendDeliveryConfirmation(params: {
    customerId: string;
    customerEmail: string;
    deliveryId: string;
    orderNumber: string;
    pickupAddress: string;
    dropoffAddress: string;
    fare: number;
    currencyCode: string;
    pickupCode: string;
    deliveryCode: string;
    estimatedDeliveryTime?: string;
  }): Promise<void> {
    try {
      const {
        customerId,
        deliveryId,
        orderNumber,
      } = params;

      // Send push notification using singleton instance
      const pushService = PushNotificationService.getInstance();
      await pushService.sendToUser({
        userId: customerId,
        notificationType: 'delivery_confirmed',
        payload: {
          title: 'Delivery Order Confirmed',
          body: `Your delivery order ${orderNumber} has been confirmed. We're finding a courier for you.`,
          data: {
            type: 'delivery_confirmed',
            deliveryId,
            orderNumber,
          },
        },
      });

      logger.info('Delivery confirmation notification sent:', {
        customerId,
        deliveryId,
        orderNumber,
      });
    } catch (error) {
      logger.error('Send delivery confirmation notification error:', error);
      // Don't throw error - notification failure shouldn't block delivery creation
    }
  }

  /**
   * Send courier assigned notification
   */
  static async sendCourierAssigned(params: {
    customerId: string;
    customerEmail: string;
    deliveryId: string;
    orderNumber: string;
    courierName: string;
    courierPhone: string;
    courierRating: string;
  }): Promise<void> {
    try {
      const { customerId, deliveryId, orderNumber, courierName } = params;

      const pushService = PushNotificationService.getInstance();
      await pushService.sendToUser({
        userId: customerId,
        notificationType: 'courier_assigned',
        payload: {
          title: 'Courier Assigned',
          body: `${courierName} has been assigned to your delivery ${orderNumber}`,
          data: {
            type: 'courier_assigned',
            deliveryId,
            orderNumber,
          },
        },
      });

      logger.info('Courier assigned notification sent:', {
        customerId,
        deliveryId,
        orderNumber,
      });
    } catch (error) {
      logger.error('Send courier assigned notification error:', error);
    }
  }

  /**
   * Send delivery status update notification
   */
  static async sendStatusUpdate(params: {
    customerId: string;
    deliveryId: string;
    orderNumber: string;
    status: string;
    statusMessage: string;
  }): Promise<void> {
    try {
      const { customerId, deliveryId, orderNumber, status, statusMessage } = params;

      const pushService = PushNotificationService.getInstance();
      await pushService.sendToUser({
        userId: customerId,
        notificationType: 'delivery_status_update',
        payload: {
          title: 'Delivery Status Update',
          body: statusMessage,
          data: {
            type: 'delivery_status_update',
            deliveryId,
            orderNumber,
            status,
          },
        },
      });

      logger.info('Delivery status update notification sent:', {
        customerId,
        deliveryId,
        orderNumber,
        status,
      });
    } catch (error) {
      logger.error('Send delivery status update notification error:', error);
    }
  }

  /**
   * Send delivery completed notification
   */
  static async sendDeliveryCompleted(params: {
    customerId: string;
    customerEmail: string;
    deliveryId: string;
    orderNumber: string;
    fare: number;
    currencyCode: string;
  }): Promise<void> {
    try {
      const { customerId, deliveryId, orderNumber } = params;

      const pushService = PushNotificationService.getInstance();
      await pushService.sendToUser({
        userId: customerId,
        notificationType: 'delivery_completed',
        payload: {
          title: 'Delivery Completed',
          body: `Your delivery ${orderNumber} has been completed successfully!`,
          data: {
            type: 'delivery_completed',
            deliveryId,
            orderNumber,
          },
        },
      });

      logger.info('Delivery completed notification sent:', {
        customerId,
        deliveryId,
        orderNumber,
      });
    } catch (error) {
      logger.error('Send delivery completed notification error:', error);
    }
  }

  /**
   * Send delivery cancelled notification
   */
  static async sendDeliveryCancelled(params: {
    customerId: string;
    customerEmail: string;
    deliveryId: string;
    orderNumber: string;
    reason: string;
    refundAmount?: number;
    currencyCode?: string;
  }): Promise<void> {
    try {
      const { customerId, deliveryId, orderNumber, refundAmount } = params;

      const pushService = PushNotificationService.getInstance();
      await pushService.sendToUser({
        userId: customerId,
        notificationType: 'delivery_cancelled',
        payload: {
          title: 'Delivery Cancelled',
          body: `Your delivery ${orderNumber} has been cancelled. ${refundAmount ? 'Refund processed.' : ''}`,
          data: {
            type: 'delivery_cancelled',
            deliveryId,
            orderNumber,
          },
        },
      });

      logger.info('Delivery cancelled notification sent:', {
        customerId,
        deliveryId,
        orderNumber,
      });
    } catch (error) {
      logger.error('Send delivery cancelled notification error:', error);
    }
  }

  /**
   * Send en route to delivery notification
   */
  static async sendEnRouteToDelivery(params: {
    customerId: string;
    deliveryId: string;
    orderNumber: string;
    courierName: string;
  }): Promise<void> {
    try {
      const { customerId, deliveryId, orderNumber, courierName } = params;

      const pushService = PushNotificationService.getInstance();
      await pushService.sendToUser({
        userId: customerId,
        notificationType: 'delivery_en_route',
        payload: {
          title: 'Package On The Way',
          body: `${courierName} is on the way to deliver your package ${orderNumber}`,
          data: {
            type: 'delivery_en_route',
            deliveryId,
            orderNumber,
          },
        },
      });

      logger.info('En route to delivery notification sent:', {
        customerId,
        deliveryId,
        orderNumber,
      });
    } catch (error) {
      logger.error('Send en route notification error:', error);
    }
  }

  /**
   * Send arrived at delivery location notification
   */
  static async sendArrivedAtDelivery(params: {
    customerId: string;
    deliveryId: string;
    orderNumber: string;
    courierName: string;
  }): Promise<void> {
    try {
      const { customerId, deliveryId, orderNumber, courierName } = params;

      const pushService = PushNotificationService.getInstance();
      await pushService.sendToUser({
        userId: customerId,
        notificationType: 'delivery_arrived',
        payload: {
          title: 'Courier Has Arrived',
          body: `${courierName} has arrived at your delivery location for ${orderNumber}`,
          data: {
            type: 'delivery_arrived',
            deliveryId,
            orderNumber,
          },
        },
      });

      logger.info('Arrived at delivery notification sent:', {
        customerId,
        deliveryId,
        orderNumber,
      });
    } catch (error) {
      logger.error('Send arrived at delivery notification error:', error);
    }
  }

  /**
   * Send scheduled delivery reminder notification
   */
  static async sendScheduledDeliveryReminder(params: {
    customerId: string;
    deliveryId: string;
    orderNumber: string;
    scheduledPickupAt: string;
    minutesUntilPickup: number;
    pickupAddress: string;
    dropoffAddress: string;
  }): Promise<void> {
    try {
      const { customerId, deliveryId, orderNumber, minutesUntilPickup } = params;

      const timeMessage = minutesUntilPickup >= 60 
        ? 'in 1 hour' 
        : 'in 15 minutes';

      const pushService = PushNotificationService.getInstance();
      await pushService.sendToUser({
        userId: customerId,
        notificationType: 'scheduled_delivery_reminder',
        payload: {
          title: 'Delivery Reminder',
          body: `Your scheduled delivery ${orderNumber} is coming up ${timeMessage}`,
          data: {
            type: 'scheduled_delivery_reminder',
            deliveryId,
            orderNumber,
            minutesUntilPickup: minutesUntilPickup.toString(),
          },
        },
      });

      logger.info('Scheduled delivery reminder sent:', {
        customerId,
        deliveryId,
        orderNumber,
        minutesUntilPickup,
      });
    } catch (error) {
      logger.error('Send scheduled delivery reminder error:', error);
    }
  }
}
