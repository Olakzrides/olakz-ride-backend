import { prisma } from '../config/database';

export class ReviewService {
  static async submitReview(
    orderId: string,
    customerId: string,
    storeRating: number,
    comment: string | undefined,
    productRatings: { product_id: string; rating: number }[]
  ) {
    const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.customerId !== customerId) throw new Error('Unauthorized');
    if (order.status !== 'delivered') throw new Error('Can only review delivered orders');

    const existing = await prisma.marketplaceReview.findUnique({ where: { orderId } });
    if (existing) throw new Error('Review already submitted for this order');

    const review = await prisma.marketplaceReview.create({
      data: {
        orderId,
        customerId,
        storeId: order.storeId,
        storeRating,
        comment,
        productReviews: productRatings?.length
          ? { create: productRatings.map((pr) => ({ productId: pr.product_id, productRating: pr.rating })) }
          : undefined,
      },
    });

    // Update store average rating
    const storeStats = await prisma.marketplaceReview.aggregate({
      where: { storeId: order.storeId },
      _avg: { storeRating: true },
      _count: { id: true },
    });
    await prisma.marketplaceStore.update({
      where: { id: order.storeId },
      data: {
        averageRating: storeStats._avg.storeRating || 0,
        totalRatings: storeStats._count.id,
      },
    });

    // Update product average ratings
    for (const pr of productRatings || []) {
      const productStats = await prisma.marketplaceProductReview.aggregate({
        where: { productId: pr.product_id },
        _avg: { productRating: true },
        _count: { id: true },
      });
      await prisma.marketplaceProduct.update({
        where: { id: pr.product_id },
        data: {
          averageRating: productStats._avg.productRating || 0,
          totalRatings: productStats._count.id,
        },
      });
    }

    return review;
  }

  static async getStoreReviews(storeId: string, limit = 20, page = 1) {
    const offset = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      prisma.marketplaceReview.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: { productReviews: { include: { product: { select: { name: true } } } } },
      }),
      prisma.marketplaceReview.count({ where: { storeId } }),
    ]);
    return { reviews, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  static async getProductReviews(productId: string, limit = 20, page = 1) {
    const offset = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      prisma.marketplaceProductReview.findMany({
        where: { productId },
        orderBy: { review: { createdAt: 'desc' } },
        skip: offset,
        take: limit,
        include: { review: { select: { storeRating: true, comment: true, customerId: true, createdAt: true } } },
      }),
      prisma.marketplaceProductReview.count({ where: { productId } }),
    ]);
    return { reviews, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
