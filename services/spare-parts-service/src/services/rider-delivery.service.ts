import { prisma } from '../config/database';
import { supabase } from '../config/database';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import { logger } from '../config/logger';

export class RiderDeliveryService {
  // ── GUARD: verify rider owns this order ────────────────────────────────────

  private static async getOrderForRider(orderId: string, driverId: string) {
    const order = await prisma.sparePartsOrder.findUnique({
      where:   { id: orderId },
      include: { store: { select: { ownerId: true } } },
    });
    if (!order) throw new Error('Order not found');
    if (order.riderId !== driverId) throw new Error('Unauthorized — not your order');
    return order;
  }

  // ── STATUS TRANSITIONS ──────────────────────────────────────────────────────

  static async headingToStore(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    if (order.status !== 'rider_accepted') {
      throw new Error(`Cannot mark heading_to_store from status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { status: 'heading_to_store', headingToStoreAt: new Date() },
    });

    await OrderService.recordStatusChange(
      orderId, 'heading_to_store', 'rider_accepted', driverId, 'rider'
    );

    logger.info('Rider heading to spare parts store', { orderId, driverId });
  }

  static async pickedUp(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    // Accept from rider_accepted (skipped heading_to_store) OR heading_to_store
    if (!['rider_accepted', 'heading_to_store'].includes(order.status)) {
      throw new Error(`Cannot mark picked-up from status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { status: 'shipped', shippedAt: new Date() },
    });

    await OrderService.recordStatusChange(
      orderId, 'shipped', order.status, driverId, 'rider'
    );

    logger.info('Rider confirmed pickup from spare parts store', { orderId, driverId });
  }

  static async headingToCustomer(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    if (order.status !== 'shipped') {
      throw new Error(`Cannot mark heading_to_customer from status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { status: 'heading_to_customer', headingToCustomerAt: new Date() },
    });

    await OrderService.recordStatusChange(
      orderId, 'heading_to_customer', 'shipped', driverId, 'rider'
    );

    logger.info('Rider heading to customer', { orderId, driverId });
  }

  static async arrived(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    // Accept from shipped (skipped heading_to_customer) OR heading_to_customer
    if (!['shipped', 'heading_to_customer'].includes(order.status)) {
      throw new Error(`Cannot mark arrived from status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { status: 'arrived', arrivedAt: new Date() },
    });

    await OrderService.recordStatusChange(
      orderId, 'arrived', order.status, driverId, 'rider'
    );

    logger.info('Rider arrived at customer address', { orderId, driverId });
  }

  // ── DELIVERED — triggers payouts ────────────────────────────────────────────

