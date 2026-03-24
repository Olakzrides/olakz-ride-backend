import { supabase } from '../config/database';
import { getFoodSocketService } from './food-socket.service';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import logger from '../utils/logger';

const MAX_COURIERS_PER_BATCH = 5;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per round
const MAX_SEARCH_ROUNDS = 3;               // max 3 rounds = 30 minutes total before courier_not_found
const MAX_SEARCH_RADIUS_KM = 15;

interface CourierCandidate {
  driverId: string;
  userId: string;
  distance: number;
  estimatedArrivalMinutes: number;
  rating: number;
  vehicleType: string;
}

export class FoodMatchingService {
  /**
   * Start courier search for a food order.
   * Called when vendor accepts the order.
   */
  static async startCourierSearch(orderId: string): Promise<void> {
    logger.info('Starting courier search for food order', { orderId });

    const { data: order } = await supabase
      .from('food_orders')
      .select('id, restaurant_id, delivery_address, excluded_courier_ids, courier_search_attempts, food_restaurants(latitude, longitude)')
      .eq('id', orderId)
      .single();

    if (!order) {
      logger.error('Order not found for courier search', { orderId });
      return;
    }

    // Update status to searching_courier
    await supabase
      .from('food_orders')
      .update({ status: 'searching_courier', updated_at: new Date().toISOString() })
      .eq('id', orderId);

    const restaurant = (order as any).food_restaurants;
    const deliveryAddress = order.delivery_address as any;

    await this.runSearchRound(orderId, {
      restaurantLat: parseFloat(restaurant.latitude),
      restaurantLng: parseFloat(restaurant.longitude),
      excludedCourierIds: order.excluded_courier_ids || [],
      roundNumber: (order.courier_search_attempts || 0) + 1,
    });
  }

  /**
   * Run one search round — find couriers, broadcast, set timeout
   */
  private static async runSearchRound(
    orderId: string,
    params: {
      restaurantLat: number;
      restaurantLng: number;
      excludedCourierIds: string[];
      roundNumber: number;
    }
  ): Promise<void> {
    const { restaurantLat, restaurantLng, excludedCourierIds, roundNumber } = params;

    // Guard: bail out immediately if order is no longer searching_courier.
    // This kills stale search chains that fire after a courier has already accepted.
    const { data: currentOrder } = await supabase
      .from('food_orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (!currentOrder || currentOrder.status !== 'searching_courier') {
      logger.info('Stale search chain — order is no longer searching, ignoring round', { orderId, roundNumber, status: currentOrder?.status });
      return;
    }

    if (roundNumber > MAX_SEARCH_ROUNDS) {
      await this.handleCourierNotFound(orderId);
      return;
    }

    // Increment search attempts
    await supabase
      .from('food_orders')
      .update({ courier_search_attempts: roundNumber, updated_at: new Date().toISOString() })
      .eq('id', orderId);

    const candidates = await this.findAvailableCouriers(restaurantLat, restaurantLng, excludedCourierIds);

    if (candidates.length === 0) {
      logger.warn('No couriers found in round', { orderId, roundNumber });
      if (roundNumber >= MAX_SEARCH_ROUNDS) {
        await this.handleCourierNotFound(orderId);
      } else {
        // Try again after timeout
        setTimeout(() => {
          this.runSearchRound(orderId, { ...params, roundNumber: roundNumber + 1 });
        }, REQUEST_TIMEOUT_MS);
      }
      return;
    }

    const batch = candidates.slice(0, MAX_COURIERS_PER_BATCH);
    const batchCourierIds = batch.map((c) => c.driverId);

    logger.info('Broadcasting food delivery request', { orderId, roundNumber, courierCount: batch.length });

    // Get order details for broadcast
    const { data: order } = await supabase
      .from('food_orders')
      .select(`
        id, total_amount, delivery_fee, delivery_address,
        food_restaurants(id, name, address, latitude, longitude)
      `)
      .eq('id', orderId)
      .single();

    const restaurant = (order as any)?.food_restaurants;

    const socketSvc = getFoodSocketService();
    if (socketSvc) {
      socketSvc.broadcastFoodDeliveryRequest(
        {
          order_id: orderId,
          restaurant: {
            id: restaurant?.id,
            name: restaurant?.name,
            address: restaurant?.address,
            lat: parseFloat(restaurant?.latitude),
            lng: parseFloat(restaurant?.longitude),
          },
          delivery_address: order?.delivery_address,
          delivery_fee: order?.delivery_fee,
          total_amount: order?.total_amount,
          round: roundNumber,
        },
        batchCourierIds
      );
    }

    // Timeout — if no acceptance, try next round
    setTimeout(async () => {
      const { data: currentOrder } = await supabase
        .from('food_orders')
        .select('status, excluded_courier_ids')
        .eq('id', orderId)
        .single();

      if (!currentOrder || currentOrder.status !== 'searching_courier') return; // already assigned or cancelled

      // Notify batch that request expired
      if (socketSvc) {
        batchCourierIds.forEach((driverId) => {
          socketSvc.emitToCourier(driverId, 'food:delivery:request_expired', { order_id: orderId });
        });
      }

      await this.runSearchRound(orderId, {
        restaurantLat,
        restaurantLng,
        excludedCourierIds: currentOrder.excluded_courier_ids || [],
        roundNumber: roundNumber + 1,
      });
    }, REQUEST_TIMEOUT_MS);
  }

