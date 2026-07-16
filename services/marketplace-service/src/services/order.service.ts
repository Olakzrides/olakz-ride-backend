import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../config/database';
import { WalletService } from './wallet.service';
import { FareService } from './fare.service';
import { VendorPromoService } from './vendor-promo.service';
import { emitToVendor } from './socket.service';
import logger from '../utils/logger';

interface PlaceOrderParams {
  customerId: string;
  storeId: string;
  items: Array<{ product_id: string; quantity: number; special_instructions?: string }>;
  deliveryAddress: { address: string; lat: number; lng: number; label?: string };
  paymentMethod: 'wallet';
  specialInstructions?: string;
  promoCode?: string;    // optional vendor promo code — applied to subtotal
  vehicleType?: string;  // optional vehicle type for fare calculation
}

export class OrderService {
  static async estimateTotal(params: {
    storeId: string;
    items: Array<{ product_id: string; quantity: number }>;
    deliveryAddress: { lat: number; lng: number };
    vehicleType?: string;
  }) {
    const store = await prisma.marketplaceStore.findUnique({ where: { id: params.storeId } });
    if (!store) throw new Error('Store not found');

    const productIds = params.items.map((i) => i.product_id);
    const products = await prisma.marketplaceProduct.findMany({ where: { id: { in: productIds } } });

    let subtotal = 0;
    for (const reqItem of params.items) {
      const product = products.find((p) => p.id === reqItem.product_id);
      if (!product) throw new Error(`Product ${reqItem.product_id} not found`);
      subtotal += parseFloat(product.price.toString()) * reqItem.quantity;
    }

    const fare = await FareService.calculateFare({
      storeLat: parseFloat(store.latitude.toString()),
      storeLng: parseFloat(store.longitude.toString()),
      deliveryLat: params.deliveryAddress.lat,
      deliveryLng: params.deliveryAddress.lng,
      vehicleType: params.vehicleType || 'motorcycle',
    });

    return {
      subtotal,
      delivery_fee:  fare.deliveryFee,
      service_fee:   fare.serviceFee,   // service_fee + rounding_fee combined
      total_fees:    fare.totalFees,
      total_amount:  subtotal + fare.totalFees,
      distance_km:   fare.distanceKm,
      distance_text: fare.distanceText,
      currency_code: fare.currencyCode,
    };
  }

  static async placeOrder(params: PlaceOrderParams) {
    const { customerId, storeId, items, deliveryAddress, paymentMethod, specialInstructions, promoCode } = params;
    const vehicleType = params.vehicleType || 'motorcycle';

    if (!items || items.length === 0) throw new Error('Order must contain at least one item');

    const store = await prisma.marketplaceStore.findUnique({ where: { id: storeId } });
    if (!store) throw new Error('Store not found');
    if (!store.isActive) throw new Error('Store is not active');
    if (!store.isOpen) throw new Error('Store is currently closed');

    const storeLat = parseFloat(store.latitude.toString());
    const storeLng = parseFloat(store.longitude.toString());
    if (!storeLat || !storeLng || storeLat === 0 || storeLng === 0) {
      throw new Error('Store location is not configured. Please contact support.');
    }

    // Validate products
    const productIds = items.map((i) => i.product_id);
    const products = await prisma.marketplaceProduct.findMany({
      where: { id: { in: productIds } },
    });

    for (const reqItem of items) {
      const product = products.find((p) => p.id === reqItem.product_id);
      if (!product) throw new Error(`Product ${reqItem.product_id} not found`);
      if (product.storeId !== storeId) throw new Error('Product does not belong to this store');
      if (!product.isActive || !product.isAvailable) throw new Error(`Product "${product.name}" is not available`);
    }

    // Calculate totals
    let subtotal = 0;
    const orderItemsData: any[] = [];
    for (const reqItem of items) {
      const product = products.find((p) => p.id === reqItem.product_id)!;
      const itemTotal = parseFloat(product.price.toString()) * reqItem.quantity;
      subtotal += itemTotal;
      orderItemsData.push({
        productId: reqItem.product_id,
        productName: product.name,
        productPrice: product.price,
        quantity: reqItem.quantity,
        subtotal: itemTotal,
      });
    }

    const fare = await FareService.calculateFare({
      storeLat, storeLng,
      deliveryLat: deliveryAddress.lat,
      deliveryLng: deliveryAddress.lng,
      vehicleType: vehicleType,
    });

    // totalAmount = subtotal + deliveryFee + combined serviceFee (which already includes roundingFee)
    const totalAmount = subtotal + fare.deliveryFee + fare.serviceFee;

    // ── Apply vendor promo code (discount on subtotal only) ──────────────────
    let promoId:        string | undefined;
    let discountAmount: number = 0;

    if (promoCode) {
      const promoResult = await VendorPromoService.validateCode({
        code:      promoCode,
        storeId,
        customerId,
        subtotal,
      });

      if (!promoResult.valid) {
        throw new Error(promoResult.message);
      }

      promoId        = promoResult.promoId;
      discountAmount = promoResult.discountAmount ?? 0;
    }

    const discountedTotal = Math.max(0, totalAmount - discountAmount);

    // Wallet payment — use total balance (cash + promo) for eligibility check
    const balances = await WalletService.getBalances(customerId);
    if (balances.totalBalance < discountedTotal) {
      throw new Error(`Insufficient wallet balance. Required: ₦${discountedTotal.toFixed(2)}, Available: ₦${balances.totalBalance.toFixed(2)}`);
    }

    const txRef = `mkt_order_${Date.now()}_${uuidv4().substring(0, 8)}`;
    // Deduct discountedTotal — promo discount already removed from what's charged
    const { transactionId: walletTxId, newBalance: balanceAfter, cashPortion, promoPortion } = await WalletService.deduct({
      userId:      customerId,
      amount:      discountedTotal,
      reference:   txRef,
      description: `Marketplace order at ${store.name}${discountAmount > 0 ? ` (promo: -₦${discountAmount.toFixed(2)})` : ''}`,
    });

    // Create order
    const order = await prisma.marketplaceOrder.create({
      data: {
        customerId,
        storeId,
        status:         'pending',
        paymentMethod,
        paymentStatus:  'paid',
        subtotal,
        deliveryFee:    fare.deliveryFee,
        serviceFee:     fare.serviceFee,
        roundingFee:    fare.roundingFee,
        totalAmount:    discountedTotal,         // what the customer actually paid
        deliveryAddress: deliveryAddress as any,
        vehicleType: vehicleType,
        specialInstructions: specialInstructions || null,
        walletTransactionId: walletTxId,
        walletBalanceBefore: balances.totalBalance,
        walletBalanceAfter:  balanceAfter,
        walletCashPortion:   cashPortion,
        walletPromoPortion:  promoPortion,
        orderItems: { create: orderItemsData },
      } as any,
      include: { orderItems: true },
    }) as any;

    // Store promo fields (new columns — cast to any until prisma generate is re-run)
    if (promoId && discountAmount > 0) {
      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: {
          // Using raw update via supabase to avoid Prisma type error before prisma generate
        } as any,
      }).catch(() => {/* ignore — promo fields stored below via supabase */});