  static async delivered(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    if (order.status !== 'arrived') {
      throw new Error(`Cannot mark delivered from status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { status: 'delivered', deliveredAt: new Date(), paymentStatus: 'settled' },
    });

    await OrderService.recordStatusChange(
      orderId, 'delivered', 'arrived', driverId, 'rider'
    );

    const subtotal    = parseFloat(order.subtotal.toString());
    const deliveryFee = parseFloat(order.deliveryFee.toString());

    // Resolve rider user_id (driverId = drivers.id, not users.id)
    const { data: driverRow } = await supabase
      .from('drivers')
      .select('user_id')
      .eq('id', driverId)
      .single();

    const riderUserId = driverRow?.user_id ?? null;

    // ── Credit vendor (subtotal) ──
    // Wallet orders: credit now. Cash orders: vendor already received cash — no credit.
    if ((order as any).store?.ownerId && order.paymentMethod === 'wallet') {
      try {
        await WalletService.credit({
          userId:      (order as any).store.ownerId,
          amount:      subtotal,
          reference:   `sp_vendor_${orderId}_${Date.now()}`,
          description: `Spare parts order earnings — order ${orderId}`,
        });
        logger.info('Vendor credited for spare parts order', {
          orderId, vendorUserId: (order as any).store.ownerId, amount: subtotal,
        });
      } catch (err: any) {
        logger.error('Failed to credit vendor wallet (non-fatal)', {
          orderId, error: err.message,
        });
      }
    }

    // ── Credit rider (delivery fee) — applies to both wallet and cash orders ──
    if (riderUserId && deliveryFee > 0) {
      try {
        await WalletService.credit({
          userId:      riderUserId,
          amount:      deliveryFee,
          reference:   `sp_rider_${orderId}_${Date.now()}`,
          description: `Spare parts delivery fee — order ${orderId}`,
        });
        logger.info('Rider credited for spare parts delivery', {
          orderId, riderUserId, amount: deliveryFee,
        });
      } catch (err: any) {
        logger.error('Failed to credit rider wallet (non-fatal)', {
          orderId, error: err.message,
        });
      }
    }

    // ── Record rider earnings (idempotent) ────────────────────────────────────
    const existingEarning = await prisma.sparePartsRiderEarning.findFirst({
      where: { orderId },
    });
    if (!existingEarning) {
      await prisma.sparePartsRiderEarning.create({
        data: {
          riderId:     driverId,
          orderId,
          deliveryFee,
          totalEarned: deliveryFee,
          status:      'paid',
        },
      });
    } else {
      await prisma.sparePartsRiderEarning.update({
        where: { id: existingEarning.id },
        data:  { status: 'paid' },
      });
    }

    logger.info('Spare parts order delivered and payouts processed', {
      orderId, driverId, subtotal, deliveryFee,
      paymentMethod: order.paymentMethod,
    });
  }

  // ── CASH CONFIRMATION ───────────────────────────────────────────────────────
  // For cash orders only — rider confirms cash received from customer.
  // This triggers vendor wallet credit (cash orders bypass the wallet,
  // so vendor credit happens here instead of at delivery).

  static async confirmCash(orderId: string, driverId: string): Promise<void> {
    const order = await this.getOrderForRider(orderId, driverId);

    if (order.paymentMethod !== 'cash') {
      throw new Error('This endpoint is only for cash orders');
    }
    if (order.status !== 'delivered') {
      throw new Error('Order must be delivered before confirming cash payment');
    }
    if ((order as any).cashPaymentConfirmed) {
      throw new Error('Cash payment already confirmed for this order');
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data: {
        cashPaymentConfirmed:   true,
        cashPaymentConfirmedAt: new Date(),
        paymentStatus:          'completed',
      },
    });

    await OrderService.recordStatusChange(
      orderId, 'cash_payment_confirmed', 'delivered', driverId, 'rider',
      'Rider confirmed cash payment received from customer'
    );

    // Credit vendor for cash orders now that cash is confirmed
    if ((order as any).store?.ownerId) {
      const subtotal = parseFloat(order.subtotal.toString());
      try {
        await WalletService.credit({
          userId:      (order as any).store.ownerId,
          amount:      subtotal,
          reference:   `sp_vendor_cash_${orderId}_${Date.now()}`,
          description: `Spare parts cash order earnings — order ${orderId}`,
        });
        logger.info('Vendor credited for cash spare parts order after rider confirmation', {
          orderId, amount: subtotal,
        });
      } catch (err: any) {
        logger.error('Failed to credit vendor for cash order (non-fatal)', {
          orderId, error: err.message,
        });
      }
    }

    logger.info('Cash payment confirmed for spare parts order', { orderId, driverId });
  }

  // ── LOCATION UPDATE ─────────────────────────────────────────────────────────

  static async updateLocation(
    driverId: string,
    orderId:  string,
    lat:      number,
    lng:      number,
    heading?: number,
    speed?:   number
  ): Promise<void> {
    await prisma.sparePartsRiderLocation.create({
      data: {
        orderId,
        riderId:  driverId,
        latitude: lat,
        longitude: lng,
        heading: heading ?? null,
        speed:   speed   ?? null,
      },
    });

    logger.info('Spare parts rider location updated', { orderId, driverId, lat, lng });
  }

  // ── GET AVAILABLE ORDERS (rider poll) ──────────────────────────────────────

  static async getAvailableOrders(driverId: string) {
    const { data: orders } = await supabase
      .from('spare_parts_orders')
      .select(`
        id, status, delivery_fee, total_amount, delivery_address,
        vehicle_type, created_at, customer_id,
        store:spare_parts_stores(id, name, address, latitude, longitude)
      `)
      .eq('status', 'searching_rider')
      .not('excluded_rider_ids', 'cs', `{${driverId}}`);

    const orderList = orders || [];

    // Enrich with customer name
    const customerIds = [...new Set(orderList.map((o: any) => o.customer_id).filter(Boolean))];
    const customerMap = new Map<string, { name: string; phone: string | null }>();

    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', customerIds);

      for (const u of users ?? []) {
        customerMap.set(u.id, {
          name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Customer',
          phone: u.phone ?? null,
        });
      }
    }

    return orderList.map((o: any) => ({
      ...o,
      customer: customerMap.get(o.customer_id) ?? null,
    }));
  }

  // ── GET ACTIVE ORDERS ───────────────────────────────────────────────────────

  static async getActiveOrders(driverId: string) {
    const activeStatuses = [
      'rider_accepted', 'heading_to_store', 'shipped',
      'heading_to_customer', 'arrived',
    ];

    const orders = await prisma.sparePartsOrder.findMany({
      where: {
        riderId: driverId,
        status:  { in: activeStatuses },
      },
      include: {
        store:      { select: { id: true, name: true, address: true, phone: true, latitude: true, longitude: true } },
        orderItems: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (orders.length === 0) return orders;

    // Enrich customer details
    const customerIds = [...new Set(orders.map((o: { customerId: string }) => o.customerId).filter(Boolean))];
    const customerMap = new Map<string, { name: string; phone: string | null }>();

    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', customerIds);

      for (const u of users ?? []) {
        customerMap.set(u.id, {
          name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Customer',
          phone: u.phone ?? null,
        });
      }
    }

    return orders.map((o: typeof orders[number]) => ({
      ...o,
      customer: customerMap.get(o.customerId) ?? null,
    }));
  }

  // ── GET HISTORY ─────────────────────────────────────────────────────────────

  static async getHistory(
    driverId: string,
    params: {
      status?:    string;
      date_from?: string;
      date_to?:   string;
      limit?:     number;
      page?:      number;
    }
  ) {
    const limit  = params.limit  || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const where: any = { riderId: driverId };

    if (params.status) {
      where.status = params.status;
    } else {
      where.status = { in: ['delivered', 'cancelled'] };
    }
    if (params.date_from) {
      where.createdAt = { ...where.createdAt, gte: new Date(params.date_from) };
    }
    if (params.date_to) {
      where.createdAt = { ...where.createdAt, lte: new Date(params.date_to) };
    }

    const [orders, total] = await Promise.all([
      prisma.sparePartsOrder.findMany({
        where,
        skip:    offset,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: {
          store:      { select: { id: true, name: true } },
          orderItems: true,
        },
      }),
      prisma.sparePartsOrder.count({ where }),
    ]);

    return { orders, total, page: params.page || 1, limit };
  }

  // ── GET EARNINGS ─────────────────────────────────────────────────────────────

  static async getEarnings(
    driverId: string,
    params: { date_from?: string; date_to?: string }
  ) {
    const where: any = { riderId: driverId };
    if (params.date_from) {
      where.createdAt = { ...where.createdAt, gte: new Date(params.date_from) };
    }
    if (params.date_to) {
      where.createdAt = { ...where.createdAt, lte: new Date(params.date_to) };
    }

    const earnings = await prisma.sparePartsRiderEarning.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const total = earnings.reduce(
      (acc: number, e: { totalEarned: any }) => acc + parseFloat(e.totalEarned.toString()), 0
    );

    return {
      total_deliveries: earnings.length,
      total_earned:     total,
      earnings,
    };
  }
}
