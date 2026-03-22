import { supabase } from '../config/database';
import logger from '../utils/logger';

export class CartService {
  /**
   * Get or create cart for user + restaurant
   */
  static async getOrCreateCart(userId: string, restaurantId: string) {
    const { data: existing } = await supabase
      .from('food_carts')
      .select('*')
      .eq('user_id', userId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (existing) return existing;

    const { data, error } = await supabase
      .from('food_carts')
      .insert({ user_id: userId, restaurant_id: restaurantId })
      .select()
      .single();

    if (error) throw new Error('Failed to create cart');
    return data;
  }

  /**
   * Get cart with items for a user (returns null if no active cart)
   */
  static async getCart(userId: string) {
    // Find the most recently updated cart
    const { data: cart, error } = await supabase
      .from('food_carts')
      .select(`
        *,
        restaurant:food_restaurants (id, name, logo_url, is_open, estimated_prep_time_minutes),
        items:food_cart_items (
          id, quantity, selected_extras, special_instructions, unit_price,
          item:food_menu_items (id, name, description, price, images, is_available)
        )
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error('Failed to fetch cart');
    if (!cart) return null;

    // Calculate subtotal
    const subtotal = (cart.items || []).reduce((sum: number, ci: any) => {
      return sum + parseFloat(ci.unit_price) * ci.quantity;
    }, 0);

    return { ...cart, subtotal };
  }

  /**
   * Add item to cart
   * If user has a cart for a different restaurant, clear it first (one restaurant per cart)
   */
  static async addItem(params: {
    userId: string;
    itemId: string;
    quantity: number;
    selectedExtras?: string[];
    specialInstructions?: string;
  }) {
    // Get item details
    const { data: item, error: itemError } = await supabase
      .from('food_menu_items')
      .select('id, restaurant_id, price, is_active, is_available, stock_quantity')
      .eq('id', params.itemId)
      .single();

    if (itemError || !item) throw new Error('Item not found');
    if (!item.is_active || !item.is_available) throw new Error('Item is not available');

    // Check if user has a cart for a different restaurant — clear it
    const { data: existingCart } = await supabase
      .from('food_carts')
      .select('id, restaurant_id')
      .eq('user_id', params.userId)
      .neq('restaurant_id', item.restaurant_id)
      .maybeSingle();

    if (existingCart) {
      // Clear old cart (different restaurant)
      await supabase.from('food_cart_items').delete().eq('cart_id', existingCart.id);
      await supabase.from('food_carts').delete().eq('id', existingCart.id);
      logger.info('Cleared cart for different restaurant', { userId: params.userId });
    }

    // Get or create cart for this restaurant
    const cart = await this.getOrCreateCart(params.userId, item.restaurant_id);

    // Check if item already in cart — update quantity instead
    const { data: existingCartItem } = await supabase
      .from('food_cart_items')
      .select('id, quantity')
      .eq('cart_id', cart.id)
      .eq('item_id', params.itemId)
      .maybeSingle();

    if (existingCartItem) {
      const newQty = existingCartItem.quantity + params.quantity;
      const { data, error } = await supabase
        .from('food_cart_items')
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq('id', existingCartItem.id)
        .select()
        .single();
      if (error) throw new Error('Failed to update cart item');
      return data;
    }

    // Insert new cart item
    const { data, error } = await supabase
      .from('food_cart_items')
      .insert({
        cart_id: cart.id,
        item_id: params.itemId,
        quantity: params.quantity,
        selected_extras: params.selectedExtras || [],
        special_instructions: params.specialInstructions || null,
        unit_price: item.price,
      })
      .select()
      .single();

    if (error) throw new Error('Failed to add item to cart');

    // Touch cart updated_at
    await supabase
      .from('food_carts')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', cart.id);

    return data;
  }

  /**
   * Update cart item quantity
   */
  static async updateItem(params: {
    userId: string;
    cartItemId: string;
    quantity: number;
  }) {
    // Verify ownership
    const { data: cartItem, error } = await supabase
      .from('food_cart_items')
      .select('id, cart_id, food_carts!inner(user_id)')
      .eq('id', params.cartItemId)
      .single();

    if (error || !cartItem) throw new Error('Cart item not found');
    if ((cartItem as any).food_carts.user_id !== params.userId) {
      throw new Error('Unauthorized');
    }

    if (params.quantity <= 0) {
      // Remove item
      await supabase.from('food_cart_items').delete().eq('id', params.cartItemId);
      return null;
    }

    const { data, error: updateError } = await supabase
      .from('food_cart_items')
      .update({ quantity: params.quantity, updated_at: new Date().toISOString() })
      .eq('id', params.cartItemId)
      .select()
      .single();

    if (updateError) throw new Error('Failed to update cart item');
    return data;
  }

  /**
   * Remove item from cart
   */
  static async removeItem(userId: string, cartItemId: string) {
    const { data: cartItem } = await supabase
      .from('food_cart_items')
      .select('id, cart_id, food_carts!inner(user_id)')
      .eq('id', cartItemId)
      .single();

    if (!cartItem) throw new Error('Cart item not found');
    if ((cartItem as any).food_carts.user_id !== userId) throw new Error('Unauthorized');

    await supabase.from('food_cart_items').delete().eq('id', cartItemId);
  }

  /**
   * Clear entire cart
   */
  static async clearCart(userId: string) {
    const { data: cart } = await supabase
      .from('food_carts')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!cart) return;

    await supabase.from('food_cart_items').delete().eq('cart_id', cart.id);
    await supabase.from('food_carts').delete().eq('id', cart.id);
  }
}
