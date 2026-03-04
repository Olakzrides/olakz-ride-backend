import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { CacheService, CacheKeys, CacheTTL } from '../../../shared/utils/cache.service';

interface CourierDashboardMetrics {
  totalDeliveries: number;
  completedDeliveries: number;
  cancelledDeliveries: number;
  deliveryEarnings: number;
  deliveryRating: number;
  acceptanceRate: number;
  currencyCode: string;
}

/**
 * DeliveryDashboardService
 * Provides dashboard metrics for couriers
 */
export class DeliveryDashboardService {
  /**
   * Get courier dashboard metrics
   * @param courierId - Driver ID (not user ID)
   * @param period - Time period: today, 7d, 30d, all
   */
  public static async getCourierDashboard(
    courierId: string,
    period: 'today' | '7d' | '30d' | 'all' = 'today'
  ): Promise<CourierDashboardMetrics> {
    try {
      // Check cache first
      const cacheKey = CacheKeys.courierDashboard(courierId, period);
      const cached = CacheService.get<CourierDashboardMetrics>(cacheKey);
      
      if (cached) {
        logger.debug(`Courier dashboard cache hit: ${courierId}, period: ${period}`);
        return cached;
      }

      // Calculate date range
      const dateRange = this.getDateRange(period);

      // Get delivery metrics
      const metrics = await this.calculateMetrics(courierId, dateRange);

      // Cache the result
      CacheService.set(cacheKey, metrics, CacheTTL.COURIER_DASHBOARD);

      return metrics;
    } catch (error) {
      logger.error('Error getting courier dashboard:', error);
      throw error;
    }
  }

  /**
   * Calculate date range based on period
   */
  private static getDateRange(period: string): { from: string | null; to: string } {
    const now = new Date();
    const to = now.toISOString();
    let from: string | null = null;

    switch (period) {
      case 'today':
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        from = startOfDay.toISOString();
        break;
      
      case '7d':
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        from = sevenDaysAgo.toISOString();
        break;
      
      case '30d':
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        from = thirtyDaysAgo.toISOString();
        break;
      
      case 'all':
        from = null; // No date filter
        break;
    }

    return { from, to };
  }

  /**
   * Calculate courier metrics
   */
  private static async calculateMetrics(
    courierId: string,
    dateRange: { from: string | null; to: string }
  ): Promise<CourierDashboardMetrics> {
    // Build query for deliveries
    // Use assigned_at for date filtering since we want deliveries assigned to this courier in the period
    let deliveriesQuery = supabase
      .from('deliveries')
      .select('id, status, courier_earnings, currency_code, assigned_at')
      .eq('courier_id', courierId)
      .not('assigned_at', 'is', null); // Only count deliveries that were actually assigned

    if (dateRange.from) {
      deliveriesQuery = deliveriesQuery
        .gte('assigned_at', dateRange.from)
        .lte('assigned_at', dateRange.to);
    }

    const { data: deliveries, error: deliveriesError } = await deliveriesQuery;

    if (deliveriesError) {
      logger.error('Error fetching deliveries for dashboard:', deliveriesError);
      throw new Error('Failed to fetch delivery metrics');
    }

    // Calculate metrics
    const totalDeliveries = deliveries?.length || 0;
    const completedDeliveries = deliveries?.filter(d => d.status === 'delivered').length || 0;
    const cancelledDeliveries = deliveries?.filter(d => d.status === 'cancelled').length || 0;
    
    const deliveryEarnings = deliveries
      ?.filter(d => d.status === 'delivered' && d.courier_earnings)
      .reduce((sum, d) => sum + parseFloat(d.courier_earnings), 0) || 0;

    const currencyCode = deliveries?.[0]?.currency_code || 'NGN';

    // Get delivery rating from driver record
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('delivery_rating')
      .eq('id', courierId)
      .single();

    if (driverError) {
      logger.error('Error fetching driver rating:', driverError);
    }

    const deliveryRating = driver?.delivery_rating ? parseFloat(driver.delivery_rating) : 0;

    // Calculate acceptance rate
    const acceptanceRate = await this.calculateAcceptanceRate(courierId, dateRange);

    return {
      totalDeliveries,
      completedDeliveries,
      cancelledDeliveries,
      deliveryEarnings: Math.round(deliveryEarnings * 100) / 100, // Round to 2 decimals
      deliveryRating: Math.round(deliveryRating * 10) / 10, // Round to 1 decimal
      acceptanceRate: Math.round(acceptanceRate * 10) / 10, // Round to 1 decimal
      currencyCode,
    };
  }

  /**
   * Calculate acceptance rate
   * Formula: accepted / (accepted + rejected)
   */
  private static async calculateAcceptanceRate(
    courierId: string,
    dateRange: { from: string | null; to: string }
  ): Promise<number> {
    // Use responded_at for date filtering since that's when the courier made the decision
    let requestsQuery = supabase
      .from('delivery_requests')
      .select('status, responded_at')
      .eq('courier_id', courierId)
      .in('status', ['accepted', 'declined'])
      .not('responded_at', 'is', null); // Only count requests that were responded to

    if (dateRange.from) {
      requestsQuery = requestsQuery
        .gte('responded_at', dateRange.from)
        .lte('responded_at', dateRange.to);
    }

    const { data: requests, error } = await requestsQuery;

    if (error) {
      logger.error('Error fetching delivery requests for acceptance rate:', error);
      return 0;
    }

    if (!requests || requests.length === 0) {
      return 0;
    }

    const accepted = requests.filter(r => r.status === 'accepted').length;
    const declined = requests.filter(r => r.status === 'declined').length;
    const total = accepted + declined;

    if (total === 0) {
      return 0;
    }

    return (accepted / total) * 100;
  }
}
