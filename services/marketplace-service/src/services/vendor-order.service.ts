import { prisma, supabase } from '../config/database';
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

    // Fetch customer names + avatar from Supabase users table
    const customerIds = [...new Set(orders.map((o) => o.customerId))];
    let customerMap: Record<string, { firstName: string | null; lastName: string | null; phone: string | null; avatarUrl: string | null }> = {};

    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone, avatar_url')
        .in('id', customerIds);

      if (users) {
        for (const u of users) {
          customerMap[u.id] = { firstName: u.first_name, lastName: u.last_name, phone: u.phone, avatarUrl: u.avatar_url };
        }
      }
    }

    // Fetch product images for all order items
    const productIds = [...new Set(orders.flatMap((o) => o.orderItems.map((i: any) => i.productId)).filter(Boolean))];
    let productImageMap: Record<string, string | null> = {};

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('marketplace_products')
        .select('id, images')
        .in('id', productIds);

      if (products) {
        for (const p of products) {
          // images is an array; use the first one as the primary image
          const firstImage = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
          productImageMap[p.id] = firstImage;
        }
      }
    }

    // Fetch rider info (name, phone, photo) for assigned orders
    const riderIds = [...new Set(orders.map((o) => o.riderId).filter(Boolean) as string[])];
    let riderMap: Record<string, { name: string; phone: string | null; photo: string | null }> = {};

    if (riderIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, user_id')
        .in('id', riderIds);

      if (drivers && drivers.length > 0) {
        const riderUserIds = drivers.map((d: any) => d.user_id).filter(Boolean);
        const { data: riderUsers } = await supabase
          .from('users')
          .select('id, first_name, last_name, phone, avatar_url')
          .in('id', riderUserIds);

        // Map driver.id → user info
        const userById = new Map((riderUsers ?? []).map((u: any) => [u.id, u]));
        for (const driver of drivers) {
          const u = userById.get(driver.user_id);
          if (u) {
            riderMap[driver.id] = {
              name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Rider',
              phone: u.phone ?? null,
              photo: u.avatar_url ?? null,
            };
          }
        }
      }
    }

    const ordersWithCustomer = orders.map((o) => ({
      ...o,
      orderItems: o.orderItems.map((item: any) => ({
        ...item,
        productImage: productImageMap[item.productId] ?? null,
      })),
      customer: customerMap[o.customerId]
        ? {
            firstName: customerMap[o.customerId].firstName,
            lastName: customerMap[o.customerId].lastName,
            fullName: [customerMap[o.customerId].firstName, customerMap[o.customerId].lastName].filter(Boolean).join(' ') || null,
            phone: customerMap[o.customerId].phone,
            photo: customerMap[o.customerId].avatarUrl,
          }
        : null,
      rider: o.riderId ? (riderMap[o.riderId] ?? null) : null,
    }));

    return { orders: ordersWithCustomer, total, page: params.page || 1, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getOrder(orderId: string, storeId: string) {
    const order = await prisma.marketplaceOrder.findFirst({
      where: { id: orderId, storeId },
      include: { orderItems: true, statusHistory: { orderBy: { createdAt: 'asc' } } },
    });

    if (!order) return null;

    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name, phone, avatar_url')
      .eq('id', order.customerId)
      .limit(1);

    const user = users?.[0];

    // Fetch product images for order items
    const productIds = order.orderItems.map((i: any) => i.productId).filter(Boolean);
    let productImageMap: Record<string, string | null> = {};

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('marketplace_products')
        .select('id, images')
        .in('id', productIds);

      if (products) {
        for (const p of products) {
          const firstImage = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
          productImageMap[p.id] = firstImage;
        }
      }
    }

    return {
      ...order,
      orderItems: order.orderItems.map((item: any) => ({
        ...item,
        productImage: productImageMap[item.productId] ?? null,
      })),
      customer: user
        ? {
            firstName: user.first_name,
            lastName: user.last_name,
            fullName: [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
            phone: user.phone,
            photo: user.avatar_url ?? null,
          }
        : null,
      rider: await (async () => {
        if (!order.riderId) return null;
        const { data: driverRow } = await supabase
          .from('drivers').select('user_id').eq('id', order.riderId).single();
        if (!driverRow?.user_id) return null;
        const { data: riderUser } = await supabase
          .from('users').select('first_name, last_name, phone, avatar_url')
          .eq('id', driverRow.user_id).single();
        if (!riderUser) return null;
        return {
          name:  `${riderUser.first_name ?? ''} ${riderUser.last_name ?? ''}`.trim() || 'Rider',
          phone: riderUser.phone ?? null,
          photo: riderUser.avatar_url ?? null,
        };
      })(),
    };
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

    // Refund customer — route back to correct buckets using stored portions
    if (order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      const o = order as any;
      const cashPortion  = parseFloat((o.walletCashPortion  ?? order.totalAmount).toString());
      const promoPortion = parseFloat((o.walletPromoPortion ?? 0).toString());
      await WalletService.refundToBuckets({
        userId:        order.customerId,
        cashPortion,
        promoPortion,
        baseReference: `refund_rejected_${orderId}`,
        description:   'Refund: marketplace order rejected by vendor',
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
