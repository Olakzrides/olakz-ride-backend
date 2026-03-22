import { prisma } from '../config/database';

export class AnalyticsService {
  /**
   * GET /api/analytics/vendor/dashboard
   * Vendor sees their own restaurant only
   */
  static async vendorDashboard(ownerId: string) {
    const restaurant = await prisma.foodRestaurant.findUnique({ where: { ownerId } });
    if (!restaurant) throw new Error('Restaurant not found');

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    const [todayOrders, monthOrders, lastMonthOrders, pendingOrders] = await Promise.all([
      prisma.foodOrder.findMany({
        where: { restaurantId: restaurant.id, createdAt: { gte: startOfToday } },
        select: { totalAmount: true, status: true, paymentStatus: true },
      }),
      prisma.foodOrder.findMany({
        where: { restaurantId: restaurant.id, createdAt: { gte: startOfMonth } },
        select: { totalAmount: true, status: true, paymentStatus: true },
      }),
      prisma.foodOrder.findMany({
        where: { restaurantId: restaurant.id, createdAt: { gte: startOfLastMonth, lte: endOfLastMonth } },
        select: { totalAmount: true, status: true, paymentStatus: true },
      }),
      prisma.foodOrder.count({
        where: { restaurantId: restaurant.id, status: { in: ['pending', 'accepted', 'preparing'] } },
      }),
    ]);

    const calcRevenue = (orders: any[]) =>
      orders.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + Number(o.totalAmount), 0);

    return {
      restaurant_id: restaurant.id,
      restaurant_name: restaurant.name,
      average_rating: restaurant.averageRating,
      total_ratings: restaurant.totalRatings,
      today: {
        orders: todayOrders.length,
        revenue: calcRevenue(todayOrders),
      },
      this_month: {
        orders: monthOrders.length,
        revenue: calcRevenue(monthOrders),
        completed: monthOrders.filter((o) => o.status === 'delivered').length,
        cancelled: monthOrders.filter((o) => o.status === 'cancelled').length,
      },
      last_month: {
        orders: lastMonthOrders.length,
        revenue: calcRevenue(lastMonthOrders),
      },
      pending_orders: pendingOrders,
    };
  }

  /**
   * GET /api/analytics/courier/earnings
   * Courier sees own earnings; admin can pass courierId query param
   */
  static async courierEarnings(courierId: string, filters: { from?: string; to?: string }) {
    const where: any = { courierId, status: 'delivered' };
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const orders = await prisma.foodOrder.findMany({
      where,
      select: { id: true, totalAmount: true, deliveryFee: true, createdAt: true, restaurantId: true },
      orderBy: { createdAt: 'desc' },
    });

    const totalEarnings = orders.reduce((s, o) => s + Number(o.deliveryFee), 0);
    const totalOrders = orders.length;

    return {
      courier_id: courierId,
      total_orders: totalOrders,
      total_earnings: totalEarnings,
      orders: orders.map((o) => ({
        order_id: o.id,
        delivery_fee: o.deliveryFee,
        created_at: o.createdAt,
      })),
    };
  }

  /**
   * GET /api/analytics/orders/trends  (admin)
   */
  static async orderTrends(filters: { from?: string; to?: string; restaurant_id?: string }) {
    const where: any = {};
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }
    if (filters.restaurant_id) where.restaurantId = filters.restaurant_id;

    const orders = await prisma.foodOrder.findMany({
      where,
      select: { id: true, totalAmount: true, status: true, paymentStatus: true, createdAt: true, restaurantId: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const byDate: Record<string, { orders: number; revenue: number }> = {};
    for (const o of orders) {
      const date = o.createdAt.toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { orders: 0, revenue: 0 };
      byDate[date].orders++;
      if (o.paymentStatus === 'paid') byDate[date].revenue += Number(o.totalAmount);
    }

    return {
      total_orders: orders.length,
      total_revenue: orders.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + Number(o.totalAmount), 0),
      by_date: Object.entries(byDate).map(([date, data]) => ({ date, ...data })),
    };
  }

  /**
   * GET /api/analytics/customer/behavior  (admin)
   */
  static async customerBehavior(filters: { from?: string; to?: string }) {
    const where: any = {};
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const orders = await prisma.foodOrder.findMany({
      where,
      select: { customerId: true, totalAmount: true, status: true, paymentMethod: true, createdAt: true },
    });

    const customerMap: Record<string, { orders: number; spend: number }> = {};
    for (const o of orders) {
      if (!customerMap[o.customerId]) customerMap[o.customerId] = { orders: 0, spend: 0 };
      customerMap[o.customerId].orders++;
      customerMap[o.customerId].spend += Number(o.totalAmount);
    }

    const customers = Object.values(customerMap);
    const totalCustomers = customers.length;
    const avgOrdersPerCustomer = totalCustomers ? customers.reduce((s, c) => s + c.orders, 0) / totalCustomers : 0;
    const avgSpendPerCustomer = totalCustomers ? customers.reduce((s, c) => s + c.spend, 0) / totalCustomers : 0;

    const paymentMethods: Record<string, number> = {};
    for (const o of orders) {
      paymentMethods[o.paymentMethod] = (paymentMethods[o.paymentMethod] || 0) + 1;
    }

    return {
      total_customers: totalCustomers,
      avg_orders_per_customer: Math.round(avgOrdersPerCustomer * 100) / 100,
      avg_spend_per_customer: Math.round(avgSpendPerCustomer * 100) / 100,
      payment_methods: paymentMethods,
    };
  }
}
