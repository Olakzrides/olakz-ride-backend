import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { CacheService, CacheKeys, CacheTTL } from '../shared/cache.service';

interface AnalyticsFilters {
  regionId?: string;
  vehicleTypeId?: string;
  deliveryType?: 'instant' | 'scheduled';
  fromDate?: string;
  toDate?: string;
  period?: 'daily' | 'weekly' | 'monthly';
}

interface DeliveryAnalytics {
  totalDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  noShowCount: number;
  issueCount: number;
  averageFare: number;
  totalRevenue: number;
  platformEarnings: number;
  courierEarnings: number;
  averageDeliveryTime: number;
  averageDistance: number;
  currencyCode: string;
}

export class DeliveryAnalyticsService {
  static async getAnalytics(filters: AnalyticsFilters): Promise<DeliveryAnalytics> {
    const cacheKey = CacheKeys.analytics('delivery', filters.period || 'daily', JSON.stringify(filters));
    const cached = CacheService.get<DeliveryAnalytics>(cacheKey);
    if (cached) return cached;

    const analytics = await this.calculateAnalytics(filters);
    CacheService.set(cacheKey, analytics, CacheTTL.ANALYTICS);
    return analytics;
  }

  private static async calculateAnalytics(filters: AnalyticsFilters): Promise<DeliveryAnalytics> {
    let query = supabase.from('deliveries').select('*');
    if (filters.regionId) query = query.eq('region_id', filters.regionId);
    if (filters.vehicleTypeId) query = query.eq('vehicle_type_id', filters.vehicleTypeId);
    if (filters.deliveryType) query = query.eq('delivery_type', filters.deliveryType);
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);

    const { data: deliveries, error } = await query;
    if (error) throw new Error('Failed to fetch analytics data');
    if (!deliveries || deliveries.length === 0) return this.emptyAnalytics();

    const completed = deliveries.filter(d => d.status === 'delivered');
    const totalRevenue = completed.reduce((s, d) => s + (d.final_fare ? parseFloat(d.final_fare) : 0), 0);
    const platformEarnings = completed.reduce((s, d) => s + (d.platform_earnings ? parseFloat(d.platform_earnings) : 0), 0);
    const courierEarnings = completed.reduce((s, d) => s + (d.courier_earnings ? parseFloat(d.courier_earnings) : 0), 0);

    const times = completed
      .filter(d => d.created_at && d.delivered_at)
      .map(d => (new Date(d.delivered_at).getTime() - new Date(d.created_at).getTime()) / 60000);
    const distances = completed.filter(d => d.distance_km).map(d => parseFloat(d.distance_km));

    return {
      totalDeliveries: deliveries.length,
      completedDeliveries: completed.length,
      cancelledDeliveries: deliveries.filter(d => d.status === 'cancelled').length,
      noShowCount: deliveries.filter(d => d.courier_no_show === true).length,
      issueCount: deliveries.filter(d => d.has_issue === true).length,
      averageFare: completed.length ? Math.round((totalRevenue / completed.length) * 100) / 100 : 0,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      platformEarnings: Math.round(platformEarnings * 100) / 100,
      courierEarnings: Math.round(courierEarnings * 100) / 100,
      averageDeliveryTime: times.length ? Math.round((times.reduce((s, t) => s + t, 0) / times.length) * 10) / 10 : 0,
      averageDistance: distances.length ? Math.round((distances.reduce((s, d) => s + d, 0) / distances.length) * 10) / 10 : 0,
      currencyCode: deliveries[0]?.currency_code || 'NGN',
    };
  }

  private static emptyAnalytics(): DeliveryAnalytics {
    return { totalDeliveries: 0, completedDeliveries: 0, cancelledDeliveries: 0, noShowCount: 0, issueCount: 0, averageFare: 0, totalRevenue: 0, platformEarnings: 0, courierEarnings: 0, averageDeliveryTime: 0, averageDistance: 0, currencyCode: 'NGN' };
  }

  static async getVolumeByVehicleType(filters: AnalyticsFilters): Promise<unknown[]> {
    let query = supabase.from('deliveries').select('vehicle_type_id, vehicle_types(name, display_name), status');
    if (filters.regionId) query = query.eq('region_id', filters.regionId);
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);
    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch vehicle type analytics');

    const grouped = (data || []).reduce((acc: Record<string, unknown>, delivery: Record<string, unknown>) => {
      const typeId = delivery.vehicle_type_id as string;
      const vt = delivery.vehicle_types as Record<string, unknown> | null;
      if (!acc[typeId]) acc[typeId] = { vehicleType: vt?.display_name || 'Unknown', total: 0, completed: 0, cancelled: 0 };
      (acc[typeId] as Record<string, number>).total++;
      if (delivery.status === 'delivered') (acc[typeId] as Record<string, number>).completed++;
      if (delivery.status === 'cancelled') (acc[typeId] as Record<string, number>).cancelled++;
      return acc;
    }, {});
    return Object.values(grouped);
  }

  static async getPopularRoutes(filters: AnalyticsFilters, limit = 10): Promise<unknown[]> {
    let query = supabase.from('deliveries').select('pickup_address, dropoff_address').eq('status', 'delivered');
    if (filters.regionId) query = query.eq('region_id', filters.regionId);
    if (filters.fromDate) query = query.gte('created_at', filters.fromDate);
    if (filters.toDate) query = query.lte('created_at', filters.toDate);
    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch popular routes');

    const routes = (data || []).reduce((acc: Record<string, unknown>, d: Record<string, unknown>) => {
      const route = `${d.pickup_address} → ${d.dropoff_address}`;
      if (!acc[route]) acc[route] = { route, pickupAddress: d.pickup_address, dropoffAddress: d.dropoff_address, count: 0 };
      (acc[route] as Record<string, number>).count++;
      return acc;
    }, {});
    return Object.values(routes).sort((a: unknown, b: unknown) => (b as Record<string, number>).count - (a as Record<string, number>).count).slice(0, limit);
  }

  static async refreshAnalyticsView(): Promise<void> {
    const { error } = await supabase.rpc('refresh_delivery_analytics');
    if (error) { logger.error('Error refreshing analytics view', { error: error.message }); throw error; }
    logger.info('Analytics view refreshed');
  }
}
