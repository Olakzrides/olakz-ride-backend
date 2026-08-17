import { supabase } from '../config/database';
import { CarWashReview, PaginatedResult } from '../types';

export class ReviewService {
  /**
   * Get paginated reviews for a vendor.
   */
  async getVendorReviews(
    vendorId: string,
    page = 1,
    limit = 10
  ): Promise<PaginatedResult<CarWashReview>> {
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('car_wash_bookings')
      .select(
        'id, customer_id, vendor_id, customer_rating, customer_feedback, updated_at',
        { count: 'exact' }
      )
      .eq('vendor_id', vendorId)
      .not('customer_rating', 'is', null)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);

    // Enrich with customer name from users table
    const reviews: CarWashReview[] = [];
    for (const row of data ?? []) {
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', row.customer_id)
        .single();

      const customerName = user
        ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Anonymous'
        : 'Anonymous';

      reviews.push({
        id: row.id,
        bookingId: row.id,
        customerId: row.customer_id,
        vendorId: row.vendor_id,
        rating: row.customer_rating,
        comment: row.customer_feedback,
        customerName,
        createdAt: row.updated_at,
      });
    }

    return {
      data: reviews,
      pagination: {
        total: count ?? 0,
        page,
        limit,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Get rating summary for a vendor.
   */
  async getVendorRatingSummary(vendorId: string): Promise<{
    averageRating: number;
    totalReviews: number;
    breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  }> {
    const { data, error } = await supabase
      .from('car_wash_bookings')
      .select('customer_rating')
      .eq('vendor_id', vendorId)
      .not('customer_rating', 'is', null);

    if (error) throw new Error(`Failed to fetch rating summary: ${error.message}`);

    const ratings = (data ?? []).map((r: any) => r.customer_rating as number);
    const total = ratings.length;
    const average = total > 0 ? ratings.reduce((s, r) => s + r, 0) / total : 0;

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
    ratings.forEach((r) => {
      if (r >= 1 && r <= 5) breakdown[r as 1 | 2 | 3 | 4 | 5]++;
    });

    return {
      averageRating: parseFloat(average.toFixed(2)),
      totalReviews: total,
      breakdown,
    };
  }
}
