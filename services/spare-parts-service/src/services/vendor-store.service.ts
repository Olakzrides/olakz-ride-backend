import { prisma } from '../config/database';

export class VendorStoreService {
  // ─────────────────────────────────────────────────────────────────
  // STORE PROFILE
  // ─────────────────────────────────────────────────────────────────

  static async getProfile(ownerId: string) {
    return prisma.sparePartsStore.findUnique({
      where: { ownerId },
      include: { storeCategories: { include: { category: true } } },
    });
  }

  static async updateProfile(
    ownerId: string,
    data: {
      name?: string;
      description?: string;
      logo_url?: string;
      banner_url?: string;
      address?: string;
      city?: string;
      state?: string;
      latitude?: number;
      longitude?: number;
      phone?: string;
      email?: string;
      operating_hours?: Record<string, any>;
      category_ids?: string[];
    }
  ) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const updated = await prisma.sparePartsStore.update({
      where: { ownerId },
      data: {
        ...(data.name             !== undefined && { name: data.name }),
        ...(data.description      !== undefined && { description: data.description }),
        ...(data.logo_url         !== undefined && { logoUrl: data.logo_url }),
        ...(data.banner_url       !== undefined && { bannerUrl: data.banner_url }),
        ...(data.address          !== undefined && { address: data.address }),
        ...(data.city             !== undefined && { city: data.city }),
        ...(data.state            !== undefined && { state: data.state }),
        ...(data.latitude         !== undefined && { latitude: data.latitude }),
        ...(data.longitude        !== undefined && { longitude: data.longitude }),
        ...(data.phone            !== undefined && { phone: data.phone }),
        ...(data.email            !== undefined && { email: data.email }),
        ...(data.operating_hours  !== undefined && { operatingHours: data.operating_hours }),
      },
    });

