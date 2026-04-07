import { prisma } from '../config/database';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import { MarketplaceMatchingService } from './marketplace-matching.service';
import logger from '../utils/logger';

export class VendorOrderService {
  static async getOrders(storeId: string, params: { status?: string; dateFrom?: string; dateTo?: string; limit?: number; page?: number }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where: {
          storeId,
          ...(params.status && { status: params.status }),
          ...(params.dateFrom && { createdAt: { gte: new Date(params.dateFrom) } }),
          ...(params.dateTo && { createdAt: { lte: new Date(params.dateTo) } }),
        },
        include: { orderItems: true },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.marketplaceOrder.count({ where: { storeId, ...(params.status && { status: params.status }) } }),
    ]);

    return { orders, total, page: params.page || 1, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getOrder(orderId: string, storeId: string) {
    return prisma.marketplaceOrder.findFirst({
      where: { id: orderId, storeId },
      include: { orderItems: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });
  }

  static async acceptOrder(orderId: string, storeId: string, vendorId: string) {
    const order = await prisma.marketplaceOrder.findFirst({ where: { id: orderId, storeId } });
    if (!order) throw new Error('Order not found');
    if (order.status !== 'pending') throw new Error(`Cannot accept order in status: ${order.status}`);

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'in_progress', acceptedAt: new Date() },
    });
    await OrderService.recordStatusChange(orderId, 'in_progress', 'pending', vendorId, 'vendor');
    logger.info('Marketplace order accepted', { orderId, storeId });
    return { success: true };
  }

  static async rejectOrder(orderId: string, storeId: string, vendorId: string, rejectionReason: string) {
    const order = await prisma.marketplaceOrder.findFirst({ where: { id: orderId, storeId } });
    if (!order) throw new Error('Order not found');
    if (order.status !== 'pending') throw new Error(`Cannot reject order in status: ${order.status}`);

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'cancelled', rejectionReason, cancelledBy: 'vendor', cancelledAt: new Date() },
    });
    await OrderService.recordStatusChange(orderId, 'cancelled', 'pending', vendorId, 'vendor', rejectionReason);

    // Refund customer
    if (order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      await WalletService.credit({
        userId: order.customerId,
        amount: parseFloat(order.totalAmount.toString()),
        reference: `refund_rejected_${orderId}_${Date.now()}`,
        description: 'Refund: marketplace order rejected by vendor',
      });
      await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { paymentStatus: 'refunded' } });
    }

    logger.info('Marketplace order rejected', { orderId, storeId });
    return { success: true };
  }

  static async markReady(orderId: string, storeId: string, vendorId: string) {
    const order = await prisma.marketplaceOrder.findFirst({ where: { id: orderId, storeId } });
    if (!order) throw new Error('Order not found');
    if (order.status !== 'in_progress') throw new Error(`Cannot mark ready from status: ${order.status}`);

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'ready_for_pickup', readyAt: new Date() },
    });
    await OrderService.recordStatusChange(orderId, 'ready_for_pickup', 'in_progress', vendorId, 'vendor');

    // Auto-trigger rider search
    MarketplaceMatchingService.startRiderSearch(orderId).catch((err) =>
      logger.error('Failed to start rider search for marketplace order', { orderId, error: err.message })
    );

    logger.info('Marketplace order marked ready for pickup', { orderId, storeId });
    return { success: true };
  }
}
