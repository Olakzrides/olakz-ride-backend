import { supabase } from '../config/database';
import logger from '../utils/logger';

export class FoodRatingService {
  /**
   * Customer rates an order (restaurant + courier)
   */
  static async rateOrder(params: {
    orderId: string;
    customerId: string;
    restaurantRating: number;
    deliveryRating?: number;
    comment?: string;
  }): Promise<void> {
    const { orderId, customerId, restaurantRating, deliveryRating, comment } = params;

    // Validate order belongs to customer and is delivered
    const { data: order } = await supabase
      .from('food_orders')
      .select('id, status, customer_id, restaurant_id, courier_id')
      .eq('id', orderId)
      .eq('customer_id', customerId)
      .single();

    if (!order) throw new Error('Order not found');
    if (order.status !== 'delivered') throw new Error('Can only rate delivered orders');

    // Check not already rated
    const { data: existing } = await supabase
      .from('food_ratings')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existing) throw new Error('Order already rated');

    // Insert rating
    await supabase.from('food_ratings').insert({
      order_id: orderId,
      customer_id: customerId,
      restaurant_id: order.restaurant_id,
      courier_id: order.courier_id || null,
      restaurant_rating: restaurantRating,
      delivery_rating: deliveryRating || null,
      comment: comment || null,
    });

    // Update restaurant average rating
    const { data: allRatings } = await supabase
      .from('food_ratings')
      .select('restaurant_rating')
      .eq('restaurant_id', order.restaurant_id);

    if (allRatings && allRatings.length > 0) {
      const avg = allRatings.reduce((sum, r) => sum + r.restaurant_rating, 0) / allRatings.length;
      await supabase
        .from('food_restaurants')
        .update({
          average_rating: avg.toFixed(2),
          total_ratings: allRatings.length,
        })
        .eq('id', order.restaurant_id);
    }

    logger.info('Order rated', { orderId, customerId, restaurantRating, deliveryRating });
  }
}