    // Replace category assignments if provided
    if (data.category_ids !== undefined) {
      await prisma.sparePartsStoreCategory.deleteMany({ where: { storeId: store.id } });
      if (data.category_ids.length > 0) {
        await prisma.sparePartsStoreCategory.createMany({
          data: data.category_ids.map((categoryId) => ({
            storeId: store.id,
            categoryId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return updated;
  }

  static async setOpenStatus(ownerId: string, isOpen: boolean) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');
    return prisma.sparePartsStore.update({ where: { ownerId }, data: { isOpen } });
  }

  static async getStatistics(ownerId: string) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) return null;

    const now           = new Date();
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);

    const [monthOrders, allDelivered, pendingCount] = await Promise.all([
      prisma.sparePartsOrder.findMany({
        where: { storeId: store.id, createdAt: { gte: startOfMonth } },
        select: { totalAmount: true, status: true, paymentStatus: true, paymentMethod: true },
      }),
      prisma.sparePartsOrder.findMany({
        where: { storeId: store.id, status: 'delivered' },
        select: { totalAmount: true },
      }),
      prisma.sparePartsOrder.count({
        where: { storeId: store.id, status: { in: ['pending', 'in_progress'] } },
      }),
    ]);

    // Count wallet (paid) + cash orders toward revenue
    type OrderRow = { totalAmount: any; paymentStatus: string; paymentMethod: string };
    const monthRevenue = (monthOrders as OrderRow[])
      .filter((o) => o.paymentStatus === 'paid' || o.paymentMethod === 'cash')
      .reduce((s, o) => s + parseFloat(o.totalAmount.toString()), 0);

    type DeliveredRow = { totalAmount: any };
    const totalRevenue = (allDelivered as DeliveredRow[]).reduce(
      (s, o) => s + parseFloat(o.totalAmount.toString()), 0
    );

    return {
      total_orders:    store.totalOrders,
      average_rating:  parseFloat(store.averageRating.toString()),
      total_ratings:   store.totalRatings,
      total_revenue:   totalRevenue,
      month_orders:    monthOrders.length,
      month_revenue:   monthRevenue,
      pending_orders:  pendingCount,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // PRODUCTS
  // ─────────────────────────────────────────────────────────────────

  static async listProducts(
    ownerId: string,
    params: {
      categoryId?: string;
      isActive?: boolean;
      limit?: number;
      page?: number;
    }
  ) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const limit  = params.limit  || 20;
    const offset = ((params.page || 1) - 1) * limit;

    return prisma.sparePartsProduct.findMany({
      where: {
        storeId: store.id,
        ...(params.categoryId !== undefined && { categoryId: params.categoryId }),
        ...(params.isActive   !== undefined && { isActive: params.isActive }),
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });
  }

  static async createProduct(
    ownerId: string,
    data: {
      name: string;
      description?: string;
      category_id?: string;
      price: number;
      images?: string[];
      specs?: Record<string, any>;
      stock_quantity?: number;
    }
  ) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    return prisma.sparePartsProduct.create({
      data: {
        storeId:       store.id,
        name:          data.name,
        description:   data.description   || null,
        categoryId:    data.category_id   || null,
        price:         data.price,
        images:        data.images        || [],
        specs:         data.specs         || {},
        stockQuantity: data.stock_quantity || null,
      },
      include: { category: true },
    });
  }

  static async updateProduct(ownerId: string, productId: string, data: any) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const product = await prisma.sparePartsProduct.findFirst({
      where: { id: productId, storeId: store.id },
    });
    if (!product) throw new Error('Product not found');

    return prisma.sparePartsProduct.update({
      where: { id: productId },
      data: {
        ...(data.name          !== undefined && { name: data.name }),
        ...(data.description   !== undefined && { description: data.description }),
        ...(data.price         !== undefined && { price: data.price }),
        ...(data.category_id   !== undefined && { categoryId: data.category_id }),
        ...(data.images        !== undefined && { images: data.images }),
        ...(data.specs         !== undefined && { specs: data.specs }),
        ...(data.stock_quantity !== undefined && { stockQuantity: data.stock_quantity }),
        ...(data.is_active     !== undefined && { isActive: data.is_active }),
        ...(data.is_available  !== undefined && { isAvailable: data.is_available }),
      },
      include: { category: true },
    });
  }

  static async deleteProduct(ownerId: string, productId: string) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const product = await prisma.sparePartsProduct.findFirst({
      where: { id: productId, storeId: store.id },
    });
    if (!product) throw new Error('Product not found');

    await prisma.sparePartsProduct.delete({ where: { id: productId } });
  }

  static async toggleProductAvailability(
    ownerId: string,
    productId: string,
    isAvailable: boolean
  ) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const product = await prisma.sparePartsProduct.findFirst({
      where: { id: productId, storeId: store.id },
    });
    if (!product) throw new Error('Product not found');

    return prisma.sparePartsProduct.update({
      where: { id: productId },
      data: { isAvailable },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // VENDOR CUSTOM CATEGORIES
  // Vendors can create categories scoped to their store.
  // Global categories (storeId = null) are read-only for vendors.
  // ─────────────────────────────────────────────────────────────────

  /**
   * List all categories available to this vendor:
   * global categories (storeId = null) + their own custom ones.
   */
  static async listCategories(ownerId: string) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    return prisma.sparePartsCategory.findMany({
      where: {
        isActive: true,
        OR: [
          { storeId: null },          // global
          { storeId: store.id },      // this vendor's custom
        ],
      },
      orderBy: [
        { storeId: 'asc' },           // global (null) first, then custom
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  /**
   * Create a custom category scoped to this vendor's store.
   * A vendor cannot create a global category (storeId is always set).
   */
  static async createCategory(
    ownerId: string,
    data: {
      name:        string;
      description?: string;
      icon_url?:   string;
    }
  ) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    // Prevent duplicate name within the same store
    const existing = await prisma.sparePartsCategory.findFirst({
      where: { name: { equals: data.name, mode: 'insensitive' }, storeId: store.id },
    });
    if (existing) throw new Error(`Category "${data.name}" already exists in your store`);

    return prisma.sparePartsCategory.create({
      data: {
        name:        data.name,
        description: data.description || null,
        iconUrl:     data.icon_url    || null,
        isActive:    true,
        sortOrder:   0,
        storeId:     store.id,
      },
    });
  }

  /**
   * Update a vendor's own custom category.
   * Vendors cannot update global categories.
   */
  static async updateCategory(
    ownerId:    string,
    categoryId: string,
    data: {
      name?:        string;
      description?: string;
      icon_url?:    string;
    }
  ) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const category = await prisma.sparePartsCategory.findFirst({
      where: { id: categoryId, storeId: store.id },
    });
    if (!category) throw new Error('Category not found or not yours to edit');

    return prisma.sparePartsCategory.update({
      where: { id: categoryId },
      data: {
        ...(data.name        !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon_url    !== undefined && { iconUrl: data.icon_url }),
      },
    });
  }

  /**
   * Delete a vendor's own custom category.
   * Products that used this category will have categoryId set to null (SetNull in schema).
   * Vendors cannot delete global categories.
   */
  static async deleteCategory(ownerId: string, categoryId: string) {
    const store = await prisma.sparePartsStore.findUnique({ where: { ownerId } });
    if (!store) throw new Error('Store not found');

    const category = await prisma.sparePartsCategory.findFirst({
      where: { id: categoryId, storeId: store.id },
    });
    if (!category) throw new Error('Category not found or not yours to delete');

    await prisma.sparePartsCategory.delete({ where: { id: categoryId } });
  }

}