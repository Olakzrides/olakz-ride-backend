import { prisma } from '../config/database';

export class AdminService {
  static async getStores(params: { status?: string; categoryId?: string; page?: number; limit?: number }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const where: any = {};
    if (params.status === 'active') where.isActive = true;
    if (params.status === 'inactive') where.isActive = false;
    if (params.categoryId) {
      where.storeCategories = { some: { categoryId: params.categoryId } };
    }

    const [stores, total] = await Promise.all([
      prisma.marketplaceStore.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { storeCategories: { include: { category: { select: { name: true } } } } },
      }),
      prisma.marketplaceStore.count({ where }),
    ]);

    return { stores, total, page: params.page || 1, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getOrders(params: {
    status?: string; storeId?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number;
  }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.storeId) where.storeId = params.storeId;
    if (params.dateFrom) where.createdAt = { ...where.createdAt, gte: new Date(params.dateFrom) };
    if (params.dateTo) where.createdAt = { ...where.createdAt, lte: new Date(params.dateTo) };

    const [orders, total] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { store: { select: { id: true, name: true } }, orderItems: true },
      }),
      prisma.marketplaceOrder.count({ where }),
    ]);

    return { orders, total, page: params.page || 1, limit, totalPages: Math.ceil(total / limit) };
  }

  static async setStoreStatus(storeId: string, isActive: boolean) {
    const store = await prisma.marketplaceStore.findUnique({ where: { id: storeId } });
    if (!store) throw new Error('Store not found');
    await prisma.marketplaceStore.update({ where: { id: storeId }, data: { isActive } });
  }
}
