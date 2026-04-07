import { prisma } from '../config/database';

export class WishlistService {
  static async add(userId: string, productId: string) {
    const product = await prisma.marketplaceProduct.findUnique({ where: { id: productId } });
    if (!product) throw new Error('Product not found');

    // Idempotent — upsert
    await prisma.marketplaceWishlist.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {},
    });
  }

  static async remove(userId: string, productId: string) {
    await prisma.marketplaceWishlist.deleteMany({ where: { userId, productId } });
  }

  static async list(userId: string) {
    return prisma.marketplaceWishlist.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          include: { store: { select: { id: true, name: true, logoUrl: true } } },
        },
      },
    });
  }
}
