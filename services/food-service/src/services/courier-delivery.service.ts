import { supabase } from '../config/database';
import { getFoodSocketService } from './food-socket.service';
import { FoodNotificationService } from './food-notification.service';
import { FoodStorageUtil } from '../utils/storage';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import logger from '../utils/logger';

/**
 * CourierDeliveryService — Phase 3
 * Handles the full courier execution flow:
 *   arrived_vendor → verify pickup_code → picked_up
 *   → arrived_delivery → verify delivery_code → delivered
 */
export class CourierDeliveryService {
  // ── Helpers ─────────────────────────────────────────────────────────────────

  private static async getOrderForCourier(orderId: string, driverId: string) {
    const { data: order } = await supabase
      .from('food_orders')
      .select('id, status, customer_id, restaurant_id, courier_id, delivery_code, total_amount, delivery_fee')
      .eq('id', orderId)
      .single();

    if (!order) throw new Error('Order not found');
    if (order.courier_id !== driverId) throw new Error('Unauthorized — not your order');
    return order;
  }

  private static emitStatusUpdate(customerId: string, orderId: string, status: string, extra?: object) {
    const socketSvc = getFoodSocketService();
    if (socketSvc) {
      socketSvc.emitToCustomer(customerId, 'food:order:status_update', {
        order_id: orderId,
        status,
        updated_at: new Date().toISOString(),
        ...extra,
      });
    }
  }

  // ── 1. Courier arrived at restaurant ────────────────────────────────────────

