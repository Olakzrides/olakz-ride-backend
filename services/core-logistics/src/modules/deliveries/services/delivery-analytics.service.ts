import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { CacheService, CacheKeys, CacheTTL } from '../../../shared/utils/cache.service';

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
  averageDeliveryTime: number; // in minutes
  averageDistance: number; // in km
  currencyCode: string;
}

/**
 * DeliveryAnalyticsService
 * Admin-only analytics for delivery operations
 */
export class DeliveryAnalyticsService {
  /**
   * Get delivery analytics with filters
   * Admin only
   */
  public static async getAnalytics(filters: AnalyticsFilters): Promise<DeliveryAnalytics> {
    try {
      // Build cache key
      const cacheKey = CacheKeys.analytics(
        'delivery',
        filters.period || 'daily',
        JSON.stringify(filters)
      );

      // Check cache
      const cached = CacheService.get<DeliveryAnalytics>(cacheKey);
      if (cached) {
        logger.debug('Analytics cache hit');
        return cached;
      }

      // Calculate analytics
      const analytics = await this.calculateAnalytics(filters);

      // Cache result
      CacheService.set(cacheKey, analytics, CacheTTL.ANALYTICS);

      return analytics;
    } catch (error) {
      logger.error('Error getting delivery analytics:', error);
      throw error;
    }
  }

