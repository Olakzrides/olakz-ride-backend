import { prisma } from '../config/database';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

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

    // Fetch customer names from Supabase
    const customerIds = [...new Set(reviews.map((r) => r.customerId))];
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name')
      .in('id', customerIds);

    const userMap = new Map((users || []).map((u: any) => [u.id, u]));

    const reviewsWithCustomer = reviews.map((r) => {
      const user = userMap.get(r.customerId) as any;
      return {
        ...r,
        customer: user
          ? {
              firstName: user.first_name,
              lastName: user.last_name,
              fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
            }
          : null,
      };
    });

    return { reviews: reviewsWithCustomer, total, page, limit, totalPages: Math.ceil(total / limit) };
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

    // Fetch customer names from Supabase
    const customerIds = [...new Set(reviews.map((r) => r.review.customerId))];
    const { data: users } = customerIds.length
      ? await supabase.from('users').select('id, first_name, last_name').in('id', customerIds)
      : { data: [] };

    const userMap = new Map((users || []).map((u: any) => [u.id, u]));

    const reviewsWithCustomer = reviews.map((r) => {
      const user = userMap.get(r.review.customerId) as any;
      return {
        ...r,
        customer: user
          ? {
              firstName: user.first_name,
              lastName: user.last_name,
              fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
            }
          : null,
      };
    });

    return { reviews: reviewsWithCustomer, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
