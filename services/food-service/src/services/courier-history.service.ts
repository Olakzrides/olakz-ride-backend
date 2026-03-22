import { supabase } from '../config/database';

export class CourierHistoryService {
  /**
   * Courier delivery history
   */
  static async getHistory(params: {
    driverId: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    page?: number;
  }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    let query = supabase
      .from('food_orders')
      .select(`
        id, status, delivery_fee, total_amount, delivery_address,
        created_at, accepted_at, picked_up_at, delivered_at,
        restaurant:food_restaurants(id, name, address)
      `, { count: 'exact' })
      .eq('courier_id', params.driverId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status) query = query.eq('status', params.status);
    if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
    if (params.dateTo) query = query.lte('created_at', params.dateTo);

    const { data, error, count } = await query;
    if (error) throw new Error('Failed to fetch delivery history');

    return {
      deliveries: data || [],
      total: count || 0,
      page: params.page || 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Courier earnings report
   */
  static async getEarnings(params: {
    driverId: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    let query = supabase
      .from('food_courier_earnings')
      .select('id, order_id, delivery_fee, tip_amount, total_earned, status, earned_at')
      .eq('courier_id', params.driverId)
      .order('earned_at', { ascending: false });

    if (params.dateFrom) query = query.gte('earned_at', params.dateFrom);
    if (params.dateTo) query = query.lte('earned_at', params.dateTo);

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch earnings');

    const earnings = data || [];
    const totalEarned = earnings.reduce((sum, e) => sum + parseFloat(e.total_earned), 0);
    const totalDeliveries = earnings.length;
    const pendingPayout = earnings
      .filter((e) => e.status === 'pending')
      .reduce((sum, e) => sum + parseFloat(e.total_earned), 0);

    return {
      earnings,
      summary: {
        total_earned: totalEarned.toFixed(2),
        total_deliveries: totalDeliveries,
        pending_payout: pendingPayout.toFixed(2),
        currency: 'NGN',
      },
    };
  }
}
