import { prisma } from '../config/database';

export class AnalyticsService {
  // ── Vendor ──────────────────────────────────────────────────────────────────

  static async vendorDashboard(storeId: string) {
    const store = await prisma.marketplaceStore.findUnique({
      where: { id: storeId },
      select: { name: true, averageRating: true, totalRatings: true },
    });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [todayOrders, monthOrders, lastMonthOrders, pendingCount] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where: { storeId, createdAt: { gte: todayStart }, status: { not: 'cancelled' } },
        select: { totalAmount: true, status: true },
      }),
      prisma.marketplaceOrder.findMany({
        where: { storeId, createdAt: { gte: monthStart }, status: { not: 'cancelled' } },
        select: { totalAmount: true, status: true },
      }),
      prisma.marketplaceOrder.findMany({
        where: { storeId, createdAt: { gte: lastMonthStart, lte: lastMonthEnd }, status: { not: 'cancelled' } },
        select: { totalAmount: true, status: true },
      }),
      prisma.marketplaceOrder.count({ where: { storeId, status: 'pending' } }),
    ]);

    const sum = (orders: { totalAmount: any }[]) =>
      orders.reduce((acc, o) => acc + parseFloat(o.totalAmount.toString()), 0);

    return {
      store_name: store?.name,
      average_rating: store?.averageRating,
      total_ratings: store?.totalRatings,
      today: { orders: todayOrders.length, revenue: sum(todayOrders) },
      this_month: {
        orders: monthOrders.length,
        revenue: sum(monthOrders),
        completed: monthOrders.filter((o) => o.status === 'delivered').length,
        cancelled: monthOrders.filter((o) => o.status === 'cancelled').length,
      },
      last_month: { orders: lastMonthOrders.length, revenue: sum(lastMonthOrders) },
      pending_orders: pendingCount,
    };
  }

  static async vendorOrdersByDate(storeId: string, dateFrom?: string, dateTo?: string) {
    const where: any = { storeId, status: { not: 'cancelled' } };
    if (dateFrom) where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) };
    if (dateTo) where.createdAt = { ...where.createdAt, lte: new Date(dateTo) };

    const orders = await prisma.marketplaceOrder.findMany({
      where,
      select: { createdAt: true, totalAmount: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const byDate: Record<string, { orders: number; revenue: number }> = {};
    for (const o of orders) {
      const date = o.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { orders: 0, revenue: 0 };
      byDate[date].orders++;
      byDate[date].revenue += parseFloat(o.totalAmount.toString());
    }

    return Object.entries(byDate).map(([date, data]) => ({ date, ...data }));
  }

  static async vendorEarnings(storeId: string, dateFrom?: string, dateTo?: string) {
    const where: any = { storeId, status: 'delivered' };
    if (dateFrom) where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) };
    if (dateTo) where.createdAt = { ...where.createdAt, lte: new Date(dateTo) };

    const orders = await prisma.marketplaceOrder.findMany({
      where,
      select: { subtotal: true, deliveryFee: true, totalAmount: true, createdAt: true },
    });

    const totalSubtotal = orders.reduce((acc, o) => acc + parseFloat(o.subtotal.toString()), 0);
    const totalDeliveryFee = orders.reduce((acc, o) => acc + parseFloat(o.deliveryFee.toString()), 0);

    return {
      total_orders: orders.length,
      vendor_earnings: totalSubtotal,   // vendor keeps subtotal
      delivery_fees: totalDeliveryFee,  // Olakz keeps delivery fee
      total_revenue: totalSubtotal,
    };
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  static async adminAnalytics(dateFrom?: string, dateTo?: string) {
    const where: any = { status: { not: 'cancelled' } };
    if (dateFrom) where.createdAt = { ...where.createdAt, gte: new Date(dateFrom) };
    if (dateTo) where.createdAt = { ...where.createdAt, lte: new Date(dateTo) };

    const [orders, totalStores, activeStores] = await Promise.all([
      prisma.marketplaceOrder.findMany({ where, select: { createdAt: true, totalAmount: true } }),
      prisma.marketplaceStore.count(),
      prisma.marketplaceStore.count({ where: { isActive: true } }),
    ]);

    const totalRevenue = orders.reduce((acc, o) => acc + parseFloat(o.totalAmount.toString()), 0);

    const byDate: Record<string, { orders: number; revenue: number }> = {};
    for (const o of orders) {
      const date = o.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { orders: 0, revenue: 0 };
      byDate[date].orders++;
      byDate[date].revenue += parseFloat(o.totalAmount.toString());
    }

    return {
      total_orders: orders.length,
      total_revenue: totalRevenue,
      total_stores: totalStores,
      active_stores: activeStores,
      by_date: Object.entries(byDate).map(([date, data]) => ({ date, ...data })),
    };
  }
}
