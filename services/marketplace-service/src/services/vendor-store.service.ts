import { prisma } from '../config/database';

export class VendorStoreService {
  static async getProfile(ownerId: string) {
    const store = await prisma.marketplaceStore.findUnique({
      where: { ownerId },
      include: { storeCategories: { include: { category: true } } },
    });
    if (!store) return null;
    return store;
  }

  static async updateProfile(ownerId: string, data: {
    name?: string; description?: string; logo_url?: string; banner_url?: string;
    address?: string; city?: string; state?: string; latitude?: number; longitude?: number;
    phone?: string; email?: string; operating_hours?: Record<string, any>; category_ids?: string[];
  }) {
    const store = await prisma.marketplaceStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const updated = await prisma.marketplaceStore.update({
      where: { ownerId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.logo_url !== undefined && { logoUrl: data.logo_url }),
        ...(data.banner_url !== undefined && { bannerUrl: data.banner_url }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.state !== undefined && { state: data.state }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.operating_hours !== undefined && { operatingHours: data.operating_hours }),
      },
    });

    // Update categories if provided
    if (data.category_ids !== undefined) {
      await prisma.marketplaceStoreCategory.deleteMany({ where: { storeId: store.id } });
      if (data.category_ids.length > 0) {
        await prisma.marketplaceStoreCategory.createMany({
          data: data.category_ids.map((categoryId) => ({ storeId: store.id, categoryId })),
          skipDuplicates: true,
        });
      }
    }

    return updated;
  }

  static async setOpenStatus(ownerId: string, isOpen: boolean) {
    const store = await prisma.marketplaceStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');
    return prisma.marketplaceStore.update({ where: { ownerId }, data: { isOpen } });
  }

  static async getStatistics(ownerId: string) {
    const store = await prisma.marketplaceStore.findUnique({ where: { ownerId } });
    if (!store) return null;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthOrders, allDelivered, pendingCount] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where: { storeId: store.id, createdAt: { gte: startOfMonth } },
        select: { totalAmount: true, status: true, paymentStatus: true },
      }),
      prisma.marketplaceOrder.findMany({
        where: { storeId: store.id, status: 'delivered' },
        select: { totalAmount: true },
      }),
      prisma.marketplaceOrder.count({ where: { storeId: store.id, status: { in: ['pending', 'in_progress'] } } }),
    ]);

    const monthRevenue = monthOrders.filter((o) => o.paymentStatus === 'paid').reduce((s, o) => s + parseFloat(o.totalAmount.toString()), 0);
    const totalRevenue = allDelivered.reduce((s, o) => s + parseFloat(o.totalAmount.toString()), 0);

    return {
      total_orders: store.totalOrders,
      average_rating: store.averageRating,
      total_ratings: store.totalRatings,
      total_revenue: totalRevenue,
      month_orders: monthOrders.length,
      month_revenue: monthRevenue,
      pending_orders: pendingCount,
    };
  }

  // Product management
  static async listProducts(ownerId: string, params: { categoryId?: string; isActive?: boolean; limit?: number; page?: number }) {
    const store = await prisma.marketplaceStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    return prisma.marketplaceProduct.findMany({
      where: {
        storeId: store.id,
        ...(params.categoryId && { categoryId: params.categoryId }),
        ...(params.isActive !== undefined && { isActive: params.isActive }),
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  static async createProduct(ownerId: string, data: {
    name: string; description?: string; price: number; category_id?: string;
    images?: string[]; stock_quantity?: number;
  }) {
    const store = await prisma.marketplaceStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    return prisma.marketplaceProduct.create({
      data: {
        storeId: store.id,
        name: data.name,
        description: data.description || null,
        price: data.price,
        categoryId: data.category_id || null,
        images: data.images || [],
        stockQuantity: data.stock_quantity || null,
      },
    });
  }

  static async updateProduct(ownerId: string, productId: string, data: any) {
    const store = await prisma.marketplaceStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const product = await prisma.marketplaceProduct.findFirst({ where: { id: productId, storeId: store.id } });
    if (!product) throw new Error('Product not found');

    return prisma.marketplaceProduct.update({
      where: { id: productId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.category_id !== undefined && { categoryId: data.category_id }),
        ...(data.images !== undefined && { images: data.images }),
        ...(data.stock_quantity !== undefined && { stockQuantity: data.stock_quantity }),
        ...(data.is_active !== undefined && { isActive: data.is_active }),
        ...(data.is_available !== undefined && { isAvailable: data.is_available }),
      },
    });
  }

  static async deleteProduct(ownerId: string, productId: string) {
    const store = await prisma.marketplaceStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');
    const product = await prisma.marketplaceProduct.findFirst({ where: { id: productId, storeId: store.id } });
    if (!product) throw new Error('Product not found');
    await prisma.marketplaceProduct.delete({ where: { id: productId } });
  }

  static async toggleProductAvailability(ownerId: string, productId: string, isAvailable: boolean) {
    const store = await prisma.marketplaceStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');
    const product = await prisma.marketplaceProduct.findFirst({ where: { id: productId, storeId: store.id } });
    if (!product) throw new Error('Product not found');
    return prisma.marketplaceProduct.update({ where: { id: productId }, data: { isAvailable } });
  }
}
