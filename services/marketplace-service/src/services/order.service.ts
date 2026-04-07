import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { WalletService } from './wallet.service';
import { FareService } from './fare.service';
import logger from '../utils/logger';

interface PlaceOrderParams {
  customerId: string;
  storeId: string;
  items: Array<{ product_id: string; quantity: number; special_instructions?: string }>;
  deliveryAddress: { address: string; lat: number; lng: number; label?: string };
  paymentMethod: 'wallet';
  specialInstructions?: string;
}

export class OrderService {
  static async estimateTotal(params: {
    storeId: string;
    items: Array<{ product_id: string; quantity: number }>;
    deliveryAddress: { lat: number; lng: number };
  }) {
    const store = await prisma.marketplaceStore.findUnique({ where: { id: params.storeId } });
    if (!store) throw new Error('Store not found');

    const productIds = params.items.map((i) => i.product_id);
    const products = await prisma.marketplaceProduct.findMany({ where: { id: { in: productIds } } });

    let subtotal = 0;
    for (const reqItem of params.items) {
      const product = products.find((p) => p.id === reqItem.product_id);
      if (!product) throw new Error(`Product ${reqItem.product_id} not found`);
      subtotal += parseFloat(product.price.toString()) * reqItem.quantity;
    }

    const fare = await FareService.calculateFare({
      storeLat: parseFloat(store.latitude.toString()),
      storeLng: parseFloat(store.longitude.toString()),
      deliveryLat: params.deliveryAddress.lat,
      deliveryLng: params.deliveryAddress.lng,
    });

    return {
      subtotal,
      delivery_fee: fare.deliveryFee,
      service_fee: fare.serviceFee,
      total_amount: subtotal + fare.deliveryFee + fare.serviceFee,
      distance_km: fare.distanceKm,
      distance_text: fare.distanceText,
      currency_code: fare.currencyCode,
    };
  }