  /**
   * Courier accepts a food delivery
   */
  static async courierAccept(orderId: string, driverId: string, estimatedArrivalMinutes?: number): Promise<void> {
    // Check order is still searching
    const { data: order } = await supabase
      .from('food_orders')
      .select('id, status, customer_id, restaurant_id, excluded_courier_ids')
      .eq('id', orderId)
      .single();

    if (!order) throw new Error('Order not found');
    if (order.status !== 'searching_courier') {
      throw new Error(`Order is no longer available (status: ${order.status})`);
    }

    // Generate pickup code — vendor holds this, courier enters it at pickup to confirm handover
    const pickupCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Assign courier
    await supabase
      .from('food_orders')
      .update({
        courier_id: driverId,
        status: 'accepted',
        pickup_code: pickupCode,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('status', 'searching_courier'); // atomic — only if still searching

    // Record assignment
    await supabase.from('food_delivery_assignments').insert({
      order_id: orderId,
      courier_id: driverId,
      status: 'assigned',
    });

    // Get courier user_id for notifications
    const { data: driver } = await supabase
      .from('drivers')
      .select('user_id, rating, vehicles:driver_vehicles(manufacturer, model, color, plate_number)')
      .eq('id', driverId)
      .single();

    const socketSvc = getFoodSocketService();

    // Notify customer
    if (socketSvc) {
      socketSvc.emitToCustomer(order.customer_id, 'food:order:courier_assigned', {
        order_id: orderId,
        courier_id: driverId,
        estimated_arrival_minutes: estimatedArrivalMinutes,
        courier: {
          rating: driver?.rating,
          vehicle: (driver as any)?.vehicles?.[0],
        },
      });

      // Notify vendor
      socketSvc.emitToVendor(order.restaurant_id, 'food:order:courier_assigned', {
        order_id: orderId,
        courier_id: driverId,
        estimated_arrival_minutes: estimatedArrivalMinutes,
      });
    }

    logger.info('Courier accepted food order', { orderId, driverId });
  }

  /**
   * Courier rejects a food delivery request
   */
  static async courierReject(orderId: string, driverId: string, reason?: string): Promise<void> {
    // Just log — the timeout will handle re-queuing
    logger.info('Courier rejected food delivery', { orderId, driverId, reason });
  }

  /**
   * Courier cancels AFTER accepting (including while waiting at vendor) — triggers re-queuing
   */
  static async courierCancelAfterAccept(orderId: string, driverId: string, reason: string): Promise<void> {
    const { data: order } = await supabase
      .from('food_orders')
      .select('id, status, customer_id, restaurant_id, courier_id, excluded_courier_ids, courier_search_attempts, food_restaurants(latitude, longitude)')
      .eq('id', orderId)
      .single();

    if (!order) throw new Error('Order not found');

    const cancellableStatuses = ['accepted', 'preparing', 'ready_for_pickup', 'arrived_vendor'];
    if (!cancellableStatuses.includes(order.status)) {
      throw new Error(`Cannot cancel order in status: ${order.status}`);
    }

    // Update assignment record
    await supabase
      .from('food_delivery_assignments')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      })
      .eq('order_id', orderId)
      .eq('courier_id', driverId)
      .eq('status', 'assigned');

    // Add courier to excluded list
    const excluded = [...(order.excluded_courier_ids || []), driverId];

    // Revert order to searching_courier
    await supabase
      .from('food_orders')
      .update({
        courier_id: null,
        status: 'searching_courier',
        excluded_courier_ids: excluded,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    const socketSvc = getFoodSocketService();
    const restaurant = (order as any).food_restaurants;

    // Notify customer
    if (socketSvc) {
      socketSvc.emitToCustomer(order.customer_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'searching_courier',
        message: 'Finding another courier for your order',
      });

      // Notify vendor
      socketSvc.emitToVendor(order.restaurant_id, 'food:order:courier_dropped', {
        order_id: orderId,
        reason,
        message: 'Courier cancelled — searching for another',
      });
    }

    logger.info('Courier cancelled food order — re-queuing', { orderId, driverId });

    // Re-run matching immediately
    await this.runSearchRound(orderId, {
      restaurantLat: parseFloat(restaurant.latitude),
      restaurantLng: parseFloat(restaurant.longitude),
      excludedCourierIds: excluded,
      roundNumber: (order.courier_search_attempts || 0) + 1,
    });
  }

  /**
   * No couriers found after max rounds — auto-refund wallet payment
   */
  private static async handleCourierNotFound(orderId: string): Promise<void> {
    const { data: order } = await supabase
      .from('food_orders')
      .select('customer_id, restaurant_id, total_amount, payment_status, payment_method')
      .eq('id', orderId)
      .single();

    await supabase
      .from('food_orders')
      .update({ status: 'courier_not_found', updated_at: new Date().toISOString() })
      .eq('id', orderId);

    // Auto-refund wallet payment — customer shouldn't have to manually cancel
    if (order && order.payment_status === 'paid' && order.payment_method === 'wallet') {
      try {
        const refundRef = `refund_courier_not_found_${orderId}_${Date.now()}`;
        await WalletService.credit({
          userId: order.customer_id,
          amount: parseFloat(order.total_amount),
          reference: refundRef,
          description: 'Refund: no courier found for your food order',
        });
        await supabase
          .from('food_orders')
          .update({ payment_status: 'refunded' })
          .eq('id', orderId);
        await OrderService.recordStatusChange(orderId, 'courier_not_found', 'searching_courier', 'system', 'system', 'No courier found — wallet refunded automatically');
        logger.info('Auto-refunded wallet for courier_not_found', { orderId, amount: order.total_amount });
      } catch (err: any) {
        logger.error('Failed to auto-refund wallet for courier_not_found', { orderId, error: err.message });
      }
    }

    const socketSvc = getFoodSocketService();
    if (socketSvc && order) {
      socketSvc.emitToCustomer(order.customer_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'courier_not_found',
        message: order.payment_method === 'wallet'
          ? 'We could not find a courier for your order. Your payment has been refunded to your wallet.'
          : 'We could not find a courier for your order. Please contact support for a refund.',
      });
      socketSvc.emitToVendor(order.restaurant_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'courier_not_found',
      });
    }

