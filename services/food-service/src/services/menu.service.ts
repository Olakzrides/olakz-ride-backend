import { prisma } from '../config/database';

export class MenuService {
  // ─── Categories ────────────────────────────────────────────────────────────

  static async getCategories(restaurantId: string) {
    return prisma.foodMenuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  static async createCategory(restaurantId: string, data: {
    name: string;
    description?: string;
    image_url?: string;
    sort_order?: number;
  }) {
    return prisma.foodMenuCategory.create({
      data: {
        restaurantId,
        name: data.name,
        description: data.description,
        imageUrl: data.image_url,
        sortOrder: data.sort_order ?? 0,
      },
    });
  }

  static async updateCategory(id: string, restaurantId: string, data: {
    name?: string;
    description?: string;
    image_url?: string;
    is_active?: boolean;
    sort_order?: number;
  }) {
    const cat = await prisma.foodMenuCategory.findFirst({ where: { id, restaurantId } });
    if (!cat) throw new Error('Category not found');
    return prisma.foodMenuCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.image_url !== undefined && { imageUrl: data.image_url }),
        ...(data.is_active !== undefined && { isActive: data.is_active }),
        ...(data.sort_order !== undefined && { sortOrder: data.sort_order }),
      },
    });
  }

  static async deleteCategory(id: string, restaurantId: string) {
    const cat = await prisma.foodMenuCategory.findFirst({ where: { id, restaurantId } });
    if (!cat) throw new Error('Category not found');
    await prisma.foodMenuCategory.delete({ where: { id } });
  }

  // ─── Products (Menu Items) ──────────────────────────────────────────────────

  static async getProducts(restaurantId: string, filters: { category_id?: string; is_active?: boolean }) {
    return prisma.foodMenuItem.findMany({
      where: {
        restaurantId,
        ...(filters.category_id && { categoryId: filters.category_id }),
        ...(filters.is_active !== undefined && { isActive: filters.is_active }),
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createProduct(restaurantId: string, data: {
    name: string;
    description?: string;
    price: number;
    category_id?: string;
    images?: string[];
    is_available?: boolean;
    stock_quantity?: number;
    preparation_time_minutes?: number;
    tags?: string[];
  }) {
    return prisma.foodMenuItem.create({
      data: {
        restaurantId,
        name: data.name,
        description: data.description,
        price: data.price,
        categoryId: data.category_id,
        images: data.images ?? [],
        isAvailable: data.is_available ?? true,
        stockQuantity: data.stock_quantity,
        preparationTimeMinutes: data.preparation_time_minutes,
        tags: data.tags ?? [],
      },
    });
  }

  static async updateProduct(id: string, restaurantId: string, data: {
    name?: string;
    description?: string;
    price?: number;
    category_id?: string;
    images?: string[];
    is_active?: boolean;
    is_available?: boolean;
    stock_quantity?: number;
    preparation_time_minutes?: number;
    tags?: string[];
  }) {
    const item = await prisma.foodMenuItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw new Error('Product not found');
    return prisma.foodMenuItem.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.category_id !== undefined && { categoryId: data.category_id }),
        ...(data.images !== undefined && { images: data.images }),
        ...(data.is_active !== undefined && { isActive: data.is_active }),
        ...(data.is_available !== undefined && { isAvailable: data.is_available }),
        ...(data.stock_quantity !== undefined && { stockQuantity: data.stock_quantity }),
        ...(data.preparation_time_minutes !== undefined && { preparationTimeMinutes: data.preparation_time_minutes }),
        ...(data.tags !== undefined && { tags: data.tags }),
      },
    });
  }

  static async deleteProduct(id: string, restaurantId: string) {
    const item = await prisma.foodMenuItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw new Error('Product not found');
    await prisma.foodMenuItem.delete({ where: { id } });
  }

  static async updateProductAvailability(id: string, restaurantId: string, isAvailable: boolean) {
    const item = await prisma.foodMenuItem.findFirst({ where: { id, restaurantId } });
    if (!item) throw new Error('Product not found');
    return prisma.foodMenuItem.update({ where: { id }, data: { isAvailable } });
  }

  // ─── Extras ─────────────────────────────────────────────────────────────────

  static async getExtras(restaurantId: string) {
    return prisma.foodItemExtra.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async createExtra(restaurantId: string, data: {
    name: string;
    description?: string;
    price?: number;
    image_url?: string;
  }) {
    return prisma.foodItemExtra.create({
      data: {
        restaurantId,
        name: data.name,
        description: data.description,
        price: data.price ?? 0,
        imageUrl: data.image_url,
      },
    });
  }

  static async updateExtra(id: string, restaurantId: string, data: {
    name?: string;
    description?: string;
    price?: number;
    image_url?: string;
    is_active?: boolean;
  }) {
    const extra = await prisma.foodItemExtra.findFirst({ where: { id, restaurantId } });
    if (!extra) throw new Error('Extra not found');
    return prisma.foodItemExtra.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
        ...(data.image_url !== undefined && { imageUrl: data.image_url }),
        ...(data.is_active !== undefined && { isActive: data.is_active }),
      },
    });
  }

  static async deleteExtra(id: string, restaurantId: string) {
    const extra = await prisma.foodItemExtra.findFirst({ where: { id, restaurantId } });
    if (!extra) throw new Error('Extra not found');
    await prisma.foodItemExtra.delete({ where: { id } });
  }
}
