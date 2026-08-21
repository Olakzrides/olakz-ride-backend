import { prisma } from '../config/database';
import { haversineKm } from '../utils/maps';
import { FareService } from './fare.service';

export class StoreService {
  // ─────────────────────────────────────────────────────────────────
  // CATEGORIES
  // ─────────────────────────────────────────────────────────────────

  static async listCategories() {
    return prisma.sparePartsCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // STORES
  // ─────────────────────────────────────────────────────────────────

  static async listStores(params: {
    lat?: number;
    lng?: number;
    radius?: number;
    categoryId?: string;
    isOpen?: boolean;
    ratingMin?: number;
    limit?: number;
    page?: number;
  }) {
    const limit  = params.limit  || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const stores = await prisma.sparePartsStore.findMany({
      where: {
        isActive: true,
        isVerified: true,
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

    // Apply distance filter in-memory when lat/lng supplied
    if (params.lat != null && params.lng != null) {
      const radius = params.radius || 15;
      return stores.filter((s: typeof stores[number]) => {
        const dist = haversineKm(
          params.lat!,
          params.lng!,
          parseFloat(s.latitude.toString()),
          parseFloat(s.longitude.toString())
        );
        return dist <= radius;
      });
    }

    return stores;
  }

  static async getStore(storeId: string) {
    const store = await prisma.sparePartsStore.findUnique({
      where: { id: storeId },
      include: { storeCategories: { include: { category: true } } },
    });
    if (!store) return null;

    // Featured products: top 8 by rating per category
    const categories = store.storeCategories.map((sc: { category: any }) => sc.category);
    const featuredProducts: Record<string, any[]> = {};

    for (const cat of categories) {
      const products = await prisma.sparePartsProduct.findMany({
        where: { storeId, categoryId: cat.id, isActive: true, isAvailable: true },
        take: 8,
        orderBy: { averageRating: 'desc' },
      });
      if (products.length > 0) featuredProducts[cat.id] = products;
    }

    return { ...store, featured_products: featuredProducts };
  }

  // ─────────────────────────────────────────────────────────────────
  // PRODUCTS
  // ─────────────────────────────────────────────────────────────────

  static async getStoreProducts(
    storeId: string,
    params: { categoryId?: string; limit?: number; page?: number }
  ) {
    const limit  = params.limit  || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const where = {
      storeId,
      isActive: true,
      ...(params.categoryId && { categoryId: params.categoryId }),
    };

    const [products, total] = await Promise.all([
      prisma.sparePartsProduct.findMany({
        where,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.sparePartsProduct.count({ where }),
    ]);

    return { products, total, page: params.page || 1, limit };
  }

  static async getProduct(productId: string) {
    return prisma.sparePartsProduct.findUnique({
      where: { id: productId },
      include: {
        store: { select: { id: true, name: true, city: true, averageRating: true, logoUrl: true } },
        category: true,
      },
    });
  }

  static async getSimilarProducts(productId: string) {
    const product = await prisma.sparePartsProduct.findUnique({
      where: { id: productId },
    });
    if (!product) return [];

    return prisma.sparePartsProduct.findMany({
      where: {
        id: { not: productId },
        storeId: product.storeId,
        categoryId: product.categoryId,
        isActive: true,
        isAvailable: true,
      },
      take: 10,
      orderBy: { averageRating: 'desc' },
      include: { category: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // SEARCH
  // ─────────────────────────────────────────────────────────────────

  static async search(
    query: string,
    params: { categoryId?: string; lat?: number; lng?: number; limit?: number }
  ) {
    const limit = params.limit || 20;

    const [stores, products] = await Promise.all([
      prisma.sparePartsStore.findMany({
        where: {
          isActive: true,
          isVerified: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: { storeCategories: { include: { category: true } } },
        take: limit,
      }),
      prisma.sparePartsProduct.findMany({
        where: {
          isActive: true,
          ...(params.categoryId && { categoryId: params.categoryId }),
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          store: { select: { id: true, name: true, city: true } },
          category: true,
        },
        take: limit,
      }),
    ]);

    return { stores, products };
  }

  // ─────────────────────────────────────────────────────────────────
  // DELIVERY OPTIONS  (fare estimate per vehicle type)
  // ─────────────────────────────────────────────────────────────────

  static async getDeliveryOptions(params: {
    storeId:     string;
    deliveryLat: number;
    deliveryLng: number;
  }) {
    const store = await prisma.sparePartsStore.findUnique({
      where: { id: params.storeId },
    });
    if (!store) throw new Error('Store not found');

    const storeLat = parseFloat(store.latitude.toString());
    const storeLng = parseFloat(store.longitude.toString());

    // Distinct vehicle types that have an active fare config
    const fareConfigs = await prisma.sparePartsFareConfig.findMany({
      where: { isActive: true },
      select: { vehicleType: true },
      distinct: ['vehicleType'],
    });

    if (!fareConfigs.length) return [];

    const displayNames: Record<string, string> = {
      motorcycle: 'Motorcycle',
      car: 'Car',
      bicycle: 'Bicycle',
      truck: 'Truck',
      bus: 'Bus',
    };

    const results = await Promise.allSettled(
      fareConfigs.map(async (cfg: { vehicleType: string }) => {
        try {
          const fare = await FareService.calculateFare({
            storeLat,
            storeLng,
            deliveryLat: params.deliveryLat,
            deliveryLng: params.deliveryLng,
            vehicleType: cfg.vehicleType,
          });
          return {
            vehicle_type:          cfg.vehicleType,
            display_name:          displayNames[cfg.vehicleType] || cfg.vehicleType,
            delivery_fee:          fare.deliveryFee,
            service_fee:           fare.serviceFee,
            total_fee:             fare.totalFees,
            estimated_distance_km: fare.distanceKm,
            currency_code:         fare.currencyCode,
          };
        } catch {
          return null;
        }
      })
    );

    return results
      .filter((r) => r.status === 'fulfilled' && r.value !== null)
      .map((r) => (r as PromiseFulfilledResult<any>).value);
  }

  // ─────────────────────────────────────────────────────────────────
  // REVIEWS  (read-only here — writes are in review.service.ts later)
  // ─────────────────────────────────────────────────────────────────

  static async getStoreReviews(
    storeId: string,
    params: { limit?: number; page?: number }
  ) {
    const limit  = params.limit  || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const [reviews, total] = await Promise.all([
      prisma.sparePartsReview.findMany({
        where: { storeId },
        include: {
          productReviews: {
            include: { product: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.sparePartsReview.count({ where: { storeId } }),
    ]);

    return { reviews, total, page: params.page || 1, limit };
  }

  static async getProductReviews(
    productId: string,
    params: { limit?: number; page?: number }
  ) {
    const limit  = params.limit  || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const [reviews, total] = await Promise.all([
      prisma.sparePartsProductReview.findMany({
        where: { productId },
        include: {
          review: {
            select: {
              id: true,
              customerId: true,
              storeRating: true,
              comment: true,
              createdAt: true,
            },
          },
        },
        orderBy: { review: { createdAt: 'desc' } },
        skip: offset,
        take: limit,
      }),
      prisma.sparePartsProductReview.count({ where: { productId } }),
    ]);

    return { reviews, total, page: params.page || 1, limit };
  }
}
