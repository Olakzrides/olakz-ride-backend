import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { supabase } from '../config/database';
import { WalletService } from './wallet.service';
import { FareService } from './fare.service';
import { logger } from '../config/logger';

interface DeliveryAddress {
  address: string;
  lat:     number;
  lng:     number;
  label?:  string;
}

interface OrderItem {
  product_id:           string;
  quantity:             number;
  special_instructions?: string;
}

interface PlaceOrderParams {
  customerId:          string;
  storeId:             string;
  items:               OrderItem[];
  deliveryAddress:     DeliveryAddress;
  paymentMethod:       'wallet' | 'cash';
  specialInstructions?: string;
  vehicleType?:        string;
}

// ─────────────────────────────────────────────────────────────────────────────

export class OrderService {
  // ── ESTIMATE ────────────────────────────────────────────────────────────────

  static async estimateTotal(params: {
    storeId:         string;
    items:           Array<{ product_id: string; quantity: number }>;
    deliveryAddress: { lat: number; lng: number; address?: string };
    vehicleType?:    string;
  }) {
    const store = await prisma.sparePartsStore.findUnique({
      where: { id: params.storeId },
    });
    if (!store) throw new Error('Store not found');

    const productIds = params.items.map((i) => i.product_id);
    const products   = await prisma.sparePartsProduct.findMany({
      where: { id: { in: productIds } },
    });

    let subtotal = 0;
    for (const reqItem of params.items) {
      const product = products.find((p: { id: string }) => p.id === reqItem.product_id);
      if (!product) throw new Error(`Product ${reqItem.product_id} not found`);
      subtotal += parseFloat((product as any).price.toString()) * reqItem.quantity;
    }

    const fare = await FareService.calculateFare({
      storeLat:        parseFloat(store.latitude.toString()),
      storeLng:        parseFloat(store.longitude.toString()),
      deliveryLat:     params.deliveryAddress.lat,
      deliveryLng:     params.deliveryAddress.lng,
      vehicleType:     params.vehicleType || 'motorcycle',
      deliveryAddress: params.deliveryAddress.address ?? '',
    });

    return {
      subtotal,
      delivery_fee:  fare.deliveryFee,
      service_fee:   fare.serviceFee,
      total_fees:    fare.totalFees,
      total_amount:  subtotal + fare.totalFees,
      distance_km:   fare.distanceKm,
      distance_text: fare.distanceText,
      currency_code: fare.currencyCode,
    };
  }

  // ── PLACE ORDER ─────────────────────────────────────────────────────────────