  /**
   * Calculate analytics from database
   */
  private static async calculateAnalytics(filters: AnalyticsFilters): Promise<DeliveryAnalytics> {
    // Build query
    let query = supabase
      .from('deliveries')
      .select('*');

    // Apply filters
    if (filters.regionId) {
      query = query.eq('region_id', filters.regionId);
    }

    if (filters.vehicleTypeId) {
      query = query.eq('vehicle_type_id', filters.vehicleTypeId);
    }

    if (filters.deliveryType) {
      query = query.eq('delivery_type', filters.deliveryType);
    }

    if (filters.fromDate) {
      query = query.gte('created_at', filters.fromDate);
    }

    if (filters.toDate) {
      query = query.lte('created_at', filters.toDate);
    }

    const { data: deliveries, error } = await query;

    if (error) {
      logger.error('Error fetching deliveries for analytics:', error);
      throw new Error('Failed to fetch analytics data');
    }

    if (!deliveries || deliveries.length === 0) {
      return this.getEmptyAnalytics();
    }

    // Calculate metrics
    const totalDeliveries = deliveries.length;
    const completedDeliveries = deliveries.filter(d => d.status === 'delivered').length;
    const cancelledDeliveries = deliveries.filter(d => d.status === 'cancelled').length;
    const noShowCount = deliveries.filter(d => d.courier_no_show === true).length;
    const issueCount = deliveries.filter(d => d.has_issue === true).length;

    // Calculate financial metrics (only for completed deliveries)
    const completedOnly = deliveries.filter(d => d.status === 'delivered');
    
    const totalRevenue = completedOnly.reduce((sum, d) => 
      sum + (d.final_fare ? parseFloat(d.final_fare) : 0), 0
    );

    const platformEarnings = completedOnly.reduce((sum, d) => 
      sum + (d.platform_earnings ? parseFloat(d.platform_earnings) : 0), 0
    );

    const courierEarnings = completedOnly.reduce((sum, d) => 
      sum + (d.courier_earnings ? parseFloat(d.courier_earnings) : 0), 0
    );

    const averageFare = completedOnly.length > 0 
      ? totalRevenue / completedOnly.length 
      : 0;

    // Calculate average delivery time (in minutes)
    const deliveryTimes = completedOnly
      .filter(d => d.created_at && d.delivered_at)
      .map(d => {
        const created = new Date(d.created_at).getTime();
        const delivered = new Date(d.delivered_at).getTime();
        return (delivered - created) / (1000 * 60); // Convert to minutes
      });

    const averageDeliveryTime = deliveryTimes.length > 0
      ? deliveryTimes.reduce((sum, time) => sum + time, 0) / deliveryTimes.length
      : 0;

    // Calculate average distance
    const distances = completedOnly
      .filter(d => d.distance_km)
      .map(d => parseFloat(d.distance_km));

    const averageDistance = distances.length > 0
      ? distances.reduce((sum, dist) => sum + dist, 0) / distances.length
      : 0;

    const currencyCode = deliveries[0]?.currency_code || 'NGN';

    return {
      totalDeliveries,
      completedDeliveries,
      cancelledDeliveries,
      noShowCount,
      issueCount,
      averageFare: Math.round(averageFare * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      platformEarnings: Math.round(platformEarnings * 100) / 100,
      courierEarnings: Math.round(courierEarnings * 100) / 100,
      averageDeliveryTime: Math.round(averageDeliveryTime * 10) / 10,
      averageDistance: Math.round(averageDistance * 10) / 10,
      currencyCode,
    };
  }

  /**
   * Get empty analytics structure
   */
  private static getEmptyAnalytics(): DeliveryAnalytics {
    return {
      totalDeliveries: 0,
      completedDeliveries: 0,
      cancelledDeliveries: 0,
      noShowCount: 0,
      issueCount: 0,
      averageFare: 0,
      totalRevenue: 0,
      platformEarnings: 0,
      courierEarnings: 0,
      averageDeliveryTime: 0,
      averageDistance: 0,
      currencyCode: 'NGN',
    };
  }

  /**
   * Get delivery volume by vehicle type
   */
  public static async getVolumeByVehicleType(filters: AnalyticsFilters): Promise<any[]> {
    try {
      let query = supabase
        .from('deliveries')
        .select('vehicle_type_id, vehicle_types(name, display_name), status');

      if (filters.regionId) {
        query = query.eq('region_id', filters.regionId);
      }

      if (filters.fromDate) {
        query = query.gte('created_at', filters.fromDate);
      }

      if (filters.toDate) {
        query = query.lte('created_at', filters.toDate);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching volume by vehicle type:', error);
        throw new Error('Failed to fetch vehicle type analytics');
      }

      // Group by vehicle type
      const grouped = (data || []).reduce((acc: any, delivery: any) => {
        const typeId = delivery.vehicle_type_id;
        if (!acc[typeId]) {
          acc[typeId] = {
            vehicleType: delivery.vehicle_types?.display_name || 'Unknown',
            total: 0,
            completed: 0,
            cancelled: 0,
          };
        }
        acc[typeId].total++;
        if (delivery.status === 'delivered') acc[typeId].completed++;
        if (delivery.status === 'cancelled') acc[typeId].cancelled++;
        return acc;
      }, {});

      return Object.values(grouped);
    } catch (error) {
      logger.error('Error in getVolumeByVehicleType:', error);
      throw error;
    }
  }

  /**
   * Get popular routes (top pickup/dropoff combinations)
   */
  public static async getPopularRoutes(filters: AnalyticsFilters, limit: number = 10): Promise<any[]> {
    try {
      let query = supabase
        .from('deliveries')
        .select('pickup_address, dropoff_address, status')
        .eq('status', 'delivered');

      if (filters.regionId) {
        query = query.eq('region_id', filters.regionId);
      }

      if (filters.fromDate) {
        query = query.gte('created_at', filters.fromDate);
      }

      if (filters.toDate) {
        query = query.lte('created_at', filters.toDate);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Error fetching popular routes:', error);
        throw new Error('Failed to fetch popular routes');
      }

      // Group by route
      const routes = (data || []).reduce((acc: any, delivery: any) => {
        const route = `${delivery.pickup_address} → ${delivery.dropoff_address}`;
        if (!acc[route]) {
          acc[route] = {
            route,
            pickupAddress: delivery.pickup_address,
            dropoffAddress: delivery.dropoff_address,
            count: 0,
          };
        }
        acc[route].count++;
        return acc;
      }, {});

      // Sort by count and return top N
      return Object.values(routes)
        .sort((a: any, b: any) => b.count - a.count)
        .slice(0, limit);
    } catch (error) {
      logger.error('Error in getPopularRoutes:', error);
      throw error;
    }
  }

  /**
   * Refresh analytics materialized view
   * Should be called periodically (every 5 minutes)
   */
  public static async refreshAnalyticsView(): Promise<void> {
    try {
      const { error } = await supabase.rpc('refresh_delivery_analytics');

      if (error) {
        logger.error('Error refreshing analytics view:', error);
        throw error;
      }

      logger.info('Analytics materialized view refreshed successfully');
    } catch (error) {
      logger.error('Error in refreshAnalyticsView:', error);
      throw error;
    }
  }
}
