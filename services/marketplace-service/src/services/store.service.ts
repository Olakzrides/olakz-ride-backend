import { prisma } from '../config/database';
import { haversineKm } from '../utils/maps';

export class StoreService {
  static async listCategories() {
    return prisma.marketplaceCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  static async listStores(params: {
    lat?: number; lng?: number; radius?: number;
    categoryId?: string; isOpen?: boolean; ratingMin?: number;
    limit?: number; page?: number;
  }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const stores = await prisma.marketplaceStore.findMany({
      where: {
        isActive: true,
        ...(params.isOpen !== undefined && { isOpen: params.isOpen }),
        ...(params.ratingMin && { averageRating: { gte: params.ratingMin } }),
        ...(params.categoryId && {
          storeCategories: { some: { categoryId: params.categoryId } },
        }),
      },
      include: {
        storeCategories: { include: { category: true } },
      },
      orderBy: [{ averageRating: 'desc' }, { totalOrders: 'desc' }],
      skip: offset,
      take: limit,
    });

    // Filter by distance if lat/lng provided
    if (params.lat && params.lng) {
      const radius = params.radius || 15;
      return stores.filter((s) => {
        const dist = haversineKm(params.lat!, params.lng!, parseFloat(s.latitude.toString()), parseFloat(s.longitude.toString()));
        return dist <= radius;
      });
    }

    return stores;
  }

  static async getStore(storeId: string) {
    const store = await prisma.marketplaceStore.findUnique({
      where: { id: storeId },
      include: { storeCategories: { include: { category: true } } },
    });
    if (!store) return null;

    // Get featured products per category (first 8)
    const categories = store.storeCategories.map((sc) => sc.category);
    const featuredProducts: Record<string, any[]> = {};
    for (const cat of categories) {
      const products = await prisma.marketplaceProduct.findMany({
        where: { storeId, categoryId: cat.id, isActive: true, isAvailable: true },
        take: 8,
        orderBy: { averageRating: 'desc' },
      });
      if (products.length > 0) featuredProducts[cat.id] = products;
    }

    return { ...store, featured_products: featuredProducts };
  }

  static async getStoreProducts(storeId: string, params: { categoryId?: string; limit?: number; page?: number }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.marketplaceProduct.findMany({
        where: {
          storeId,
          isActive: true,
          ...(params.categoryId && { categoryId: params.categoryId }),
        },
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.marketplaceProduct.count({
        where: { storeId, isActive: true, ...(params.categoryId && { categoryId: params.categoryId }) },
      }),
    ]);

    return { products, total, page: params.page || 1, limit };
  }

  static async getProduct(productId: string) {
    return prisma.marketplaceProduct.findUnique({
      where: { id: productId },
      include: { store: true, category: true },
    });
  }

  static async search(query: string, params: { lat?: number; lng?: number; limit?: number }) {
    const limit = params.limit || 20;
    const q = `%${query}%`;

    const [stores, products] = await Promise.all([
      prisma.marketplaceStore.findMany({
        where: {
          isActive: true,
          OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }],
        },
        take: limit,
      }),
      prisma.marketplaceProduct.findMany({
        where: {
          isActive: true,
          OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }],
        },
        include: { store: { select: { id: true, name: true } } },
        take: limit,
      }),
    ]);

    return { stores, products };
  }

  static async getByOwnerId(ownerId: string) {
    return prisma.marketplaceStore.findUnique({ where: { ownerId } });
  }

  static async getSimilarProducts(productId: string) {
    const product = await prisma.marketplaceProduct.findUnique({ where: { id: productId } });
    if (!product) return [];
    return prisma.marketplaceProduct.findMany({
      where: {
        id: { not: productId },
        storeId: product.storeId,
        categoryId: product.categoryId,
        isActive: true,
        isAvailable: true,
      },
      take: 8,
      orderBy: { averageRating: 'desc' },
      include: { category: true },
    });
  }
}
