import { supabase } from '../config/database';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class MarketplaceAdminService {
  // ─── Stores ──────────────────────────────────────────────────────────────────

  static async getStores(params: {
    status?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    let query = supabase
      .from('marketplace_stores')
      .select(`
        *,
        storeCategories:marketplace_store_categories(
          category:marketplace_categories(name)
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status === 'active') query = query.eq('is_active', true);
    if (params.status === 'inactive') query = query.eq('is_active', false);

    const { data: stores, count, error } = await query;
    if (error) throw new Error(`Failed to get stores: ${error.message}`);

    return {
      stores: stores || [],
      total: count || 0,
      page: params.page || 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  static async setStoreStatus(storeId: string, isActive: boolean) {
    const { data: existing } = await supabase
      .from('marketplace_stores')
      .select('id')
      .eq('id', storeId)
      .single();

    if (!existing) throw new Error('Store not found');

    const { error } = await supabase
      .from('marketplace_stores')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', storeId);

    if (error) throw new Error(`Failed to update store: ${error.message}`);
  }

  // ─── Orders ──────────────────────────────────────────────────────────────────

  static async getOrders(params: {
    status?: string;
    storeId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    let query = supabase
      .from('marketplace_orders')
      .select(`
        *,
        store:marketplace_stores(id, name),
        orderItems:marketplace_order_items(*)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status) query = query.eq('status', params.status);
    if (params.storeId) query = query.eq('store_id', params.storeId);
    if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
    if (params.dateTo) query = query.lte('created_at', params.dateTo);

    const { data: orders, count, error } = await query;
    if (error) throw new Error(`Failed to get orders: ${error.message}`);

    return {
      orders: orders || [],
      total: count || 0,
      page: params.page || 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  static async getAnalytics(dateFrom?: string, dateTo?: string) {
    let query = supabase
      .from('marketplace_orders')
      .select('created_at, total_amount, status')
      .neq('status', 'cancelled');

    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const [
      { data: orders, error: ordersError },
      { count: totalStores },
      { count: activeStores },
    ] = await Promise.all([
      query,
      supabase.from('marketplace_stores').select('*', { count: 'exact', head: true }),
      supabase.from('marketplace_stores').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    if (ordersError) throw new Error(`Failed to get analytics: ${ordersError.message}`);

    const allOrders = orders || [];
    const totalRevenue = allOrders.reduce(
      (acc: number, o: Record<string, unknown>) => acc + parseFloat(String(o.total_amount || 0)),
      0
    );

    const byDate: Record<string, { orders: number; revenue: number }> = {};
    for (const o of allOrders) {
      const date = new Date((o as Record<string, unknown>).created_at as string).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { orders: 0, revenue: 0 };
      byDate[date].orders++;
      byDate[date].revenue += parseFloat(String((o as Record<string, unknown>).total_amount || 0));
    }

    return {
      total_orders: allOrders.length,
      total_revenue: totalRevenue,
      total_stores: totalStores || 0,
      active_stores: activeStores || 0,
      by_date: Object.entries(byDate).map(([date, data]) => ({ date, ...data })),
    };
  }
}
