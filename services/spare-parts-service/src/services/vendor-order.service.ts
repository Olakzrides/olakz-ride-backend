import { prisma } from '../config/database';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import { SparePartsMatchingService } from './spare-parts-matching.service';
import { logger } from '../config/logger';

export class VendorOrderService {
  // ─────────────────────────────────────────────────────────────────
  // LIST ORDERS  (vendor sees orders for their store only)
  // ─────────────────────────────────────────────────────────────────

  static async listOrders(
    storeId: string,
    params: {
      status?: string;
      limit?:  number;
      page?:   number;
    }
  ) {
    const limit  = params.limit  || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const where = {
      storeId,
      ...(params.status && { status: params.status }),
    };

    const [orders, total] = await Promise.all([
      prisma.sparePartsOrder.findMany({
        where,
        include: {
          orderItems: {
            select: {
              id: true, productName: true, quantity: true, productPrice: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip:    offset,
        take:    limit,
      }),
      prisma.sparePartsOrder.count({ where }),
    ]);

    return {
      orders,
      total,
      page:       params.page || 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // GET SINGLE ORDER
  // ─────────────────────────────────────────────────────────────────

  static async getOrder(orderId: string, storeId: string) {
    const order = await prisma.sparePartsOrder.findFirst({
      where:   { id: orderId, storeId },
      include: {
        orderItems:    true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) return null;
    return order;
  }

  // ─────────────────────────────────────────────────────────────────
  // ACCEPT ORDER  pending → in_progress
  // ─────────────────────────────────────────────────────────────────

  static async acceptOrder(orderId: string, storeId: string) {
    const order = await prisma.sparePartsOrder.findFirst({
      where: { id: orderId, storeId },
    });
    if (!order) throw new Error('Order not found');
    if (order.status !== 'pending') {
      throw new Error(`Cannot accept order with status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data: {
        status:     'in_progress',
        acceptedAt: new Date(),
      },
    });

    await OrderService.recordStatusChange(
      orderId, 'in_progress', 'pending', storeId, 'vendor',
      'Vendor accepted the order'
    );

    logger.info('Spare parts order accepted by vendor', { orderId, storeId });
    return { success: true, message: 'Order accepted' };
  }

  // ─────────────────────────────────────────────────────────────────
  // REJECT ORDER  pending → cancelled + auto-refund
  // ─────────────────────────────────────────────────────────────────

  static async rejectOrder(orderId: string, storeId: string, reason: string) {
    const order = await prisma.sparePartsOrder.findFirst({
      where: { id: orderId, storeId },
    });
    if (!order) throw new Error('Order not found');
    if (order.status !== 'pending') {
      throw new Error(`Cannot reject order with status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data: {
        status:           'cancelled',
        rejectionReason:  reason,
        cancelledBy:      'vendor',
        cancelledAt:      new Date(),
      },
    });

    await OrderService.recordStatusChange(
      orderId, 'cancelled', 'pending', storeId, 'vendor', reason
    );

    // Refund wallet orders — cash was never charged
    if (order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      try {
        await WalletService.refundToBuckets({
          userId:        order.customerId,
          cashPortion:   parseFloat((order as any).walletCashPortion?.toString()  ?? order.totalAmount.toString()),
          promoPortion:  parseFloat((order as any).walletPromoPortion?.toString() ?? '0'),
          baseReference: `refund_reject_${orderId}`,
          description:   'Refund: spare parts order rejected by vendor',
        });
        await prisma.sparePartsOrder.update({
          where: { id: orderId },
          data:  { paymentStatus: 'refunded' },
        });
      } catch (err: any) {
        logger.error('Failed to refund rejected spare parts order', {
          orderId, error: err.message,
        });
      }
    }

    logger.info('Spare parts order rejected by vendor', { orderId, storeId, reason });
    return { success: true, message: 'Order rejected and customer refunded' };
  }

  // ─────────────────────────────────────────────────────────────────
  // MARK READY  in_progress → ready_for_pickup
  // Triggers rider dispatch (Phase 4 — logged as TODO for now)
  // ─────────────────────────────────────────────────────────────────

  static async markReady(orderId: string, storeId: string) {
    const order = await prisma.sparePartsOrder.findFirst({
      where: { id: orderId, storeId },
    });
    if (!order) throw new Error('Order not found');
    if (order.status !== 'in_progress') {
      throw new Error(`Cannot mark ready from status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data: {
        status:  'ready_for_pickup',
        readyAt: new Date(),
      },
    });

    await OrderService.recordStatusChange(
      orderId, 'ready_for_pickup', 'in_progress', storeId, 'vendor',
      'Order packed and ready for pickup'
    );

    logger.info('Spare parts order marked ready for pickup — triggering rider search', {
      orderId, storeId,
    });

    // Trigger rider dispatch — non-blocking, errors are logged inside the service
    SparePartsMatchingService.startRiderSearch(orderId).catch((err: any) => {
      logger.error('Failed to start rider search after markReady', {
        orderId, error: err.message,
      });
    });

    return { success: true, message: 'Order marked as ready for pickup' };
  }
}
