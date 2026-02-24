import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';

interface RatingInput {
  stars: number; // 1-5
  feedback?: string;
}

/**
 * DeliveryRatingService
 * Handles rating functionality for deliveries
 * Both customer and courier can rate each other
 */
export class DeliveryRatingService {
  /**
   * Customer rates courier
   */
  static async rateCourier(
    customerId: string,
    deliveryId: string,
    rating: RatingInput
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Validate rating
      if (rating.stars < 1 || rating.stars > 5) {
        return {
          success: false,
          error: 'Rating must be between 1 and 5 stars',
        };
      }

      // Get delivery details
      const { data: delivery, error: fetchError } = await supabase
        .from('deliveries')
        .select('status, customer_id, courier_id')
        .eq('id', deliveryId)
        .single();

      if (fetchError || !delivery) {
        return { success: false, error: 'Delivery not found' };
      }

      // Validate delivery is completed
      if (delivery.status !== 'delivered') {
        return {
          success: false,
          error: 'DELIVERY_NOT_COMPLETED',
        };
      }

      // Validate customer is authorized
      if (delivery.customer_id !== customerId) {
        return {
          success: false,
          error: 'UNAUTHORIZED',
        };
      }

      if (!delivery.courier_id) {
        return {
          success: false,
          error: 'No courier assigned to this delivery',
        };
      }

      // Check if rating already exists
      const { data: existingRating } = await supabase
        .from('delivery_ratings')
        .select('id, courier_rating')
        .eq('delivery_id', deliveryId)
        .single();

      if (existingRating?.courier_rating) {
        return {
          success: false,
          error: 'You have already rated this courier',
        };
      }

      // Insert or update rating
      if (existingRating) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('delivery_ratings')
          .update({
            courier_rating: rating.stars,
            courier_feedback: rating.feedback || null,
            courier_rated_at: new Date().toISOString(),
          })
          .eq('id', existingRating.id);

        if (updateError) {
          logger.error('Error updating courier rating:', updateError);
          return { success: false, error: 'Failed to submit rating' };
        }
      } else {
        // Create new rating record
        const { error: insertError } = await supabase
          .from('delivery_ratings')
          .insert({
            delivery_id: deliveryId,
            customer_id: customerId,
            courier_id: delivery.courier_id,
            courier_rating: rating.stars,
            courier_feedback: rating.feedback || null,
            courier_rated_at: new Date().toISOString(),
          });

        if (insertError) {
          logger.error('Error inserting courier rating:', insertError);
          return { success: false, error: 'Failed to submit rating' };
        }
      }

      logger.info(`Customer ${customerId} rated courier for delivery ${deliveryId}: ${rating.stars} stars`);

      return { success: true };
    } catch (error: any) {
      logger.error('Rate courier error:', error);
      return { success: false, error: 'Failed to submit rating' };
    }
  }

  /**
   * Courier rates customer
   */
  static async rateCustomer(
    courierId: string,
    deliveryId: string,
    rating: RatingInput
  ): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Validate rating
      if (rating.stars < 1 || rating.stars > 5) {
        return {
          success: false,
          error: 'Rating must be between 1 and 5 stars',
        };
      }

      // Get delivery details
      const { data: delivery, error: fetchError } = await supabase
        .from('deliveries')
        .select('status, customer_id, courier_id')
        .eq('id', deliveryId)
        .single();

      if (fetchError || !delivery) {
        return { success: false, error: 'Delivery not found' };
      }

      // Validate delivery is completed
      if (delivery.status !== 'delivered') {
        return {
          success: false,
          error: 'DELIVERY_NOT_COMPLETED',
        };
      }

      // Validate courier is authorized
      if (delivery.courier_id !== courierId) {
        return {
          success: false,
          error: 'UNAUTHORIZED',
        };
      }

      // Check if rating already exists
      const { data: existingRating } = await supabase
        .from('delivery_ratings')
        .select('id, customer_rating')
        .eq('delivery_id', deliveryId)
        .single();

      if (existingRating?.customer_rating) {
        return {
          success: false,
          error: 'You have already rated this customer',
        };
      }

      // Insert or update rating
      if (existingRating) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('delivery_ratings')
          .update({
            customer_rating: rating.stars,
            customer_feedback: rating.feedback || null,
            customer_rated_at: new Date().toISOString(),
          })
          .eq('id', existingRating.id);

        if (updateError) {
          logger.error('Error updating customer rating:', updateError);
          return { success: false, error: 'Failed to submit rating' };
        }
      } else {
        // Create new rating record
        const { error: insertError } = await supabase
          .from('delivery_ratings')
          .insert({
            delivery_id: deliveryId,
            customer_id: delivery.customer_id,
            courier_id: courierId,
            customer_rating: rating.stars,
            customer_feedback: rating.feedback || null,
            customer_rated_at: new Date().toISOString(),
          });

        if (insertError) {
          logger.error('Error inserting customer rating:', insertError);
          return { success: false, error: 'Failed to submit rating' };
        }
      }

      logger.info(`Courier ${courierId} rated customer for delivery ${deliveryId}: ${rating.stars} stars`);

      return { success: true };
    } catch (error: any) {
      logger.error('Rate customer error:', error);
      return { success: false, error: 'Failed to submit rating' };
    }
  }

  /**
   * Get delivery rating details
   */
  static async getDeliveryRating(deliveryId: string): Promise<{
    courierRating?: number;
    courierFeedback?: string;
    courierRatedAt?: string;
    customerRating?: number;
    customerFeedback?: string;
    customerRatedAt?: string;
  } | null> {
    try {
      const { data, error } = await supabase
        .from('delivery_ratings')
        .select('*')
        .eq('delivery_id', deliveryId)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        courierRating: data.courier_rating,
        courierFeedback: data.courier_feedback,
        courierRatedAt: data.courier_rated_at,
        customerRating: data.customer_rating,
        customerFeedback: data.customer_feedback,
        customerRatedAt: data.customer_rated_at,
      };
    } catch (error: any) {
      logger.error('Get delivery rating error:', error);
      return null;
    }
  }

  /**
   * Get courier's delivery rating summary
   */
  static async getCourierDeliveryRating(courierId: string): Promise<{
    averageRating: number;
    totalRatings: number;
  }> {
    try {
      // Get courier's current delivery rating
      const { data: courier } = await supabase
        .from('drivers')
        .select('delivery_rating')
        .eq('id', courierId)
        .single();

      // Get total number of ratings
      const { count } = await supabase
        .from('delivery_ratings')
        .select('courier_rating', { count: 'exact', head: true })
        .eq('courier_id', courierId)
        .not('courier_rating', 'is', null);

      return {
        averageRating: courier ? parseFloat(courier.delivery_rating) || 0 : 0,
        totalRatings: count || 0,
      };
    } catch (error: any) {
      logger.error('Get courier delivery rating error:', error);
      return {
        averageRating: 0,
        totalRatings: 0,
      };
    }
  }
}
