import { supabase } from '../config/database';
import { MapsUtil } from '../utils/maps';
import logger from '../utils/logger';

export class RestaurantService {
  /**
   * List restaurants with optional filters
   */
  static async listRestaurants(params: {
    lat?: number;
    lng?: number;
    radiusKm?: number;
    cuisineType?: string;
    ratingMin?: number;
    isOpen?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }) {
    let query = supabase
      .from('food_restaurants')
      .select('*')
      .eq('is_active', true)
      .eq('is_verified', true);

    if (params.isOpen !== undefined) query = query.eq('is_open', params.isOpen);
    if (params.ratingMin) query = query.gte('average_rating', params.ratingMin);
    if (params.cuisineType) query = query.contains('cuisine_types', [params.cuisineType]);
    if (params.search) query = query.ilike('name', `%${params.search}%`);

    query = query
      .order('average_rating', { ascending: false })
      .range(params.offset || 0, (params.offset || 0) + (params.limit || 20) - 1);

    const { data, error, count } = await query;
    if (error) throw new Error('Failed to fetch restaurants');

    let restaurants = data || [];

    // Filter by radius if coordinates provided
    if (params.lat && params.lng && params.radiusKm) {
      restaurants = restaurants.filter((r) => {
        const dist = MapsUtil.calculateDistance(
          params.lat!,
          params.lng!,
          parseFloat(r.latitude),
          parseFloat(r.longitude)
        );
        return dist <= params.radiusKm!;
      });

      // Add distance to each restaurant
      restaurants = restaurants.map((r) => ({
        ...r,
        distance_km: MapsUtil.calculateDistance(
          params.lat!,
          params.lng!,
          parseFloat(r.latitude),
          parseFloat(r.longitude)
        ),
      }));

      // Sort by distance
      restaurants.sort((a: any, b: any) => a.distance_km - b.distance_km);
    }

    return { restaurants, total: count || restaurants.length };
  }

  /**
   * Get restaurant by ID with full menu
   */
  static async getRestaurantWithMenu(restaurantId: string) {
    const { data: restaurant, error } = await supabase
      .from('food_restaurants')
      .select('*')
      .eq('id', restaurantId)
      .eq('is_active', true)
      .single();

    if (error || !restaurant) return null;

    const { data: categories } = await supabase
      .from('food_menu_categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('sort_order');

    const { data: items } = await supabase
      .from('food_menu_items')
      .select(`
        *,
        food_menu_item_extras (
          is_required,
          extra:food_item_extras (id, name, description, price, image_url)
        )
      `)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true);

    // Group items by category
    const categoriesWithItems = (categories || []).map((cat) => ({
      ...cat,
      items: (items || []).filter((item) => item.category_id === cat.id),
    }));

    return {
      ...restaurant,
      menu_categories: categoriesWithItems,
      uncategorized_items: (items || []).filter((item) => !item.category_id),
    };
  }

  /**
   * Get restaurant menu only (organized by category)
   */
  static async getMenu(restaurantId: string) {
    const { data: categories, error } = await supabase
      .from('food_menu_categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw new Error('Failed to fetch menu');

    const { data: items } = await supabase
      .from('food_menu_items')
      .select(`
        *,
        food_menu_item_extras (
          is_required,
          extra:food_item_extras (id, name, description, price, image_url)
        )
      `)
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true);

    return (categories || []).map((cat) => ({
      ...cat,
      items: (items || []).filter((item) => item.category_id === cat.id),
    }));
  }

  /**
   * Get single menu item with extras
   */
  static async getMenuItem(itemId: string) {
    const { data, error } = await supabase
      .from('food_menu_items')
      .select(`
        *,
        restaurant:food_restaurants (id, name, is_open),
        food_menu_item_extras (
          is_required,
          extra:food_item_extras (id, name, description, price, image_url)
        )
      `)
      .eq('id', itemId)
      .eq('is_active', true)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Get all food categories
   */
  static async getCategories() {
    const { data, error } = await supabase
      .from('food_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) throw new Error('Failed to fetch categories');
    return data || [];
  }

  /**
   * Search restaurants and items
   */
  static async search(params: {
    query: string;
    lat?: number;
    lng?: number;
    limit?: number;
  }) {
    const [{ data: restaurants }, { data: items }] = await Promise.all([
      supabase
        .from('food_restaurants')
        .select('id, name, cuisine_types, logo_url, average_rating, is_open, latitude, longitude')
        .eq('is_active', true)
        .eq('is_verified', true)
        .ilike('name', `%${params.query}%`)
        .limit(params.limit || 10),
      supabase
        .from('food_menu_items')
        .select('id, name, description, price, images, restaurant_id, food_restaurants(id, name)')
        .eq('is_active', true)
        .eq('is_available', true)
        .ilike('name', `%${params.query}%`)
        .limit(params.limit || 10),
    ]);

    return {
      restaurants: restaurants || [],
      items: items || [],
    };
  }

  /**
   * Get restaurant by owner_id (for vendor auth)
   */
  static async getByOwnerId(ownerId: string) {
    const { data, error } = await supabase
      .from('food_restaurants')
      .select('*')
      .eq('owner_id', ownerId)
      .single();

    if (error) return null;
    return data;
  }
}
