import { prisma } from '../config/database';
import { supabase } from '../config/database';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import { haversineKm } from '../utils/maps';
import { logger } from '../config/logger';
import axios from 'axios';

const MAX_RIDERS_PER_BATCH  = 5;
const REQUEST_TIMEOUT_MS    = 10 * 60 * 1000; // 10 min per round
const MAX_SEARCH_ROUNDS     = 3;
const MAX_SEARCH_RADIUS_KM  = 15;

interface RiderCandidate {
  driverId: string;
  userId:   string;
  distance: number;
  rating:   number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relay helpers — broadcast to riders via core-logistics Socket.IO
// Spare parts has no own Socket.IO server; it relays through core-logistics
// exactly the same way marketplace-service does via admin-relay.service.
// ─────────────────────────────────────────────────────────────────────────────

const CORE_LOGISTICS_URL  = () => process.env.CORE_LOGISTICS_SERVICE_URL || 'http://localhost:3001';
const INTERNAL_KEY        = () => process.env.INTERNAL_API_KEY           || 'olakz-internal-api-key-2026-secure';

async function broadcastToRiders(userIds: string[], event: string, data: any): Promise<void> {
  try {
    await axios.post(
      `${CORE_LOGISTICS_URL()}/api/internal/socket/broadcast-to-riders`,
      { userIds, event, data },
      { headers: { 'x-internal-api-key': INTERNAL_KEY() }, timeout: 5000 }
    );
  } catch (err: any) {
    logger.warn('broadcastToRiders relay failed (non-fatal)', { event, error: err.message });
  }
}

async function emitToRider(userId: string, event: string, data: any): Promise<void> {
  try {
    await axios.post(
      `${CORE_LOGISTICS_URL()}/api/internal/socket/emit-to-rider`,
      { userId, event, data },
      { headers: { 'x-internal-api-key': INTERNAL_KEY() }, timeout: 5000 }
    );
  } catch (err: any) {
    logger.warn('emitToRider relay failed (non-fatal)', { event, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export class SparePartsMatchingService {
  // ── START RIDER SEARCH ──────────────────────────────────────────────────────
  // Called by VendorOrderService.markReady() after vendor packs the order.

  static async startRiderSearch(orderId: string): Promise<void> {
    logger.info('Starting rider search for spare parts order', { orderId });

    const order = await prisma.sparePartsOrder.findUnique({
      where: { id: orderId },
      include: { store: { select: { latitude: true, longitude: true } } },
    });

    if (!order) {
      logger.error('Order not found for rider search', { orderId });
      return;
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { status: 'searching_rider' },
    });

    await OrderService.recordStatusChange(
      orderId, 'searching_rider', 'ready_for_pickup', 'system', 'system',
      'Searching for rider'
    );

    await this.runSearchRound(orderId, {
      storeLat:         parseFloat(order.store.latitude.toString()),
      storeLng:         parseFloat(order.store.longitude.toString()),
      excludedRiderIds: (order.excludedRiderIds as string[]) || [],
      roundNumber:      (order.riderSearchAttempts || 0) + 1,
      vehicleType:      order.vehicleType || 'motorcycle',
    });
  }

  // ── SEARCH ROUND ────────────────────────────────────────────────────────────

  private static async runSearchRound(
    orderId: string,
    params: {
      storeLat:         number;
      storeLng:         number;
      excludedRiderIds: string[];
      roundNumber:      number;
      vehicleType?:     string;
    }
  ): Promise<void> {
    const { storeLat, storeLng, excludedRiderIds, roundNumber } = params;
    const vehicleType = params.vehicleType || 'motorcycle';

    // Status guard — bail if order already left searching_rider
    const current = await prisma.sparePartsOrder.findUnique({
      where:  { id: orderId },
      select: { status: true },
    });
    if (!current || current.status !== 'searching_rider') {
      logger.info('Stale rider search — order no longer searching', {
        orderId, status: current?.status,
      });
      return;
    }

    if (roundNumber > MAX_SEARCH_ROUNDS) {
      await this.handleRiderNotFound(orderId);
      return;
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { riderSearchAttempts: roundNumber },
    });

    const candidates = await this.findAvailableRiders(
      storeLat, storeLng, excludedRiderIds, vehicleType
    );

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

    const batch            = candidates.slice(0, MAX_RIDERS_PER_BATCH);
    const batchRiderUserIds = batch.map((r) => r.userId);

    logger.info('Broadcasting spare parts delivery request to riders', {
      orderId, roundNumber, count: batch.length,
    });

    // Fetch order details for broadcast payload
    const order = await prisma.sparePartsOrder.findUnique({
      where:   { id: orderId },
      include: { store: { select: { id: true, name: true, address: true, latitude: true, longitude: true } } },
    });

    await broadcastToRiders(batchRiderUserIds, 'spare_parts:delivery:new_request', {
      order_id: orderId,
      store: {
        id:      order?.store?.id,
        name:    order?.store?.name,
        address: order?.store?.address,
        lat:     parseFloat(order?.store?.latitude?.toString() || '0'),
        lng:     parseFloat(order?.store?.longitude?.toString() || '0'),
      },
      delivery_address: order?.deliveryAddress,
      delivery_fee:     order?.deliveryFee,
      total_amount:     order?.totalAmount,
      round:            roundNumber,
    });

    // Timeout → if no acceptance, advance to next round
    setTimeout(async () => {
      const recheck = await prisma.sparePartsOrder.findUnique({
        where:  { id: orderId },
        select: { status: true, excludedRiderIds: true },
      });

      if (!recheck || recheck.status !== 'searching_rider') return;

      // Notify batch riders that the request expired
      for (const uid of batchRiderUserIds) {
        await emitToRider(uid, 'spare_parts:delivery:request_expired', { order_id: orderId });
      }

      await this.runSearchRound(orderId, {
        storeLat,
        storeLng,
        excludedRiderIds: (recheck.excludedRiderIds as string[]) || [],
        roundNumber:      roundNumber + 1,
        vehicleType,
      });
    }, REQUEST_TIMEOUT_MS);
  }

  // ── RIDER ACCEPT ────────────────────────────────────────────────────────────

  static async riderAccept(
    orderId:                string,
    driverId:               string,
    riderUserId:            string,
    estimatedArrivalMinutes?: number
  ): Promise<void> {
    const order = await prisma.sparePartsOrder.findUnique({
      where:  { id: orderId },
      select: { id: true, status: true, customerId: true, storeId: true, deliveryFee: true },
    });

    if (!order) throw new Error('Order not found');
    if (order.status !== 'searching_rider') {
      throw new Error(`Order is no longer available (status: ${order.status})`);
    }

    // Atomic assign — only succeeds if still searching_rider
    await prisma.sparePartsOrder.update({
      where: { id: orderId, status: 'searching_rider' },
      data:  { riderId: driverId, status: 'rider_accepted' },
    });

    await prisma.sparePartsRiderAssignment.create({
      data: { orderId, riderId: driverId, status: 'assigned' },
    });

    await OrderService.recordStatusChange(
      orderId, 'rider_accepted', 'searching_rider', driverId, 'rider'
    );

    logger.info('Rider accepted spare parts order', { orderId, driverId });
  }

  // ── RIDER REJECT ────────────────────────────────────────────────────────────
  // Simply log — does not cancel the order, just adds to excluded list for next round

  static async riderReject(orderId: string, driverId: string, reason?: string): Promise<void> {
    logger.info('Rider rejected spare parts delivery', { orderId, driverId, reason });
    // The rejection is handled implicitly by the search round timeout.
    // Optionally add driverId to excludedRiderIds immediately for faster re-search.
    const order = await prisma.sparePartsOrder.findUnique({
      where:  { id: orderId },
      select: { excludedRiderIds: true, status: true },
    });
    if (order && order.status === 'searching_rider') {
      const excluded = [...((order.excludedRiderIds as string[]) || []), driverId];
      await prisma.sparePartsOrder.update({
        where: { id: orderId },
        data:  { excludedRiderIds: excluded },
      });
    }
  }

  // ── RIDER CANCEL ────────────────────────────────────────────────────────────
  // Rider cancels after accepting — re-queue rider search

  static async riderCancel(
    orderId:  string,
    driverId: string,
    reason:   string
  ): Promise<void> {
    const order = await prisma.sparePartsOrder.findUnique({
      where:   { id: orderId },
      include: { store: { select: { latitude: true, longitude: true } } },
    });

    if (!order) throw new Error('Order not found');

    const cancellableStatuses = [
      'rider_accepted', 'heading_to_store', 'shipped',
      'heading_to_customer', 'arrived',
    ];
    if (!cancellableStatuses.includes(order.status)) {
      throw new Error(`Cannot cancel from status: ${order.status}`);
    }

    // Cancel assignment row
    await prisma.sparePartsRiderAssignment.updateMany({
      where: { orderId, riderId: driverId, status: 'assigned' },
      data:  { status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason },
    });

    const excluded = [...((order.excludedRiderIds as string[]) || []), driverId];

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { riderId: null, status: 'searching_rider', excludedRiderIds: excluded },
    });

    await OrderService.recordStatusChange(
      orderId, 'searching_rider', order.status, driverId, 'rider', reason
    );

    logger.info('Rider cancelled spare parts order — re-queuing rider search', {
      orderId, driverId,
    });

    // Restart rider search
    await this.runSearchRound(orderId, {
      storeLat:         parseFloat(order.store.latitude.toString()),
      storeLng:         parseFloat(order.store.longitude.toString()),
      excludedRiderIds: excluded,
      roundNumber:      (order.riderSearchAttempts || 0) + 1,
      vehicleType:      order.vehicleType || 'motorcycle',
    });
  }

  // ── NO RIDER FOUND ──────────────────────────────────────────────────────────

  private static async handleRiderNotFound(orderId: string): Promise<void> {
    const order = await prisma.sparePartsOrder.findUnique({
      where: { id: orderId },
    }) as any;

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data:  { status: 'cancelled', cancellationReason: 'No rider found', cancelledBy: 'system', cancelledAt: new Date() },
    });