      // Write promo fields directly via supabase (bypasses Prisma type check)
      const { supabase: supabaseClient } = await import('../config/database');
      await supabaseClient
        .from('marketplace_orders')
        .update({
          promo_id:        promoId,
          promo_code:      promoCode!.trim().toUpperCase(),
          discount_amount: discountAmount,
        })
        .eq('id', order.id);

      // Record promo use (non-blocking)
      VendorPromoService.recordUse({
        promoId,
        userId:         customerId,
        orderId:        order.id,
        discountAmount,
      }).catch(() => {/* already logged inside recordUse */});
    }

    await OrderService.recordStatusChange(order.id, 'pending', null, customerId, 'customer');

    // Clear customer cart for this store
    const cart = await prisma.marketplaceCart.findFirst({ where: { userId: customerId, storeId } });
    if (cart) {
      await prisma.marketplaceCartItem.deleteMany({ where: { cartId: cart.id } });
      await prisma.marketplaceCart.delete({ where: { id: cart.id } });
    }

    // Notify vendor of new order
    emitToVendor(store.ownerId, 'marketplace:order:new_order', {
      order_id:            order.id,
      status:              'pending',
      total_amount:        discountedTotal,
      discount_amount:     discountAmount > 0 ? discountAmount : undefined,
      promo_code:          promoCode ? promoCode.trim().toUpperCase() : undefined,
      subtotal,
      delivery_fee:        fare.deliveryFee,
      service_fee:         fare.serviceFee,
      items: orderItemsData.map((i) => ({
        product_id: i.productId,
        name: i.productName,
        quantity: i.quantity,
        price: parseFloat(i.productPrice.toString()),
      })),
      delivery_address: deliveryAddress,
      special_instructions: specialInstructions || null,
      created_at: order.createdAt,
    });

    // 10-minute pending expiry
    const PENDING_EXPIRY_MS = 10 * 60 * 1000;
    setTimeout(async () => {
      try {
        const current = await prisma.marketplaceOrder.findUnique({
          where: { id: order.id },
          select: { status: true, paymentStatus: true, paymentMethod: true, totalAmount: true, customerId: true },
        });
        if (!current || current.status !== 'pending') return;

        await prisma.marketplaceOrder.update({
          where: { id: order.id },
          data: {
            status: 'cancelled',
            cancellationReason: 'Order expired — vendor did not respond in time',
            cancelledBy: 'system',
            cancelledAt: new Date(),
          },
        });
        await OrderService.recordStatusChange(order.id, 'cancelled', 'pending', 'system', 'system', 'Order expired — vendor did not respond in time');

        if (current.paymentStatus === 'paid' && current.paymentMethod === 'wallet') {
          await WalletService.refundToBuckets({
            userId:        current.customerId,
            cashPortion:   parseFloat((current as any).walletCashPortion  ?? current.totalAmount.toString()),
            promoPortion:  parseFloat((current as any).walletPromoPortion ?? '0'),
            baseReference: `refund_expired_${order.id}`,
            description:   'Refund: marketplace order expired — vendor did not respond',
          });
          await prisma.marketplaceOrder.update({ where: { id: order.id }, data: { paymentStatus: 'refunded' } });
        }

        logger.info('Marketplace order auto-cancelled due to vendor inactivity', { orderId: order.id });
      } catch (err: any) {
        logger.error('Failed to auto-cancel expired marketplace order', { orderId: order.id, error: err.message });
      }
    }, PENDING_EXPIRY_MS);

    return {
      ...order,
      fare_breakdown: {
        subtotal,
        discount_amount:  discountAmount > 0 ? discountAmount : null,
        promo_code:       promoCode ? promoCode.trim().toUpperCase() : null,
        delivery_fee:     fare.deliveryFee,
        service_fee:      fare.serviceFee,
        total_fees:       fare.totalFees,
        total_amount:     discountedTotal,
        distance_km:      fare.distanceKm,
        distance_text:    fare.distanceText,
        currency_code:    fare.currencyCode,
      },
    };
  }

  static async getOrder(orderId: string, requesterId: string, requesterRole: 'customer' | 'vendor') {
    const order = await prisma.marketplaceOrder.findUnique({
      where: { id: orderId },
      include: {
        store: { select: { id: true, name: true, logoUrl: true, phone: true, address: true } },
        orderItems: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) return null;
    if (requesterRole === 'customer' && order.customerId !== requesterId) return null;

    // Enrich with rider details when a rider has been assigned
    let riderInfo: { name: string; phone: string | null; photo: string | null; rating: number | null; vehicle: { plateNumber: string; make: string; model: string; color: string } | null } | null = null;

    if (order.riderId) {
      const { supabase: supabaseClient } = await import('../config/database');

      const { data: driverRow } = await supabaseClient
        .from('drivers')
        .select('user_id, rating, vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)')
        .eq('id', order.riderId)
        .single();

      if (driverRow) {
        const { data: riderUser } = await supabaseClient
          .from('users')
          .select('first_name, last_name, phone, avatar_url')
          .eq('id', driverRow.user_id)
          .single();

        const vehicles = (driverRow.vehicles as any[]) || [];
        const activeVehicle = vehicles.find((v: any) => v.is_active) || vehicles[0] || null;

        riderInfo = {
          name:   riderUser ? `${riderUser.first_name ?? ''} ${riderUser.last_name ?? ''}`.trim() || 'Your rider' : 'Your rider',
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

    return { ...order, rider: riderInfo };
  }

  static async getCustomerHistory(params: { customerId: string; status?: string; limit?: number; page?: number }) {
    const limit = params.limit || 10;
    const offset = ((params.page || 1) - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where: { customerId: params.customerId, ...(params.status && { status: params.status }) },
        include: {
          store: { select: { id: true, name: true, logoUrl: true } },
          orderItems: { select: { id: true, productName: true, quantity: true, productPrice: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.marketplaceOrder.count({ where: { customerId: params.customerId, ...(params.status && { status: params.status }) } }),
    ]);

    return { orders, total, page: params.page || 1, limit, totalPages: Math.ceil(total / limit) };
  }

  static async cancelOrder(orderId: string, customerId: string, reason: string) {
    const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new Error('Order not found');
    if (order.customerId !== customerId) throw new Error('Unauthorized');
    if (!['pending', 'in_progress', 'searching_rider'].includes(order.status)) {
      throw new Error(`Cannot cancel order in status: ${order.status}`);
    }

    await prisma.marketplaceOrder.update({
      where: { id: orderId },
      data: { status: 'cancelled', cancellationReason: reason, cancelledBy: 'customer', cancelledAt: new Date() },
    });
    await OrderService.recordStatusChange(orderId, 'cancelled', order.status, customerId, 'customer', reason);

    if (order.paymentStatus === 'paid' && order.paymentMethod === 'wallet') {
      await WalletService.refundToBuckets({
        userId:        customerId,
        cashPortion:   parseFloat((order as any).walletCashPortion  ?? order.totalAmount.toString()),
        promoPortion:  parseFloat((order as any).walletPromoPortion ?? '0'),
        baseReference: `refund_cancel_${orderId}`,
        description:   'Refund: marketplace order cancelled',
      });
      await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { paymentStatus: 'refunded' } });
    }

    return { success: true, message: 'Order cancelled and refund processed' };
  }

  static async recordStatusChange(orderId: string, newStatus: string, previousStatus: string | null, changedBy: string, changedByRole: string, notes?: string) {
    await prisma.marketplaceOrderStatusHistory.create({
      data: { orderId, status: newStatus, previousStatus, changedBy, changedByRole, notes: notes || null },
    });
  }
}
