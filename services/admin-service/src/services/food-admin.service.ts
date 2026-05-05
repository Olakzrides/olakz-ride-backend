import { supabase } from '../config/database';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class FoodAdminService {
  // ─── Orders ──────────────────────────────────────────────────────────────────

  static async getOrders(filters: {
    status?: string;
    restaurant_id?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, restaurant_id, from, to, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('food_orders')
      .select(`
        *,
        restaurant:food_restaurants(id, name),
        orderItems:food_order_items(*)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (restaurant_id) query = query.eq('restaurant_id', restaurant_id);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data: orders, count, error } = await query;
    if (error) throw new Error(`Failed to get orders: ${error.message}`);

    return { orders: orders || [], total: count || 0, page, limit };
  }

  static async updateOrderStatus(orderId: string, status: string, adminId: string) {
    const { data: order, error: fetchError } = await supabase
      .from('food_orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) throw new Error('Order not found');

    const { data: updated, error: updateError } = await supabase
      .from('food_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to update order: ${updateError.message}`);

    // Log status history
    await supabase.from('food_order_status_history').insert({
      order_id: orderId,
      status,
      previous_status: (order as Record<string, unknown>).status,
      changed_by: adminId,
      changed_by_role: 'admin',
      notes: 'Updated by admin',
    });

    return updated;
  }

  // ─── Vendors (restaurants) ───────────────────────────────────────────────────

  static async getVendors(filters: {
    is_verified?: boolean;
    is_active?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { is_verified, is_active, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('food_restaurants')
      .select('id, owner_id, name, city, state, is_active, is_verified, average_rating, total_orders, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (is_verified !== undefined) query = query.eq('is_verified', is_verified);
    if (is_active !== undefined) query = query.eq('is_active', is_active);

    const { data: vendors, count, error } = await query;
    if (error) throw new Error(`Failed to get vendors: ${error.message}`);

    return { vendors: vendors || [], total: count || 0, page, limit };
  }

  static async approveVendor(restaurantId: string) {
    const { data: existing } = await supabase.from('food_restaurants').select('id').eq('id', restaurantId).single();
    if (!existing) throw new Error('Restaurant not found');

    const { data, error } = await supabase
      .from('food_restaurants')
      .update({ is_verified: true, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .select()
      .single();

    if (error) throw new Error(`Failed to approve vendor: ${error.message}`);
    return data;
  }

  static async suspendVendor(restaurantId: string, _reason?: string) {
    const { data: existing } = await supabase.from('food_restaurants').select('id').eq('id', restaurantId).single();
    if (!existing) throw new Error('Restaurant not found');

    const { data, error } = await supabase
      .from('food_restaurants')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .select()
      .single();

    if (error) throw new Error(`Failed to suspend vendor: ${error.message}`);
    return data;
  }

  // ─── Couriers ────────────────────────────────────────────────────────────────

  static async getCouriers(filters: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const { data: couriers, error, count } = await supabase
      .from('drivers')
      .select(`
        id, user_id, status, rating, total_rides, total_earnings, created_at,
        vehicle_type:vehicle_types(name, display_name),
        availability:driver_availability(is_online, is_available)
      `, { count: 'exact' })
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('getCouriers error', { error: error.message });
      throw new Error(`Failed to get couriers: ${error.message}`);
    }

    return { couriers: couriers || [], total: count || 0, page, limit };
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  static async getAnalytics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { count: totalOrders },
      { count: totalRestaurants },
      { count: activeRestaurants },
      { data: monthOrders },
    ] = await Promise.all([
      supabase.from('food_orders').select('*', { count: 'exact', head: true }),
      supabase.from('food_restaurants').select('*', { count: 'exact', head: true }),
      supabase.from('food_restaurants').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('food_orders').select('total_amount, status, payment_status').gte('created_at', startOfMonth),
    ]);

    const orders = monthOrders || [];
    const monthRevenue = orders
      .filter((o: Record<string, unknown>) => o.payment_status === 'paid')
      .reduce((s: number, o: Record<string, unknown>) => s + Number(o.total_amount), 0);

    return {
      total_orders: totalOrders || 0,
      total_restaurants: totalRestaurants || 0,
      active_restaurants: activeRestaurants || 0,
      this_month: {
        orders: orders.length,
        revenue: monthRevenue,
        completed: orders.filter((o: Record<string, unknown>) => o.status === 'delivered').length,
        cancelled: orders.filter((o: Record<string, unknown>) => o.status === 'cancelled').length,
      },
    };
  }

  // ─── Order Trends (analytics) ────────────────────────────────────────────────

  static async getOrderTrends(filters: { from?: string; to?: string; restaurant_id?: string }) {
    let query = supabase
      .from('food_orders')
      .select('id, total_amount, status, payment_status, created_at, restaurant_id')
      .order('created_at', { ascending: true });

    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);
    if (filters.restaurant_id) query = query.eq('restaurant_id', filters.restaurant_id);

    const { data: orders, error } = await query;
    if (error) throw new Error(`Failed to get order trends: ${error.message}`);

    const byDate: Record<string, { orders: number; revenue: number }> = {};
    for (const o of orders || []) {
      const date = new Date((o as Record<string, unknown>).created_at as string).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { orders: 0, revenue: 0 };
      byDate[date].orders++;
      if ((o as Record<string, unknown>).payment_status === 'paid') {
        byDate[date].revenue += Number((o as Record<string, unknown>).total_amount);
      }
    }

    const allOrders = orders || [];
    return {
      total_orders: allOrders.length,
      total_revenue: allOrders
        .filter((o: Record<string, unknown>) => o.payment_status === 'paid')
        .reduce((s: number, o: Record<string, unknown>) => s + Number(o.total_amount), 0),
      by_date: Object.entries(byDate).map(([date, data]) => ({ date, ...data })),
    };
  }
}