  static async placeOrder(params: PlaceOrderParams) {
    const {
      customerId, storeId, items, deliveryAddress,
      paymentMethod, specialInstructions,
    } = params;
    const vehicleType = params.vehicleType || 'motorcycle';

    if (!items || items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    // ── 1. Validate store ─────────────────────────────────────────
    const store = await prisma.sparePartsStore.findUnique({ where: { id: storeId } });
    if (!store)           throw new Error('Store not found');
    if (!store.isActive)  throw new Error('Store is not active');
    if (!store.isOpen)    throw new Error('Store is currently closed');

    const storeLat = parseFloat(store.latitude.toString());
    const storeLng = parseFloat(store.longitude.toString());
    if (!storeLat || !storeLng || storeLat === 0 || storeLng === 0) {
      throw new Error('Store location is not configured. Please contact support.');
    }

    // ── 2. Validate products ──────────────────────────────────────
    const productIds = items.map((i) => i.product_id);
    const products   = await prisma.sparePartsProduct.findMany({
      where: { id: { in: productIds } },
    });

    for (const reqItem of items) {
      const product = products.find((p: { id: string }) => p.id === reqItem.product_id);
      if (!product) throw new Error(`Product ${reqItem.product_id} not found`);
      if ((product as any).storeId !== storeId) throw new Error('Product does not belong to this store');
      if (!(product as any).isActive || !(product as any).isAvailable) {
        throw new Error(`Product "${(product as any).name}" is not available`);
      }
    }

    // ── 3. Calculate totals ───────────────────────────────────────
    let subtotal = 0;
    const orderItemsData: Array<{
      productId:    string;
      productName:  string;
      productPrice: any;
      quantity:     number;
      subtotal:     number;
    }> = [];

    for (const reqItem of items) {
      const product   = products.find((p: { id: string }) => p.id === reqItem.product_id)!;
      const itemTotal = parseFloat((product as any).price.toString()) * reqItem.quantity;
      subtotal       += itemTotal;
      orderItemsData.push({
        productId:    reqItem.product_id,
        productName:  product.name,
        productPrice: product.price,
        quantity:     reqItem.quantity,
        subtotal:     itemTotal,
      });
    }

    const fare = await FareService.calculateFare({
      storeLat, storeLng,
      deliveryLat:     deliveryAddress.lat,
      deliveryLng:     deliveryAddress.lng,
      vehicleType,
      deliveryAddress: deliveryAddress.address ?? '',
    });

    const totalAmount = subtotal + fare.deliveryFee + fare.serviceFee;

    // ── 4. Payment handling ───────────────────────────────────────
    let walletTxId:    string | undefined;
    let balanceAfter:  number | undefined;
    let cashPortion:   number | undefined;
    let promoPortion:  number | undefined;
    let balanceBefore: number | undefined;
    let paymentStatus: string;

    if (paymentMethod === 'wallet') {
      const balances = await WalletService.getBalances(customerId);
      balanceBefore  = balances.totalBalance;

      if (balances.totalBalance < totalAmount) {
        throw new Error(
          `Insufficient wallet balance. Required: ₦${totalAmount.toFixed(2)}, Available: ₦${balances.totalBalance.toFixed(2)}`
        );
      }

      const txRef = `sp_order_${Date.now()}_${uuidv4().substring(0, 8)}`;
      const deduct = await WalletService.deduct({
        userId:      customerId,
        amount:      totalAmount,
        reference:   txRef,
        description: `Spare parts order at ${store.name}`,
      });
      walletTxId   = deduct.transactionId;
      balanceAfter = deduct.newBalance;
      cashPortion  = deduct.cashPortion;
      promoPortion = deduct.promoPortion;
      paymentStatus = 'paid';
    } else {
      // Cash on delivery — no upfront charge
      paymentStatus = 'pending';
    }

    // ── 5. Create order ───────────────────────────────────────────
    const order = await prisma.sparePartsOrder.create({
      data: {
        customerId,
        storeId,
        status:              'pending',
        paymentMethod,
        paymentStatus,
        subtotal,
        deliveryFee:         fare.deliveryFee,
        serviceFee:          fare.serviceFee,
        roundingFee:         fare.roundingFee,
        totalAmount,
        deliveryAddress:     deliveryAddress as any,
        vehicleType,
        specialInstructions: specialInstructions || null,
        walletTransactionId: walletTxId   ?? null,
        walletBalanceBefore: balanceBefore ?? null,
        walletBalanceAfter:  balanceAfter  ?? null,
        walletCashPortion:   cashPortion   ?? null,
        walletPromoPortion:  promoPortion  ?? null,
        orderItems: { create: orderItemsData },
      },
      include: { orderItems: true },
    });

    // ── 6. Record status history ──────────────────────────────────
    await OrderService.recordStatusChange(
      order.id, 'pending', null, customerId, 'customer'
    );

    // ── 7. Clear customer cart ────────────────────────────────────
    const cart = await prisma.sparePartsCart.findFirst({
      where: { userId: customerId, storeId },
    });
    if (cart) {
      await prisma.sparePartsCartItem.deleteMany({ where: { cartId: cart.id } });
      await prisma.sparePartsCart.delete({ where: { id: cart.id } });
    }

    // ── 8. Notify vendor (via Supabase — no Socket.IO in Phase 3) ─
    // Socket.IO vendor notifications are Phase 4. For now we log.
    logger.info('New spare parts order placed', {
      orderId:   order.id,
      storeId,
      customerId,
      totalAmount,
      paymentMethod,
    });

    // ── 9. 10-minute auto-cancel if vendor doesn't respond ────────
    const PENDING_EXPIRY_MS = 10 * 60 * 1000;
    setTimeout(async () => {
      try {
        const current = await prisma.sparePartsOrder.findUnique({
          where:  { id: order.id },
          select: {
            status: true, paymentStatus: true, paymentMethod: true,
            totalAmount: true, customerId: true,
            walletCashPortion: true, walletPromoPortion: true,
          },
        });

        if (!current || current.status !== 'pending') return;

        await prisma.sparePartsOrder.update({
          where: { id: order.id },
          data: {
            status:             'cancelled',
            cancellationReason: 'Order expired — vendor did not respond in time',
            cancelledBy:        'system',
            cancelledAt:        new Date(),
          },
        });

        await OrderService.recordStatusChange(
          order.id, 'cancelled', 'pending', 'system', 'system',
          'Order expired — vendor did not respond in time'
        );

        // Refund wallet orders only — cash orders were never charged
        if (current.paymentStatus === 'paid' && current.paymentMethod === 'wallet') {
          await WalletService.refundToBuckets({
            userId:        current.customerId,
            cashPortion:   parseFloat(current.walletCashPortion?.toString()  ?? current.totalAmount.toString()),
            promoPortion:  parseFloat(current.walletPromoPortion?.toString() ?? '0'),
            baseReference: `refund_expired_${order.id}`,
            description:   'Refund: spare parts order expired — vendor did not respond',
          });
          await prisma.sparePartsOrder.update({
            where: { id: order.id },
            data:  { paymentStatus: 'refunded' },
          });
        }

        logger.info('Spare parts order auto-cancelled due to vendor inactivity', {
          orderId: order.id,
        });
      } catch (err: any) {
        logger.error('Failed to auto-cancel expired spare parts order', {
          orderId: order.id,
          error:   err.message,
        });
      }
    }, PENDING_EXPIRY_MS);

    return {
      ...order,
      fare_breakdown: {
        subtotal,
        delivery_fee:  fare.deliveryFee,
        service_fee:   fare.serviceFee,
        total_fees:    fare.totalFees,
        total_amount:  totalAmount,
        distance_km:   fare.distanceKm,
        distance_text: fare.distanceText,
        currency_code: fare.currencyCode,
      },
    };
  }

  // ── GET ORDER ────────────────────────────────────────────────────────────────

  static async getOrder(
    orderId:       string,
    requesterId:   string,
    requesterRole: 'customer' | 'vendor'
  ) {
    const order = await prisma.sparePartsOrder.findUnique({
      where:   { id: orderId },
      include: {
        store:         { select: { id: true, name: true, logoUrl: true, phone: true, address: true } },
        orderItems:    true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) return null;
    if (requesterRole === 'customer' && order.customerId !== requesterId) return null;

    // Enrich order items with product first image
    const productIds = (order.orderItems as any[]).map((i) => i.productId).filter(Boolean);
    const productImageMap: Record<string, string | null> = {};

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('spare_parts_products')
        .select('id, images')
        .in('id', productIds);

      for (const p of products ?? []) {
        productImageMap[p.id] =
          Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
      }
    }

    const enrichedItems = (order.orderItems as any[]).map((item) => ({
      ...item,
      productImage: productImageMap[item.productId] ?? null,
    }));

    // Enrich with rider info if assigned
    let riderInfo: any = null;
    if (order.riderId) {
      const { data: driverRow } = await supabase
        .from('drivers')
        .select('user_id, rating, vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)')
        .eq('id', order.riderId)
        .single();

      if (driverRow) {
        const { data: riderUser } = await supabase
          .from('users')
          .select('first_name, last_name, phone, avatar_url')
          .eq('id', driverRow.user_id)
          .single();

        const vehicles     = (driverRow.vehicles as any[]) || [];
        const activeVehicle = vehicles.find((v: any) => v.is_active) || vehicles[0] || null;

        riderInfo = {
          name:   riderUser
            ? `${riderUser.first_name ?? ''} ${riderUser.last_name ?? ''}`.trim() || 'Your rider'
            : 'Your rider',
          phone:  riderUser?.phone ?? null,
          photo:  riderUser?.avatar_url ?? null,
          rating: driverRow.rating ? parseFloat(driverRow.rating) : null,
          vehicle: activeVehicle
            ? {
                plateNumber: activeVehicle.plate_number,
                make:        activeVehicle.manufacturer,
                model:       activeVehicle.model,
                color:       activeVehicle.color,
              }
            : null,
        };
      }
    }

    return { ...order, orderItems: enrichedItems, rider: riderInfo };
  }

  // ── ORDER HISTORY ────────────────────────────────────────────────────────────

  static async getCustomerHistory(params: {
    customerId: string;
    status?:    string;
    limit?:     number;
    page?:      number;
  }) {
    const limit  = params.limit  || 10;
    const offset = ((params.page || 1) - 1) * limit;

    const where = {
      customerId: params.customerId,
      ...(params.status && { status: params.status }),
    };

    const [orders, total] = await Promise.all([
      prisma.sparePartsOrder.findMany({
        where,
        include: {
          store:      { select: { id: true, name: true, logoUrl: true } },
          orderItems: { select: { id: true, productName: true, quantity: true, productPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:    offset,
        take:    limit,
      }),
      prisma.sparePartsOrder.count({ where }),
    ]);

    return {
      orders,
      total,
      page:       params.page || 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── CANCEL ORDER ─────────────────────────────────────────────────────────────
  // Allowed from: pending, in_progress, searching_rider

  static async cancelOrder(
    orderId:    string,
    customerId: string,
    reason:     string
  ) {
    const order = await prisma.sparePartsOrder.findUnique({ where: { id: orderId } });
    if (!order)                        throw new Error('Order not found');
    if (order.customerId !== customerId) throw new Error('Unauthorized');
    if (!['pending', 'in_progress', 'searching_rider'].includes(order.status)) {
      throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    await prisma.sparePartsOrder.update({
      where: { id: orderId },
      data: {
        status:             'cancelled',
        cancellationReason: reason,
        cancelledBy:        'customer',
        cancelledAt:        new Date(),
      },
    });
    await OrderService.recordStatusChange(
      orderId, 'cancelled', order.status, customerId, 'customer', reason
    );

    // Refund wallet orders — cash orders were never charged
    if (order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      await WalletService.refundToBuckets({
        userId:        customerId,
        cashPortion:   parseFloat((order as any).walletCashPortion?.toString()  ?? order.totalAmount.toString()),
        promoPortion:  parseFloat((order as any).walletPromoPortion?.toString() ?? '0'),
        baseReference: `refund_cancel_${orderId}`,
        description:   'Refund: spare parts order cancelled by customer',
      });
      await prisma.sparePartsOrder.update({
        where: { id: orderId },
        data:  { paymentStatus: 'refunded' },
      });
    }

    return { success: true, message: 'Order cancelled successfully' };
  }

  // ── TRACKING ──────────────────────────────────────────────────────────────────

  static async getTracking(orderId: string) {
    const order = await prisma.sparePartsOrder.findUnique({
      where:   { id: orderId },
      select:  { id: true, status: true, riderId: true },
      include: {
        statusHistory:  { orderBy: { createdAt: 'asc' } },
        riderLocations: {
          orderBy: { createdAt: 'desc' },
          take:    1,
        },
      } as any,
    });
    if (!order) return null;

    return {
      order_id:       order.id,
      status:         order.status,
      status_history: (order as any).statusHistory ?? [],
      rider_location: (order as any).riderLocations?.[0] ?? null,
    };
  }

  // ── RECEIPT ───────────────────────────────────────────────────────────────────

  static async getReceipt(orderId: string) {
    const order = await prisma.sparePartsOrder.findUnique({
      where:   { id: orderId },
      include: {
        store:      { select: { id: true, name: true, address: true, phone: true } },
        orderItems: true,
      },
    });
    if (!order) return null;

    return {
      order_id:       order.id,
      store:          (order as any).store,
      items:          order.orderItems,
      subtotal:       parseFloat(order.subtotal.toString()),
      delivery_fee:   parseFloat(order.deliveryFee.toString()),
      service_fee:    parseFloat(order.serviceFee.toString()),
      total_amount:   parseFloat(order.totalAmount.toString()),
      payment_method: order.paymentMethod,
      payment_status: order.paymentStatus,
      status:         order.status,
      created_at:     order.createdAt,
      delivered_at:   order.deliveredAt,
    };
  }

  // ── REVIEW ─────────────────────────────────────────────────────────────────────

  static async submitReview(params: {
    orderId:        string;
    customerId:     string;
    storeRating:    number;
    comment?:       string;
    productRatings: Array<{ product_id: string; rating: number }>;
  }) {
    const { orderId, customerId, storeRating, comment, productRatings } = params;

    const order = await prisma.sparePartsOrder.findUnique({ where: { id: orderId } });
    if (!order)                          throw new Error('Order not found');
    if (order.customerId !== customerId) throw new Error('Unauthorized');
    if (order.status !== 'delivered')    throw new Error('Can only review delivered orders');

    // Check not already reviewed
    const existing = await prisma.sparePartsReview.findUnique({
      where: { orderId },
    });
    if (existing) throw new Error('Order has already been reviewed');

    if (storeRating < 1 || storeRating > 5) {
      throw new Error('store_rating must be between 1 and 5');
    }

    // Create review with product sub-ratings
    const review = await prisma.sparePartsReview.create({
      data: {
        orderId,
        customerId,
        storeId:     order.storeId,
        storeRating,
        comment:     comment || null,
        productReviews: {
          create: productRatings.map((pr) => ({
            productId:     pr.product_id,
            productRating: pr.rating,
          })),
        },
      },
      include: { productReviews: true },
    });

    // Update store average rating
    const storeReviews = await prisma.sparePartsReview.findMany({
      where:  { storeId: order.storeId },
      select: { storeRating: true },
    });
    const avgStoreRating =
      storeReviews.reduce((s: number, r: { storeRating: number }) => s + r.storeRating, 0) / storeReviews.length;

    await prisma.sparePartsStore.update({
      where: { id: order.storeId },
      data: {
        averageRating: Math.round(avgStoreRating * 100) / 100,
        totalRatings:  storeReviews.length,
      },
    });

    // Update product average ratings
    for (const pr of productRatings) {
      if (pr.rating < 1 || pr.rating > 5) continue;
      const productReviews = await prisma.sparePartsProductReview.findMany({
        where:  { productId: pr.product_id },
        select: { productRating: true },
      });
      const avgProductRating =
        productReviews.reduce((s: number, r: { productRating: number }) => s + r.productRating, 0) / productReviews.length;

      await prisma.sparePartsProduct.update({
        where: { id: pr.product_id },
        data: {
          averageRating: Math.round(avgProductRating * 100) / 100,
          totalRatings:  productReviews.length,
        },
      });
    }

    return review;
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────────

  static async recordStatusChange(
    orderId:       string,
    newStatus:     string,
    previousStatus: string | null,
    changedBy:     string,
    changedByRole: string,
    notes?:        string
  ) {
    await prisma.sparePartsOrderStatusHistory.create({
      data: {
        orderId,
        status:         newStatus,
        previousStatus: previousStatus ?? null,
        changedBy,
        changedByRole,
        notes:          notes || null,
      },
    });
  }
}
