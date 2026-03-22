import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

const INTERNAL_HEADERS = {
  'x-internal-api-key': config.internalApiKey,
  'Content-Type': 'application/json',
};

/**
 * Sends push notifications via core-logistics internal push notification API
 */
export class FoodNotificationService {
  private static baseUrl = config.services.coreLogistics;

  static async send(params: {
    userId: string;
    title: string;
    body: string;
    data?: Record<string, string>;
    orderId?: string;
  }): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/api/notifications/push/internal`,
        {
          user_id: params.userId,
          title: params.title,
          body: params.body,
          data: params.data || {},
          order_id: params.orderId,
          notification_type: 'food_order',
        },
        { headers: INTERNAL_HEADERS, timeout: 5000 }
      );
    } catch (err: any) {
      // Non-fatal — log and continue
      logger.warn('Food push notification failed', { userId: params.userId, error: err.message });
    }
  }

  // ── Convenience methods ─────────────────────────────────────────────────────

  static async notifyVendorNewOrder(vendorUserId: string, orderId: string, restaurantName: string): Promise<void> {
    await this.send({
      userId: vendorUserId,
      title: '🍽️ New Order!',
      body: `You have a new order at ${restaurantName}`,
      data: { order_id: orderId, type: 'new_order' },
      orderId,
    });
  }

  static async notifyCustomerOrderAccepted(customerId: string, orderId: string, restaurantName: string, prepMinutes?: number): Promise<void> {
    const prepText = prepMinutes ? ` (~${prepMinutes} min)` : '';
    await this.send({
      userId: customerId,
      title: '✅ Order Accepted',
      body: `${restaurantName} is preparing your order${prepText}`,
      data: { order_id: orderId, type: 'order_accepted' },
      orderId,
    });
  }

  static async notifyCustomerOrderRejected(customerId: string, orderId: string, reason: string): Promise<void> {
    await this.send({
      userId: customerId,
      title: '❌ Order Rejected',
      body: `Your order was rejected: ${reason}. A full refund has been processed.`,
      data: { order_id: orderId, type: 'order_rejected' },
      orderId,
    });
  }

  static async notifyCustomerCourierAssigned(customerId: string, orderId: string): Promise<void> {
    await this.send({
      userId: customerId,
      title: '🛵 Courier Assigned',
      body: 'A courier is on the way to pick up your order',
      data: { order_id: orderId, type: 'courier_assigned' },
      orderId,
    });
  }

  static async notifyCustomerOrderReady(customerId: string, orderId: string): Promise<void> {
    await this.send({
      userId: customerId,
      title: '📦 Order Ready',
      body: 'Your order is ready and waiting for courier pickup',
      data: { order_id: orderId, type: 'order_ready' },
      orderId,
    });
  }

  static async notifyCustomerOrderDelivered(customerId: string, orderId: string): Promise<void> {
    await this.send({
      userId: customerId,
      title: '🎉 Order Delivered',
      body: 'Your order has been delivered. Enjoy your meal!',
      data: { order_id: orderId, type: 'order_delivered' },
      orderId,
    });
  }

  static async notifyCourierNewDelivery(courierUserId: string, orderId: string): Promise<void> {
    await this.send({
      userId: courierUserId,
      title: '📦 New Food Delivery',
      body: 'A new food delivery is available near you',
      data: { order_id: orderId, type: 'new_food_delivery' },
      orderId,
    });
  }
}
