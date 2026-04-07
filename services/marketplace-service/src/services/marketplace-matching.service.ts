import { prisma } from '../config/database';
import { supabase } from '../config/database';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import { emitToCustomer, emitToVendor, broadcastToRiders, emitToRider } from './socket.service';
import { haversineKm } from '../utils/maps';
import logger from '../utils/logger';

const MAX_RIDERS_PER_BATCH = 5;
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes per round
const MAX_SEARCH_ROUNDS = 3;
const MAX_SEARCH_RADIUS_KM = 15;

interface RiderCandidate {
  driverId: string;
  userId: string;
  distance: number;
  rating: number;
}

export class MarketplaceMatchingService {
  static async startRiderSearch(orderId: string): Promise<void> {
    logger.info('Starting rider search for marketplace order', { orderId });

    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { store: { select: { latitude: true, longitude: true } } },
    });

    if (!order) {
      logger.error('Order not found for rider search', { orderId });
      return;
    }

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'searching_rider' },
    });

    await this.runSearchRound(orderId, {
      storeLat: parseFloat(order.store.latitude.toString()),
      storeLng: parseFloat(order.store.longitude.toString()),
      excludedRiderIds: order.excludedRiderIds || [],
      roundNumber: (order.riderSearchAttempts || 0) + 1,
    });
  }

  private static async runSearchRound(
    orderId: string,
    params: { storeLat: number; storeLng: number; excludedRiderIds: string[]; roundNumber: number }
  ): Promise<void> {
    const { storeLat, storeLng, excludedRiderIds, roundNumber } = params;

    // Status guard — bail if order is no longer searching
    const current = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (!current || current.status !== 'searching_rider') {
      logger.info('Stale rider search chain — order no longer searching', { orderId, status: current?.status });
      return;
    }

    if (roundNumber > MAX_SEARCH_ROUNDS) {
      await this.handleRiderNotFound(orderId);
      return;
    }

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { riderSearchAttempts: roundNumber },
    });

    const candidates = await this.findAvailableRiders(storeLat, storeLng, excludedRiderIds);

    if (candidates.length === 0) {
      logger.warn('No riders found in round', { orderId, roundNumber });
      if (roundNumber >= MAX_SEARCH_ROUNDS) {
        await this.handleRiderNotFound(orderId);
      } else {
        setTimeout(() => {
          this.runSearchRound(orderId, { ...params, roundNumber: roundNumber + 1 });
        }, REQUEST_TIMEOUT_MS);
      }
      return;
    }

    const batch = candidates.slice(0, MAX_RIDERS_PER_BATCH);
    const batchRiderUserIds = batch.map((r) => r.userId);

    logger.info('Broadcasting marketplace delivery request to riders', { orderId, roundNumber, count: batch.length });

    // Get order details for broadcast
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { store: { select: { id: true, name: true, address: true, latitude: true, longitude: true } } },
    });

    broadcastToRiders(batchRiderUserIds, 'marketplace:delivery:new_request', {
      order_id: orderId,
      store: {
        id: order?.store.id,
        name: order?.store.name,
        address: order?.store.address,
        lat: parseFloat(order?.store.latitude.toString() || '0'),
        lng: parseFloat(order?.store.longitude.toString() || '0'),
      },
      delivery_address: order?.deliveryAddress,
      delivery_fee: order?.deliveryFee,
      total_amount: order?.totalAmount,
      round: roundNumber,
    });

    // Timeout — if no acceptance, try next round
    setTimeout(async () => {
      const recheck = await prisma.marketplaceOrder.findUnique({
        where: { id: orderId },
        select: { status: true, excludedRiderIds: true },
      });

      if (!recheck || recheck.status !== 'searching_rider') return;

      batchRiderUserIds.forEach((uid) => {
        emitToRider(uid, 'marketplace:delivery:request_expired', { order_id: orderId });
      });

      await this.runSearchRound(orderId, {
        storeLat,
        storeLng,
        excludedRiderIds: recheck.excludedRiderIds || [],
        roundNumber: roundNumber + 1,
      });
    }, REQUEST_TIMEOUT_MS);
  }

  static async riderAccept(orderId: string, driverId: string, riderUserId: string, estimatedArrivalMinutes?: number): Promise<void> {
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, customerId: true, storeId: true, deliveryFee: true },
    });

    if (!order) throw new Error('Order not found');
    if (order.status !== 'searching_rider') throw new Error(`Order is no longer available (status: ${order.status})`);

    // Atomic update — rider accepted, not yet picked up
    await prisma.marketplaceOrder.update({
      where: { id: orderId, status: 'searching_rider' },
      data: { riderId: driverId, status: 'rider_accepted' },
    });

    await prisma.marketplaceRiderAssignment.create({
      data: { orderId, riderId: driverId, status: 'assigned' },
    });

    await OrderService.recordStatusChange(orderId, 'rider_accepted', 'searching_rider', driverId, 'rider');

    // Get rider info for notifications
    const { data: driver } = await supabase
      .from('drivers')
      .select('user_id, rating, vehicles:driver_vehicles(manufacturer, model, color, plate_number)')
      .eq('id', driverId)
      .single();

    // Get vendor user_id
    const store = await prisma.marketplaceStore.findUnique({ where: { id: order.storeId }, select: { ownerId: true } });

    emitToCustomer(order.customerId, 'marketplace:order:rider_assigned', {
      order_id: orderId,
      rider_id: driverId,
      estimated_arrival_minutes: estimatedArrivalMinutes,
      rider: { rating: driver?.rating, vehicle: (driver as any)?.vehicles?.[0] },
    });

    if (store) {
      emitToVendor(store.ownerId, 'marketplace:order:rider_assigned', {
        order_id: orderId,
        rider_id: driverId,
      });
    }

    logger.info('Rider accepted marketplace order', { orderId, driverId });
  }

  static async riderReject(orderId: string, driverId: string, reason?: string): Promise<void> {
    logger.info('Rider rejected marketplace delivery', { orderId, driverId, reason });
  }

  static async riderCancel(orderId: string, driverId: string, reason: string): Promise<void> {
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: { store: { select: { ownerId: true, latitude: true, longitude: true } } },
    });

    if (!order) throw new Error('Order not found');

    const cancellableStatuses = ['rider_accepted', 'shipped', 'arrived'];
    if (!cancellableStatuses.includes(order.status)) {
      throw new Error(`Cannot cancel from status: ${order.status}`);
    }

    await prisma.marketplaceRiderAssignment.updateMany({
      where: { orderId, riderId: driverId, status: 'assigned' },
      data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason },
    });

    const excluded = [...(order.excludedRiderIds || []), driverId];

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { riderId: null, status: 'searching_rider', excludedRiderIds: excluded },
    });

    await OrderService.recordStatusChange(orderId, 'searching_rider', order.status, driverId, 'rider', reason);

    emitToCustomer(order.customerId, 'marketplace:order:status_update', {
      order_id: orderId,
      status: 'searching_rider',
      message: 'Finding another rider for your order',
    });

    if (order.store) {
      emitToVendor(order.store.ownerId, 'marketplace:order:rider_dropped', {
        order_id: orderId,
        reason,
      });
    }

    logger.info('Rider cancelled marketplace order — re-queuing', { orderId, driverId });

    await this.runSearchRound(orderId, {
      storeLat: parseFloat(order.store.latitude.toString()),
      storeLng: parseFloat(order.store.longitude.toString()),
      excludedRiderIds: excluded,
      roundNumber: (order.riderSearchAttempts || 0) + 1,
    });
  }

  private static async handleRiderNotFound(orderId: string): Promise<void> {
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      select: { customerId: true, storeId: true, totalAmount: true, paymentStatus: true, paymentMethod: true },
    });

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'courier_not_found' },
    });

    if (order && order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      try {
        await WalletService.credit({
          userId: order.customerId,
          amount: parseFloat(order.totalAmount.toString()),
          reference: `refund_no_rider_${orderId}_${Date.now()}`,
          description: 'Refund: no rider found for your marketplace order',
        });
        await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { paymentStatus: 'refunded' } });
        logger.info('Auto-refunded wallet for rider_not_found', { orderId });
      } catch (err: any) {
        logger.error('Failed to auto-refund for rider_not_found', { orderId, error: err.message });
      }
    }

    if (order) {
      emitToCustomer(order.customerId, 'marketplace:order:status_update', {
        order_id: orderId,
        status: 'courier_not_found',
        message: order.paymentMethod === 'wallet'
          ? 'We could not find a rider for your order. Your payment has been refunded.'
          : 'We could not find a rider for your order. Please contact support.',
      });
    }

    logger.warn('No rider found for marketplace order after max rounds', { orderId });
  }

  private static async findAvailableRiders(
    storeLat: number,
    storeLng: number,
    excludedRiderIds: string[]
  ): Promise<RiderCandidate[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    let query = supabase
      .from('drivers')
      .select(`
        id, user_id, rating,
        vehicles:driver_vehicles!inner(is_active),
        availability:driver_availability!inner(is_online, is_available, last_seen_at),
        location_tracking:driver_location_tracking(latitude, longitude, created_at)
      `)
      .eq('status', 'approved')
      .eq('vehicles.is_active', true)
      .eq('availability.is_online', true)
      .eq('availability.is_available', true)
      .gte('availability.last_seen_at', fiveMinutesAgo);

    if (excludedRiderIds.length > 0) {
      query = query.not('id', 'in', `(${excludedRiderIds.join(',')})`);
    }

    const { data: drivers, error } = await query;
    if (error) {
      logger.error('Error fetching riders for marketplace matching', error);
      return [];
    }

    const candidates: RiderCandidate[] = [];

    for (const driver of drivers || []) {
      const locations = (driver.location_tracking || []).sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      if (locations.length === 0) continue;

      const latest = locations[0];
      const distance = haversineKm(
        storeLat, storeLng,
        parseFloat(latest.latitude), parseFloat(latest.longitude)
      );

      if (distance > MAX_SEARCH_RADIUS_KM) continue;

      candidates.push({
        driverId: driver.id,
        userId: driver.user_id,
        distance,
        rating: parseFloat(driver.rating) || 0,
      });
    }

    candidates.sort((a, b) => {
      const distScore = a.distance - b.distance;
      if (Math.abs(distScore) > 1) return distScore;
      return b.rating - a.rating;
    });

    return candidates;
  }
}
