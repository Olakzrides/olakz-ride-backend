import { prisma } from '../config/database';

export class VendorProfileService {
  static async setVerified(ownerId: string, verified: boolean) {
    await prisma.$executeRaw`
      UPDATE food_restaurants SET is_verified = ${verified}, updated_at = now()
      WHERE owner_id = ${ownerId}::uuid
    `;
  }

  /**
   * Get restaurant by owner (vendor) user_id
   */
  static async getByOwnerId(ownerId: string) {
    return prisma.foodRestaurant.findUnique({ where: { ownerId } });
  }

  /**
   * Create restaurant for a newly approved vendor
   */
  static async createForVendor(ownerId: string, data: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    phone?: string;
    email?: string;
    city?: string;
    state?: string;
    logoUrl?: string;
  }) {
    await prisma.$executeRaw`
      INSERT INTO food_restaurants (owner_id, vendor_id, name, address, latitude, longitude, phone, email, city, state, logo_url, cuisine_types, operating_hours, is_verified)
      VALUES (
        ${ownerId}::uuid, ${ownerId}::uuid, ${data.name}, ${data.address},
        ${data.latitude}, ${data.longitude}, ${data.phone ?? null}, ${data.email ?? null},
        ${data.city ?? null}, ${data.state ?? null}, ${data.logoUrl ?? null}, '{}', '{}', true
      )
    `;
  }

  /**
   * GET /api/vendor/profile — business identity fields
   */
  static async getProfile(ownerId: string) {
    const r = await prisma.foodRestaurant.findUnique({ where: { ownerId } });
    if (!r) return null;
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      cuisine_types: r.cuisineTypes,
      logo_url: r.logoUrl,
      banner_url: r.bannerUrl,
      phone: r.phone,
      email: r.email,
      address: r.address,
      city: r.city,
      state: r.state,
      latitude: r.latitude,
      longitude: r.longitude,
      is_verified: r.isVerified,
      average_rating: r.averageRating,
      total_ratings: r.totalRatings,
      total_orders: r.totalOrders,
    };
  }

  /**
   * PUT /api/vendor/profile
   */
  static async updateProfile(ownerId: string, data: {
    name?: string;
    description?: string;
    cuisine_types?: string[];
    logo_url?: string;
    banner_url?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const r = await prisma.foodRestaurant.findUnique({ where: { ownerId } });
    if (!r) throw new Error('Restaurant not found');

    return prisma.foodRestaurant.update({
      where: { ownerId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.cuisine_types !== undefined && { cuisineTypes: data.cuisine_types }),
        ...(data.logo_url !== undefined && { logoUrl: data.logo_url }),
        ...(data.banner_url !== undefined && { bannerUrl: data.banner_url }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
      },
    });
  }

  /**
   * GET /api/vendor/store-details — operational info
   */
  static async getStoreDetails(ownerId: string) {
    const r = await prisma.foodRestaurant.findUnique({ where: { ownerId } });
    if (!r) return null;
    return {
      id: r.id,
      is_active: r.isActive,
      is_open: r.isOpen,
      auto_accept_orders: r.autoAcceptOrders,
      estimated_prep_time_minutes: r.estimatedPrepTimeMinutes,
      operating_hours: r.operatingHours,
    };
  }

  /**
   * PUT /api/vendor/store-details
   */
  static async updateStoreDetails(ownerId: string, data: {
    is_active?: boolean;
    is_open?: boolean;
    auto_accept_orders?: boolean;
    estimated_prep_time_minutes?: number;
  }) {
    const r = await prisma.foodRestaurant.findUnique({ where: { ownerId } });
    if (!r) throw new Error('Restaurant not found');

    return prisma.foodRestaurant.update({
      where: { ownerId },
      data: {
        ...(data.is_active !== undefined && { isActive: data.is_active }),
        ...(data.is_open !== undefined && { isOpen: data.is_open }),
        ...(data.auto_accept_orders !== undefined && { autoAcceptOrders: data.auto_accept_orders }),
        ...(data.estimated_prep_time_minutes !== undefined && { estimatedPrepTimeMinutes: data.estimated_prep_time_minutes }),
      },
    });
  }

  /**
   * GET /api/vendor/store-operations — operating hours + delivery settings
   */
  static async getStoreOperations(ownerId: string) {
    const r = await prisma.foodRestaurant.findUnique({ where: { ownerId } });
    if (!r) return null;
    return {
      id: r.id,
      operating_hours: r.operatingHours,
      auto_accept_orders: r.autoAcceptOrders,
      estimated_prep_time_minutes: r.estimatedPrepTimeMinutes,
      is_open: r.isOpen,
    };
  }

  /**
   * PUT /api/vendor/store-operations
   */
  static async updateStoreOperations(ownerId: string, data: {
    operating_hours?: Record<string, any>;
    auto_accept_orders?: boolean;
    estimated_prep_time_minutes?: number;
    is_open?: boolean;
  }) {
    const r = await prisma.foodRestaurant.findUnique({ where: { ownerId } });
    if (!r) throw new Error('Restaurant not found');

    return prisma.foodRestaurant.update({
      where: { ownerId },
      data: {
        ...(data.operating_hours !== undefined && { operatingHours: data.operating_hours }),
        ...(data.auto_accept_orders !== undefined && { autoAcceptOrders: data.auto_accept_orders }),
        ...(data.estimated_prep_time_minutes !== undefined && { estimatedPrepTimeMinutes: data.estimated_prep_time_minutes }),
        ...(data.is_open !== undefined && { isOpen: data.is_open }),
      },
    });
  }

  /**
   * GET /api/vendor/statistics
   */
  static async getStatistics(ownerId: string) {
    const r = await prisma.foodRestaurant.findUnique({ where: { ownerId } });
    if (!r) return null;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthOrders, allOrders] = await Promise.all([
      prisma.foodOrder.findMany({
        where: { restaurantId: r.id, createdAt: { gte: startOfMonth } },
        select: { totalAmount: true, status: true, paymentStatus: true },
      }),
      prisma.foodOrder.findMany({
        where: { restaurantId: r.id, status: 'delivered' },
        select: { totalAmount: true },
      }),
    ]);

    const monthRevenue = monthOrders
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + Number(o.totalAmount), 0);

    const totalRevenue = allOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);

    return {
      total_orders: r.totalOrders,
      average_rating: r.averageRating,
      total_ratings: r.totalRatings,
      total_revenue: totalRevenue,
      month_orders: monthOrders.length,
      month_revenue: monthRevenue,
    };
  }
}
