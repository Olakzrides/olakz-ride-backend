import { prisma } from '../config/database';

export class FoodAdminService {
  // ─── Orders ─────────────────────────────────────────────────────────────────

  static async getOrders(filters: {
    status?: string;
    restaurant_id?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, restaurant_id, from, to, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (restaurant_id) where.restaurantId = restaurant_id;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [orders, total] = await Promise.all([
      prisma.foodOrder.findMany({
        where,
        include: {
          restaurant: { select: { id: true, name: true } },
          orderItems: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.foodOrder.count({ where }),
    ]);

    return { orders, total, page, limit };
  }

  static async updateOrderStatus(orderId: string, status: string, adminId: string) {
    const order = await prisma.foodOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');

    const updated = await prisma.foodOrder.update({
      where: { id: orderId },
      data: { status },
    });

    await prisma.foodOrderStatusHistory.create({
      data: {
        orderId,
        status,
        previousStatus: order.status,
        changedBy: adminId,
        changedByRole: 'admin',
        notes: 'Updated by admin',
      },
    });

    return updated;
  }

  // ─── Vendors (restaurants) ───────────────────────────────────────────────────

  static async getVendors(filters: {
    is_verified?: boolean;
    is_active?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { is_verified, is_active, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (is_verified !== undefined) where.isVerified = is_verified;
    if (is_active !== undefined) where.isActive = is_active;

    const [vendors, total] = await Promise.all([
      prisma.foodRestaurant.findMany({
        where,
        select: {
          id: true, ownerId: true, name: true, city: true, state: true,
          isActive: true, isVerified: true, averageRating: true,
          totalOrders: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.foodRestaurant.count({ where }),
    ]);

    return { vendors, total, page, limit };
  }

  static async approveVendor(restaurantId: string) {
    const r = await prisma.foodRestaurant.findUnique({ where: { id: restaurantId } });
    if (!r) throw new Error('Restaurant not found');
    return prisma.foodRestaurant.update({
      where: { id: restaurantId },
      data: { isVerified: true, isActive: true },
    });
  }

  static async suspendVendor(restaurantId: string, reason?: string) {
    const r = await prisma.foodRestaurant.findUnique({ where: { id: restaurantId } });
    if (!r) throw new Error('Restaurant not found');
    return prisma.foodRestaurant.update({
      where: { id: restaurantId },
      data: { isActive: false },
    });
  }

  // ─── Couriers ────────────────────────────────────────────────────────────────

  static async getCouriers(filters: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Query the shared drivers table (same Supabase DB, managed by core-logistics)
    const [couriers, countResult] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          d.id, d.user_id, d.status, d.rating, d.total_rides,
          d.total_earnings, d.created_at,
          vt.name AS vehicle_type,
          da.is_online, da.is_available
        FROM drivers d
        LEFT JOIN vehicle_types vt ON vt.id = d.vehicle_type_id
        LEFT JOIN driver_availability da ON da.driver_id = d.id
        WHERE d.status = 'approved'
        ORDER BY d.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as total FROM drivers WHERE status = 'approved'`,
    ]);

    return {
      couriers,
      total: parseInt(countResult[0].total),
      page,
      limit,
    };
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  static async getAnalytics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalOrders, monthOrders, totalRestaurants, activeRestaurants] = await Promise.all([
      prisma.foodOrder.count(),
      prisma.foodOrder.findMany({
        where: { createdAt: { gte: startOfMonth } },
        select: { totalAmount: true, status: true, paymentStatus: true },
      }),
      prisma.foodRestaurant.count(),
      prisma.foodRestaurant.count({ where: { isActive: true } }),
    ]);

    const monthRevenue = monthOrders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((s, o) => s + Number(o.totalAmount), 0);

    return {
      total_orders: totalOrders,
      total_restaurants: totalRestaurants,
      active_restaurants: activeRestaurants,
      this_month: {
        orders: monthOrders.length,
        revenue: monthRevenue,
        completed: monthOrders.filter((o) => o.status === 'delivered').length,
        cancelled: monthOrders.filter((o) => o.status === 'cancelled').length,
      },
    };
  }
}