  static async arrivedAtVendor(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForCourier(orderId, driverId);

    if (!['accepted', 'preparing', 'ready_for_pickup'].includes(order.status)) {
      throw new Error(`Cannot mark arrived_vendor from status: ${order.status}`);
    }

    await supabase
      .from('food_orders')
      .update({ status: 'arrived_vendor', arrived_vendor_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', orderId);

    await OrderService.recordStatusChange(orderId, 'arrived_vendor', order.status, driverId, 'courier');

    this.emitStatusUpdate(order.customer_id, orderId, 'arrived_vendor', {
      message: 'Courier has arrived at the restaurant',
    });

    // Notify vendor
    const socketSvc = getFoodSocketService();
    if (socketSvc) {
      socketSvc.emitToVendor(order.restaurant_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'arrived_vendor',
      });
    }

    logger.info('Courier arrived at vendor', { orderId, driverId });
  }

  // ── 2. Verify pickup code (vendor reads code to courier, courier enters it) ──

  static async verifyPickupCode(orderId: string, driverId: string, pickupCode: string): Promise<void> {
    const order = await this.getOrderForCourier(orderId, driverId);

    if (!['arrived_vendor', 'ready_for_pickup', 'accepted', 'preparing'].includes(order.status)) {
      throw new Error(`Cannot verify pickup code from status: ${order.status}`);
    }

    // pickup_code is stored on food_orders — generated when courier was assigned
    // Vendor sees it in their app and reads it to the courier
    const { data: fullOrder } = await supabase
      .from('food_orders')
      .select('pickup_code')
      .eq('id', orderId)
      .single();

    if (!fullOrder?.pickup_code) throw new Error('No pickup code found for this order');
    if (fullOrder.pickup_code !== pickupCode) throw new Error('Invalid pickup code');

    // Mark the vendor_pickups record as verified if it exists
    await supabase
      .from('food_vendor_pickups')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('order_id', orderId);

    logger.info('Pickup code verified', { orderId, driverId });
  }

  // ── 3. Confirm pickup (order moves to picked_up) ─────────────────────────────

  static async confirmPickedUp(orderId: string, driverId: string, pickupPhotoFile?: Express.Multer.File): Promise<void> {
    const order = await this.getOrderForCourier(orderId, driverId);

    if (!['arrived_vendor', 'ready_for_pickup'].includes(order.status)) {
      throw new Error(`Cannot confirm pickup from status: ${order.status}`);
    }

    const updateData: any = {
      status: 'picked_up',
      picked_up_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Upload pickup photo if provided
    if (pickupPhotoFile) {
      const { signedUrl } = await FoodStorageUtil.uploadPhoto(pickupPhotoFile, `orders/${orderId}/pickup`);
      updateData.pickup_photo_url = signedUrl;
    }

    await supabase.from('food_orders').update(updateData).eq('id', orderId);
    await OrderService.recordStatusChange(orderId, 'picked_up', order.status, driverId, 'courier');

    this.emitStatusUpdate(order.customer_id, orderId, 'picked_up', {
      message: 'Courier has picked up your order and is on the way',
    });

    const socketSvc = getFoodSocketService();
    if (socketSvc) {
      socketSvc.emitToVendor(order.restaurant_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'picked_up',
      });
      // Emit to vendor-pickups namespace
      socketSvc.emitToPickupRoom(orderId, 'vendor_pickup:package_picked_up', { order_id: orderId });
    }

    await FoodNotificationService.send({
      userId: order.customer_id,
      title: '🛵 Order Picked Up',
      body: 'Your order is on the way!',
      data: { order_id: orderId, type: 'order_picked_up' },
      orderId,
    });

    logger.info('Order picked up by courier', { orderId, driverId });
  }

  // ── 4. Courier arrived at delivery address ───────────────────────────────────

  static async arrivedAtDelivery(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForCourier(orderId, driverId);

    if (order.status !== 'picked_up') {
      throw new Error(`Cannot mark arrived_delivery from status: ${order.status}`);
    }

    await supabase
      .from('food_orders')
      .update({ status: 'arrived_delivery', arrived_delivery_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', orderId);

    await OrderService.recordStatusChange(orderId, 'arrived_delivery', order.status, driverId, 'courier');

    this.emitStatusUpdate(order.customer_id, orderId, 'arrived_delivery', {
      message: 'Courier has arrived at your location',
    });

    await FoodNotificationService.send({
      userId: order.customer_id,
      title: '📍 Courier Arrived',
      body: 'Your courier is at your location. Please come out to collect your order.',
      data: { order_id: orderId, type: 'courier_arrived_delivery' },
      orderId,
    });

    logger.info('Courier arrived at delivery address', { orderId, driverId });
  }

  // ── 5. Verify delivery code (customer shows code to courier) ─────────────────

  static async verifyDeliveryCode(orderId: string, driverId: string, deliveryCode: string): Promise<void> {
    const order = await this.getOrderForCourier(orderId, driverId);

    if (!['picked_up', 'arrived_delivery'].includes(order.status)) {
      throw new Error(`Cannot verify delivery code from status: ${order.status}`);
    }

    if (order.delivery_code !== deliveryCode) {
      throw new Error('Invalid delivery code');
    }

    logger.info('Delivery code verified', { orderId, driverId });
  }

  // ── 6. Mark delivered ────────────────────────────────────────────────────────

  static async markDelivered(
    orderId: string,
    driverId: string,
    deliveryPhotoFile?: Express.Multer.File
  ): Promise<void> {
    const order = await this.getOrderForCourier(orderId, driverId);

    if (!['arrived_delivery', 'picked_up'].includes(order.status)) {
      throw new Error(`Cannot mark delivered from status: ${order.status}`);
    }

    const updateData: any = {
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Upload delivery photo if provided
    if (deliveryPhotoFile) {
      const { signedUrl } = await FoodStorageUtil.uploadPhoto(deliveryPhotoFile, `orders/${orderId}/delivery`);
      updateData.delivery_photo_url = signedUrl;
    }

    await supabase.from('food_orders').update(updateData).eq('id', orderId);
    await OrderService.recordStatusChange(orderId, 'delivered', order.status, driverId, 'courier');

    // Record courier earnings (ignore if already exists)
    const deliveryFee = parseFloat(order.delivery_fee);
    const { data: existingEarning } = await supabase
      .from('food_courier_earnings')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (!existingEarning) {
      await supabase.from('food_courier_earnings').insert({
        courier_id: driverId,
        order_id: orderId,
        delivery_fee: deliveryFee,
        tip_amount: 0,
        total_earned: deliveryFee,
        status: 'pending',
      });
    }

    // Notify customer + vendor
    this.emitStatusUpdate(order.customer_id, orderId, 'delivered', {
      message: 'Your order has been delivered. Enjoy your meal!',
    });

    const socketSvc = getFoodSocketService();
    if (socketSvc) {
      socketSvc.emitToVendor(order.restaurant_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'delivered',
      });
    }

    await FoodNotificationService.notifyCustomerOrderDelivered(order.customer_id, orderId);

    logger.info('Order delivered', { orderId, driverId });
  }

  // ── 7. Upload photo ──────────────────────────────────────────────────────────

  static async uploadPhoto(
    orderId: string,
    driverId: string,
    photoType: 'pickup' | 'delivery',
    file: Express.Multer.File
  ): Promise<string> {
    const order = await this.getOrderForCourier(orderId, driverId);

    const { signedUrl } = await FoodStorageUtil.uploadPhoto(file, `orders/${orderId}/${photoType}`);

    const field = photoType === 'pickup' ? 'pickup_photo_url' : 'delivery_photo_url';
    await supabase.from('food_orders').update({ [field]: signedUrl }).eq('id', orderId);

    logger.info('Photo uploaded for order', { orderId, photoType });
    return signedUrl;
  }

  // ── 8. Update real-time location ─────────────────────────────────────────────

  static async updateLocation(
    driverId: string,
    orderId: string,
    lat: number,
    lng: number,
    heading?: number,
    speed?: number
  ): Promise<void> {
    // Persist to food_courier_locations
    await supabase.from('food_courier_locations').insert({
      order_id: orderId,
      courier_id: driverId,
      latitude: lat,
      longitude: lng,
      heading: heading || null,
      speed: speed || null,
    });

    // Get customer_id and forward location
    const { data: order } = await supabase
      .from('food_orders')
      .select('customer_id')
      .eq('id', orderId)
      .single();

    if (order) {
      const socketSvc = getFoodSocketService();
      if (socketSvc) {
        socketSvc.emitToCustomer(order.customer_id, 'food:order:courier_location', {
          order_id: orderId,
          lat,
          lng,
          heading,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }
}