  static async placeOrder(params: PlaceOrderParams) {
    const { customerId, storeId, items, deliveryAddress, paymentMethod, specialInstructions } = params;

    if (!items || items.length === 0) throw new Error('Order must contain at least one item');

    const store = await prisma.marketplaceStore.findUnique({ where: { id: storeId } });
    if (!store) throw new Error('Store not found');
    if (!store.isActive) throw new Error('Store is not active');
    if (!store.isOpen) throw new Error('Store is currently closed');

    const storeLat = parseFloat(store.latitude.toString());
    const storeLng = parseFloat(store.longitude.toString());
    if (!storeLat || !storeLng || storeLat === 0 || storeLng === 0) {
      throw new Error('Store location is not configured. Please contact support.');
    }

    // Validate products
    const productIds = items.map((i) => i.product_id);
    const products = await prisma.marketplaceProduct.findMany({
      where: { id: { in: productIds } },
    });

    for (const reqItem of items) {
      const product = products.find((p) => p.id === reqItem.product_id);
      if (!product) throw new Error(`Product ${reqItem.product_id} not found`);
      if (product.storeId !== storeId) throw new Error('Product does not belong to this store');
      if (!product.isActive || !product.isAvailable) throw new Error(`Product "${product.name}" is not available`);
    }

    // Calculate totals
    let subtotal = 0;
    const orderItemsData: any[] = [];
    for (const reqItem of items) {
      const product = products.find((p) => p.id === reqItem.product_id)!;
      const itemTotal = parseFloat(product.price.toString()) * reqItem.quantity;
      subtotal += itemTotal;
      orderItemsData.push({
        productId: reqItem.product_id,
        productName: product.name,
        productPrice: product.price,
        quantity: reqItem.quantity,
        subtotal: itemTotal,
      });
    }

    const fare = await FareService.calculateFare({
      storeLat, storeLng,
      deliveryLat: deliveryAddress.lat,
      deliveryLng: deliveryAddress.lng,
    });

    const totalAmount = subtotal + fare.deliveryFee + fare.serviceFee;

    // Wallet payment
    const balanceBefore = await WalletService.getBalance(customerId);
    if (balanceBefore < totalAmount) {
      throw new Error(`Insufficient wallet balance. Required: ₦${totalAmount.toFixed(2)}, Available: ₦${balanceBefore.toFixed(2)}`);
    }

    const txRef = `mkt_order_${Date.now()}_${uuidv4().substring(0, 8)}`;
    const { transactionId: walletTxId, newBalance: balanceAfter } = await WalletService.deduct({
      userId: customerId,
      amount: totalAmount,
      reference: txRef,
      description: `Marketplace order at ${store.name}`,
    });

    // Create order
    const order = await prisma.marketplaceOrder.create({
      data: {
        customerId,
        storeId,
        status: 'pending',
        paymentMethod,
        paymentStatus: 'paid',
        subtotal,
        deliveryFee: fare.deliveryFee,
        serviceFee: fare.serviceFee,
        totalAmount,
        deliveryAddress: deliveryAddress as any,
        specialInstructions: specialInstructions || null,
        walletTransactionId: walletTxId,
        walletBalanceBefore: balanceBefore,
        walletBalanceAfter: balanceAfter,
        orderItems: {
          create: orderItemsData,
        },
      },
      include: { orderItems: true },
    });

    await this.recordStatusChange(order.id, 'pending', null, customerId, 'customer');

    // Clear customer cart for this store
    const cart = await prisma.marketplaceCart.findFirst({ where: { userId: customerId, storeId } });
    if (cart) {
      await prisma.marketplaceCartItem.deleteMany({ where: { cartId: cart.id } });
      await prisma.marketplaceCart.delete({ where: { id: cart.id } });
    }

    // 10-minute pending expiry
    const PENDING_EXPIRY_MS = 10 * 60 * 1000;
    setTimeout(async () => {
      try {
        const current = await prisma.marketplaceOrder.findUnique({
          where: { id: order.id },
          select: { status: true, paymentStatus: true, paymentMethod: true, totalAmount: true, customerId: true },
        });
        if (!current || current.status !== 'pending') return;

        await prisma.marketplaceOrder.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            cancellationReason: 'Order expired — vendor did not respond in time',
            cancelledBy: 'system',
            cancelledAt: new Date(),
          },
        });
        await this.recordStatusChange(order.id, 'cancelled', 'pending', 'system', 'system', 'Order expired — vendor did not respond in time');

        if (current.paymentStatus === 'paid' && current.paymentMethod === 'wallet') {
          await WalletService.credit({
            userId: current.customerId,
            amount: parseFloat(current.totalAmount.toString()),
            reference: `refund_expired_${order.id}_${Date.now()}`,
            description: 'Refund: marketplace order expired — vendor did not respond',
          });
          await prisma.marketplaceOrder.update({ where: { id: order.id }, data: { paymentStatus: 'refunded' } });
        }

        logger.info('Marketplace order auto-cancelled due to vendor inactivity', { orderId: order.id });
      } catch (err: any) {
        logger.error('Failed to auto-cancel expired marketplace order', { orderId: order.id, error: err.message });
      }
    }, PENDING_EXPIRY_MS);

    logger.info('Marketplace order placed', { orderId: order.id, customerId, totalAmount });
    return { ...order, fare_breakdown: { subtotal, delivery_fee: fare.deliveryFee, service_fee: fare.serviceFee, total_amount: totalAmount, distance_km: fare.distanceKm, distance_text: fare.distanceText, currency_code: fare.currencyCode } };
  }

  static async getOrder(orderId: string, requesterId: string, requesterRole: 'customer' | 'vendor') {
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: {
        store: { select: { id: true, name: true, logoUrl: true, phone: true, address: true } },
        orderItems: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) return null;
    if (requesterRole === 'customer' && order.customerId !== requesterId) return null;
    return order;
  }

  static async getCustomerHistory(params: { customerId: string; status?: string; limit?: number; page?: number }) {
    const limit = params.limit || 10;
    const offset = ((params.page || 1) - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where: { customerId: params.customerId, ...(params.status && { status: params.status }) },
        include: {
          store: { select: { id: true, name: true, logoUrl: true } },
          orderItems: { select: { id: true, productName: true, quantity: true, productPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.marketplaceOrder.count({ where: { customerId: params.customerId, ...(params.status && { status: params.status }) } }),
    ]);

    return { orders, total, page: params.page || 1, limit, totalPages: Math.ceil(total / limit) };
  }

  static async cancelOrder(orderId: string, customerId: string, reason: string) {
    const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.customerId !== customerId) throw new Error('Unauthorized');
    if (!['pending', 'in_progress', 'searching_rider'].includes(order.status)) {
      throw new Error(`Cannot cancel order in status: ${order.status}`);
    }

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'cancelled', cancellationReason: reason, cancelledBy: 'customer', cancelledAt: new Date() },
    });
    await this.recordStatusChange(orderId, 'cancelled', order.status, customerId, 'customer', reason);

    if (order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      await WalletService.credit({
        userId: customerId,
        amount: parseFloat(order.totalAmount.toString()),
        reference: `refund_cancel_${orderId}_${Date.now()}`,
        description: 'Refund: marketplace order cancelled',
      });
      await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { paymentStatus: 'refunded' } });
    }

    return { success: true, message: 'Order cancelled and refund processed' };
  }

  static async recordStatusChange(orderId: string, newStatus: string, previousStatus: string | null, changedBy: string, changedByRole: string, notes?: string) {
    await prisma.marketplaceOrderStatusHistory.create({
      data: { orderId, status: newStatus, previousStatus, changedBy, changedByRole, notes: notes || null },
    });
  }
}
