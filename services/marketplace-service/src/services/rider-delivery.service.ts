import { prisma } from '../config/database';
import { supabase } from '../config/database';
import { OrderService } from './order.service';
import { emitToCustomer, emitToVendor } from './socket.service';
import logger from '../utils/logger';

export class RiderDeliveryService {
  private static async getOrderForRider(orderId: string, driverId: string) {
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { store: { select: { ownerId: true } } },
    });
    if (!order) throw new Error('Order not found');
    if (order.riderId !== driverId) throw new Error('Unauthorized — not your order');
    return order;
  }

  static async pickedUp(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    if (order.status !== 'rider_accepted') {
      throw new Error(`Cannot mark picked-up from status: ${order.status}`);
    }

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'shipped', shippedAt: new Date() },
    });

    await OrderService.recordStatusChange(orderId, 'shipped', 'rider_accepted', driverId, 'rider');

    emitToCustomer(order.customerId, 'marketplace:order:status_update', {
      order_id: orderId,
      status: 'shipped',
      message: 'Your order has been picked up and is on the way',
    });

    logger.info('Rider confirmed pickup from vendor', { orderId, driverId });
  }

  static async arrived(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    if (order.status !== 'shipped') {
      throw new Error(`Cannot mark arrived from status: ${order.status}`);
    }

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'arrived', arrivedAt: new Date() },
    });

    await OrderService.recordStatusChange(orderId, 'arrived', 'shipped', driverId, 'rider');

    emitToCustomer(order.customerId, 'marketplace:order:status_update', {
      order_id: orderId,
      status: 'arrived',
      message: 'Your rider is at your location',
    });

    logger.info('Rider arrived at customer address', { orderId, driverId });
  }

  static async delivered(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    if (order.status !== 'arrived') {
      throw new Error(`Cannot mark delivered from status: ${order.status}`);
    }

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'delivered', deliveredAt: new Date() },
    });

    await OrderService.recordStatusChange(orderId, 'delivered', 'arrived', driverId, 'rider');

    // Record rider earnings
    const deliveryFee = parseFloat(order.deliveryFee.toString());
    const existing = await prisma.marketplaceRiderEarning.findFirst({ where: { orderId } });
    if (!existing) {
      await prisma.marketplaceRiderEarning.create({
        data: { riderId: driverId, orderId, deliveryFee, totalEarned: deliveryFee, status: 'pending' },
      });
    }

    emitToCustomer(order.customerId, 'marketplace:order:status_update', {
      order_id: orderId,
      status: 'delivered',
      message: 'Your order has been delivered!',
    });

    if (order.store) {
      emitToVendor(order.store.ownerId, 'marketplace:order:delivered', { order_id: orderId });
    }

    logger.info('Marketplace order delivered', { orderId, driverId });
  }

  static async updateLocation(driverId: string, orderId: string, lat: number, lng: number, heading?: number, speed?: number): Promise<void> {
    await prisma.marketplaceRiderLocation.create({
      data: { orderId, riderId: driverId, latitude: lat, longitude: lng, heading: heading || null, speed: speed || null },
    });

    const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (order) {
      emitToCustomer(order.customerId, 'marketplace:order:rider_location', {
        order_id: orderId,
        lat,
        lng,
        heading,
        updated_at: new Date().toISOString(),
      });
    }
  }

  static async getAvailableOrders(driverId: string) {
    const { data: orders } = await supabase
      .from('marketplace_orders')
      .select(`
        id, status, delivery_fee, total_amount, delivery_address, created_at,
        store:marketplace_stores(id, name, address, latitude, longitude)
      `)
      .eq('status', 'searching_rider')
      .not('excluded_rider_ids', 'cs', `{${driverId}}`);

    return orders || [];
  }

  static async getActiveOrders(driverId: string) {
    return prisma.marketplaceOrder.findMany({
      where: { riderId: driverId, status: { in: ['rider_accepted', 'shipped', 'arrived'] } },
      include: { store: { select: { id: true, name: true, address: true, phone: true } }, orderItems: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  static async getTracking(orderId: string) {
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: {
        statusHistory: { orderBy: { createdAt: 'asc' } },
        riderLocations: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!order) return null;

    let riderInfo = null;
    if (order.riderId) {
      const { data: driver } = await supabase
        .from('drivers')
        .select('id, user_id, rating, vehicles:driver_vehicles(manufacturer, model, color, plate_number)')
        .eq('id', order.riderId)
        .single();
      riderInfo = driver;
    }

    const latestLocation = order.riderLocations[0];

    return {
      order_id: orderId,
      status: order.status,
      status_history: order.statusHistory.map((h) => ({ status: h.status, timestamp: h.createdAt })),
      rider: riderInfo,
      rider_location: latestLocation
        ? { lat: parseFloat(latestLocation.latitude.toString()), lng: parseFloat(latestLocation.longitude.toString()), updated_at: latestLocation.createdAt }
        : null,
    };
  }

  static async getReceipt(orderId: string) {
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order) return null;

    const shortId = `OLK${orderId.replace(/-/g, '').substring(0, 8).toUpperCase()}`;

    return {
      order_id: shortId,
      date: order.createdAt,
      items: order.orderItems.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        price: parseFloat(i.productPrice.toString()),
      })),
      subtotal: parseFloat(order.subtotal.toString()),
      delivery_fee: parseFloat(order.deliveryFee.toString()),
      service_fee: parseFloat(order.serviceFee.toString()),
      total_amount: parseFloat(order.totalAmount.toString()),
      payment_method: order.paymentMethod,
      delivery_address: order.deliveryAddress,
    };
  }
}