    await OrderService.recordStatusChange(
      orderId, 'cancelled', 'searching_rider', 'system', 'system',
      'No rider found after maximum search rounds'
    );

    // Refund wallet orders — cash was never charged
    if (order && order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      try {
        const cashPortion  = parseFloat((order.walletCashPortion  ?? order.totalAmount).toString());
        const promoPortion = parseFloat((order.walletPromoPortion ?? 0).toString());

        await WalletService.refundToBuckets({
          userId:        order.customerId,
          cashPortion,
          promoPortion,
          baseReference: `refund_no_rider_${orderId}`,
          description:   'Refund: no rider found for spare parts order',
        });

        await prisma.sparePartsOrder.update({
          where: { id: orderId },
          data:  { paymentStatus: 'refunded' },
        });

        logger.info('Wallet refunded — no rider found', { orderId });
      } catch (err: any) {
        logger.error('Failed to refund wallet on no-rider', { orderId, error: err.message });
      }
    }

    logger.warn('No rider found for spare parts order after max rounds', { orderId });
  }

  // ── FIND AVAILABLE RIDERS ───────────────────────────────────────────────────

  private static async findAvailableRiders(
    storeLat:         number,
    storeLng:         number,
    excludedRiderIds: string[],
    vehicleType:      string = 'motorcycle'
  ): Promise<RiderCandidate[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Build query — same driver pool as marketplace (shared drivers table)
    let query = supabase
      .from('drivers')
      .select(`
        id, user_id, rating,
        vehicles:driver_vehicles!inner(is_active, vehicle_type:vehicle_types(name)),
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
      logger.error('Error fetching riders for spare parts matching', error);
      return [];
    }

    const candidates: RiderCandidate[] = [];

    for (const driver of drivers || []) {
      // Get latest location (most recent first)
      const locations = ((driver.location_tracking as any[]) || []).sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      if (locations.length === 0) continue;

      // Filter by vehicle type
      const vehicles          = (driver.vehicles as any[]) || [];
      const hasMatchingVehicle = vehicles.some(
        (v: any) => v.vehicle_type?.name?.toLowerCase() === vehicleType.toLowerCase()
      );
      if (!hasMatchingVehicle) continue;

      const latest   = locations[0];
      const distance = haversineKm(
        storeLat, storeLng,
        parseFloat(latest.latitude),
        parseFloat(latest.longitude)
      );

      if (distance > MAX_SEARCH_RADIUS_KM) continue;

      candidates.push({
        driverId: driver.id,
        userId:   driver.user_id,
        distance,
        rating:   parseFloat(driver.rating) || 0,
      });
    }

    // Sort: closest first, then by rating for ties
    candidates.sort((a, b) => {
      const distScore = a.distance - b.distance;
      if (Math.abs(distScore) > 1) return distScore;
      return b.rating - a.rating;
    });

    return candidates;
  }
}
