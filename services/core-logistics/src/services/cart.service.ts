import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { Location } from '../types';

export class CartService {
  /**
   * Create a new ride cart
   */
  async createRideCart(data: {
    userId: string;
    regionId: string;
    salesChannelId: string;
    pickupLocation: Location;
    passengers: number;
    searchRadius: number;
    currencyCode: string;
  }): Promise<any> {
    try {
      // Check for existing active cart
      const { data: existingCart } = await supabase
        .from('ride_carts')
        .select('*')
        .eq('user_id', data.userId)
        .eq('status', 'active')
        .single();

      if (existingCart) {
        // Update existing cart
        const { data: updatedCart, error } = await supabase
          .from('ride_carts')
          .update({
            pickup_latitude: data.pickupLocation.latitude,
            pickup_longitude: data.pickupLocation.longitude,
            pickup_address: data.pickupLocation.address,
            passengers: data.passengers,
            search_radius: data.searchRadius,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingCart.id)
          .select()
          .single();

        if (error) throw error;
        return updatedCart;
      }

      // Create new cart
      const { data: newCart, error } = await supabase
        .from('ride_carts')
        .insert({
          user_id: data.userId,
          region_id: data.regionId,
          sales_channel_id: data.salesChannelId,
          currency_code: data.currencyCode,
          pickup_latitude: data.pickupLocation.latitude,
          pickup_longitude: data.pickupLocation.longitude,
          pickup_address: data.pickupLocation.address,
          passengers: data.passengers,
          search_radius: data.searchRadius,
          status: 'active',
          metadata: {},
        })
        .select()
        .single();

      if (error) throw error;
      return newCart;
    } catch (error) {
      logger.error('Create ride cart error:', error);
      throw error;
    }
  }

  /**
   * Get cart by ID
   */
  async getCart(cartId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('ride_carts')
        .select('*')
        .eq('id', cartId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get cart error:', error);
      throw error;
    }
  }

  /**
   * Update cart with dropoff location
   */
  async updateDropoff(cartId: string, dropoffLocation: Location): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('ride_carts')
        .update({
          dropoff_latitude: dropoffLocation.latitude,
          dropoff_longitude: dropoffLocation.longitude,
          dropoff_address: dropoffLocation.address,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cartId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Update dropoff error:', error);
      throw error;
    }
  }

  /**
   * Add line item to cart
   */
  async addLineItem(
    cartId: string,
    data: {
      variantId: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }
  ): Promise<any> {
    try {
      const { data: lineItem, error } = await supabase
        .from('cart_line_items')
        .insert({
          cart_id: cartId,
          variant_id: data.variantId,
          quantity: data.quantity,
          unit_price: data.unitPrice,
          total_price: data.totalPrice,
        })
        .select()
        .single();

      if (error) throw error;
      return lineItem;
    } catch (error) {
      logger.error('Add line item error:', error);
      throw error;
    }
  }

  /**
   * Clear all line items from cart
   */
  async clearLineItems(cartId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('cart_line_items')
        .delete()
        .eq('cart_id', cartId);

      if (error) throw error;
    } catch (error) {
      logger.error('Clear line items error:', error);
      throw error;
    }
  }

  /**
   * Get cart line items
   */
  async getCartLineItems(cartId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('cart_line_items')
        .select('*, variant:ride_variants(*)')
        .eq('cart_id', cartId);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Get cart line items error:', error);
      throw error;
    }
  }

  /**
   * Update cart status
   */
  async updateStatus(cartId: string, status: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('ride_carts')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cartId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Update cart status error:', error);
      throw error;
    }
  }

  /**
   * Get active cart by user ID
   */
  async getActiveCartByUser(userId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('ride_carts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data;
    } catch (error) {
      logger.error('Get active cart by user error:', error);
      throw error;
    }
  }
}