    logger.warn('Courier not found for food order after max rounds', { orderId });
  }

  /**
   * Find available couriers near restaurant
   * Queries the shared drivers table in Supabase (same DB as core-logistics)
   */
  private static async findAvailableCouriers(
    restaurantLat: number,
    restaurantLng: number,
    excludedCourierIds: string[]
  ): Promise<CourierCandidate[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let query = supabase
      .from('drivers')
      .select(`
        id,
        user_id,
        rating,
        service_types,
        vehicles:driver_vehicles!inner(plate_number, manufacturer, model, color, vehicle_type_id, is_active),
        availability:driver_availability!inner(is_online, is_available, last_seen_at),
        location_tracking:driver_location_tracking(latitude, longitude, created_at)
      `)
      .eq('status', 'approved')
      .eq('vehicles.is_active', true)
      .eq('availability.is_online', true)
      .eq('availability.is_available', true)
      .gte('availability.last_seen_at', fiveMinutesAgo);

    if (excludedCourierIds.length > 0) {
      query = query.not('id', 'in', `(${excludedCourierIds.join(',')})`);
    }

    const { data: drivers, error } = await query;

    if (error) {
      logger.error('Error fetching couriers for food matching', error);
      return [];
    }

    const candidates: CourierCandidate[] = [];

    for (const driver of drivers || []) {
      const locations = (driver.location_tracking || []).sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      if (locations.length === 0) continue;

      const latest = locations[0];
      const distance = this.haversine(
        restaurantLat, restaurantLng,
        parseFloat(latest.latitude), parseFloat(latest.longitude)
      );

      if (distance > MAX_SEARCH_RADIUS_KM) continue;

      const vehicle = (driver.vehicles as any[])?.[0];
      candidates.push({
        driverId: driver.id,
        userId: driver.user_id,
        distance,
        estimatedArrivalMinutes: Math.ceil((distance / 30) * 60),
        rating: parseFloat(driver.rating) || 0,
        vehicleType: vehicle?.vehicle_type_id || 'motorcycle',
      });
    }

    // Sort: closest first, then by rating
    candidates.sort((a, b) => {
      const distScore = a.distance - b.distance;
      if (Math.abs(distScore) > 1) return distScore;
      return b.rating - a.rating;
    });

    return candidates;
  }

  private static haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
