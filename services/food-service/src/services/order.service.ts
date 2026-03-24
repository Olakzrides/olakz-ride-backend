import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/database';
import { WalletService } from './wallet.service';
import { FareService } from './fare.service';
import { getFoodSocketService } from './food-socket.service';
import { FoodNotificationService } from './food-notification.service';
import logger from '../utils/logger';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
  | 'rejected'
  | 'courier_not_found';

interface PlaceOrderParams {
  customerId: string;
  restaurantId: string;
  items: Array<{
    item_id: string;
    quantity: number;
    extras?: string[];
    special_instructions?: string;
  }>;
  deliveryAddress: {
    address: string;
    lat: number;
    lng: number;
    instructions?: string;
  };
  paymentMethod: 'wallet' | 'card' | 'cash';
  specialInstructions?: string;
}

export class OrderService {
  /**
   * Place a new food order
   */
  static async placeOrder(params: PlaceOrderParams) {
    const { customerId, restaurantId, items, deliveryAddress, paymentMethod, specialInstructions } = params;

    // 0. Validate items not empty
    if (!items || items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    // 1. Validate restaurant
    const { data: restaurant, error: restError } = await supabase
      .from('food_restaurants')
      .select('id, name, is_open, is_active, latitude, longitude, estimated_prep_time_minutes')
      .eq('id', restaurantId)
      .single();

    if (restError || !restaurant) throw new Error('Restaurant not found');
    if (!restaurant.is_active) throw new Error('Restaurant is not active');
    if (!restaurant.is_open) throw new Error('Restaurant is currently closed');

    // Validate restaurant has valid coordinates
    const restLat = parseFloat(restaurant.latitude);
    const restLng = parseFloat(restaurant.longitude);
    if (!restLat || !restLng || restLat === 0 || restLng === 0) {
      throw new Error('Restaurant location is not configured. Please contact support.');
    }

    // 2. Validate and price all items
    const itemIds = items.map((i) => i.item_id);
    const { data: menuItems, error: itemsError } = await supabase
      .from('food_menu_items')
      .select('id, name, price, is_active, is_available, restaurant_id')
      .in('id', itemIds);

    if (itemsError) throw new Error('Failed to validate items');

    for (const reqItem of items) {
      const menuItem = menuItems?.find((m) => m.id === reqItem.item_id);
      if (!menuItem) throw new Error(`Item ${reqItem.item_id} not found`);
      if (menuItem.restaurant_id !== restaurantId) throw new Error(`Item does not belong to this restaurant`);
      if (!menuItem.is_active || !menuItem.is_available) throw new Error(`Item "${menuItem.name}" is not available`);
    }

    // 3. Calculate subtotal (items + extras)
    let subtotal = 0;
    const orderItemsData: any[] = [];

    for (const reqItem of items) {
      const menuItem = menuItems!.find((m) => m.id === reqItem.item_id)!;
      let itemTotal = parseFloat(menuItem.price) * reqItem.quantity;

      // Price extras
      const extrasSnapshot: any[] = [];
      if (reqItem.extras?.length) {
        const { data: extras } = await supabase
          .from('food_item_extras')
          .select('id, name, price')
          .in('id', reqItem.extras);

        for (const extra of extras || []) {
          itemTotal += parseFloat(extra.price) * reqItem.quantity;
          extrasSnapshot.push({ id: extra.id, name: extra.name, price: extra.price });
        }
      }

      subtotal += itemTotal;
      orderItemsData.push({
        item_id: reqItem.item_id,
        item_name: menuItem.name,
        item_price: menuItem.price,
        quantity: reqItem.quantity,
        selected_extras: extrasSnapshot,
        special_instructions: reqItem.special_instructions || null,
        subtotal: itemTotal,
      });
    }

    // 4. Calculate delivery fare
    const fare = await FareService.calculateFare({
      restaurantLat: restLat,
      restaurantLng: restLng,
      deliveryLat: deliveryAddress.lat,
      deliveryLng: deliveryAddress.lng,
      vehicleType: 'motorcycle',
    });

    const totalAmount = subtotal + fare.deliveryFee + fare.serviceFee + fare.roundingFee;

    // 5. Handle payment
    if (paymentMethod === 'card') {
      throw new Error('Card payment not yet implemented');
    }
    if (paymentMethod === 'cash') {
      throw new Error('Cash payment not yet implemented');
    }

    // Wallet payment
    const balanceBefore = await WalletService.getBalance(customerId);
    if (balanceBefore < totalAmount) {
      throw new Error(`Insufficient wallet balance. Required: ₦${totalAmount.toFixed(2)}, Available: ₦${balanceBefore.toFixed(2)}`);
    }

    const txRef = `food_order_${Date.now()}_${uuidv4().substring(0, 8)}`;

    // Deduct wallet
    const { transactionId: walletTxId, newBalance: balanceAfter } = await WalletService.deduct({
      userId: customerId,
      amount: totalAmount,
      reference: txRef,
      description: `Food order at ${restaurant.name}`,
    });

    logger.info('Wallet deducted for food order', { customerId, totalAmount, txRef });

    // Generate 4-digit delivery code (customer shows to courier at door)
    const deliveryCode = Math.floor(1000 + Math.random() * 9000).toString();

    // 6. Create order
    const { data: order, error: orderError } = await supabase
      .from('food_orders')
      .insert({
        customer_id: customerId,
        restaurant_id: restaurantId,
        status: 'pending',
        payment_method: paymentMethod,
        payment_status: 'paid',
        subtotal,
        delivery_fee: fare.deliveryFee,
        service_fee: fare.serviceFee,
        rounding_fee: fare.roundingFee,
        total_amount: totalAmount,
        delivery_address: deliveryAddress,
        special_instructions: specialInstructions || null,
        estimated_prep_time_minutes: restaurant.estimated_prep_time_minutes,
        wallet_transaction_id: walletTxId,
        wallet_balance_before: balanceBefore,
        wallet_balance_after: balanceAfter,
        delivery_code: deliveryCode,
      })
      .select()
      .single();

    if (orderError) {
      // Refund wallet on order creation failure
      await WalletService.credit({
        userId: customerId,
        amount: totalAmount,
        reference: `refund_${txRef}`,
        description: 'Refund: order creation failed',
      }).catch((e) => logger.error('Refund failed after order creation error', e));
      throw new Error('Failed to create order');
    }

    // 7. Insert order items
    const orderItems = orderItemsData.map((oi) => ({ ...oi, order_id: order.id }));
    await supabase.from('food_order_items').insert(orderItems);

    // 8. Record status history
    await this.recordStatusChange(order.id, 'pending', null, customerId, 'customer');

    // 9. Clear customer cart for this restaurant
    const { data: cart } = await supabase
      .from('food_carts')
      .select('id')
      .eq('user_id', customerId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (cart) {
      await supabase.from('food_cart_items').delete().eq('cart_id', cart.id);
      await supabase.from('food_carts').delete().eq('id', cart.id);
    }

    logger.info('Food order placed successfully', { orderId: order.id, customerId, totalAmount });

    // Notify vendor via socket + push
    const socketSvc = getFoodSocketService();
    if (socketSvc) {
      socketSvc.emitToVendor(restaurantId, 'food:order:new_request', {
        order_id: order.id,
        total_amount: totalAmount,
        items_count: items.length,
        created_at: order.created_at,
      });
    }

    // Get vendor user_id for push notification
    const { data: restaurantRow } = await supabase
      .from('food_restaurants')
      .select('owner_id, name')
      .eq('id', restaurantId)
      .single();

    if (restaurantRow) {
      await FoodNotificationService.notifyVendorNewOrder(
        restaurantRow.owner_id, order.id, restaurantRow.name
      );
    }

    return {
      ...order,
      order_items: orderItemsData,
      fare_breakdown: {
        subtotal,
        delivery_fee: fare.deliveryFee,
        service_fee: fare.serviceFee,
        rounding_fee: fare.roundingFee,
        total_amount: totalAmount,
        distance_km: fare.distanceKm,
        distance_text: fare.distanceText,
        currency_code: fare.currencyCode,
      },
    };
  }

  /**
   * Get order details (with ownership check)
   */
  static async getOrder(orderId: string, requesterId: string, requesterRole: 'customer' | 'vendor' | 'courier') {
    const { data: order, error } = await supabase
      .from('food_orders')
      .select(`
        *,
        restaurant:food_restaurants (id, name, logo_url, phone, address, latitude, longitude),
        order_items:food_order_items (*)
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) return null;

    // Ownership check
    if (requesterRole === 'customer' && order.customer_id !== requesterId) return null;
    if (requesterRole === 'courier' && order.courier_id !== requesterId) return null;
    // Vendor check happens via restaurant ownership in the controller

    return order;
  }

  /**
   * Get customer order history
   */
  static async getCustomerHistory(params: {
    customerId: string;
    status?: string;
    limit?: number;
    page?: number;
  }) {
    const limit = params.limit || 10;
    const offset = ((params.page || 1) - 1) * limit;

    let query = supabase
      .from('food_orders')
      .select(`
        id, status, payment_status, total_amount, created_at, updated_at,
        restaurant:food_restaurants (id, name, logo_url),
        order_items:food_order_items (id, item_name, quantity, item_price)
      `, { count: 'exact' })
      .eq('customer_id', params.customerId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status) query = query.eq('status', params.status);

    const { data, error, count } = await query;
    if (error) throw new Error('Failed to fetch order history');

    return {
      orders: data || [],
      total: count || 0,
      page: params.page || 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Cancel order (customer)
   */
  static async cancelOrder(orderId: string, customerId: string, reason: string) {
    const { data: order, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('id', orderId)
      .eq('customer_id', customerId)
      .single();

    if (error || !order) throw new Error('Order not found');

    const cancellableStatuses: OrderStatus[] = ['pending', 'accepted'];
    if (!cancellableStatuses.includes(order.status as OrderStatus)) {
      throw new Error(`Cannot cancel order in status: ${order.status}`);
    }

    // Update order
    await supabase
      .from('food_orders')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        cancelled_by: 'customer',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    await this.recordStatusChange(orderId, 'cancelled', order.status, customerId, 'customer', reason);

    // Refund wallet if paid
    if (order.payment_status === 'paid' && order.payment_method === 'wallet') {
      const refundRef = `refund_${orderId}_${Date.now()}`;
      await WalletService.credit({
        userId: customerId,
        amount: parseFloat(order.total_amount),
        reference: refundRef,
        description: `Refund for cancelled food order`,
      });

      await supabase
        .from('food_orders')
        .update({ payment_status: 'refunded' })
        .eq('id', orderId);

      logger.info('Wallet refunded for cancelled order', { orderId, customerId, amount: order.total_amount });
    }

    return { success: true, message: 'Order cancelled and refund processed' };
  }

  /**
   * Estimate order total (no order created)
   */
  static async estimateTotal(params: {
    restaurantId: string;
    items: Array<{ item_id: string; quantity: number; extras?: string[] }>;
    deliveryAddress: { lat: number; lng: number };
  }) {
    const { data: restaurant } = await supabase
      .from('food_restaurants')
      .select('id, latitude, longitude')
      .eq('id', params.restaurantId)
      .single();

    if (!restaurant) throw new Error('Restaurant not found');

    const itemIds = params.items.map((i) => i.item_id);
    const { data: menuItems } = await supabase
      .from('food_menu_items')
      .select('id, name, price')
      .in('id', itemIds);

    let subtotal = 0;
    for (const reqItem of params.items) {
      const menuItem = menuItems?.find((m) => m.id === reqItem.item_id);
      if (!menuItem) throw new Error(`Item ${reqItem.item_id} not found`);
      subtotal += parseFloat(menuItem.price) * reqItem.quantity;

      if (reqItem.extras?.length) {
        const { data: extras } = await supabase
          .from('food_item_extras')
          .select('price')
          .in('id', reqItem.extras);
        for (const extra of extras || []) {
          subtotal += parseFloat(extra.price) * reqItem.quantity;
        }
      }
    }

    const fare = await FareService.calculateFare({
      restaurantLat: parseFloat(restaurant.latitude),
      restaurantLng: parseFloat(restaurant.longitude),
      deliveryLat: params.deliveryAddress.lat,
      deliveryLng: params.deliveryAddress.lng,
    });

    return {
      subtotal,
      delivery_fee: fare.deliveryFee,
      service_fee: fare.serviceFee,
      rounding_fee: fare.roundingFee,
      total_amount: subtotal + fare.deliveryFee + fare.serviceFee + fare.roundingFee,
      distance_km: fare.distanceKm,
      distance_text: fare.distanceText,
      estimated_delivery_minutes: fare.durationMinutes,
      currency_code: fare.currencyCode,
    };
  }

  /**
   * Record status change in history
   */
  static async recordStatusChange(
    orderId: string,
    newStatus: string,
    previousStatus: string | null,
    changedBy: string,
    changedByRole: string,
    notes?: string
  ) {
    await supabase.from('food_order_status_history').insert({
      order_id: orderId,
      status: newStatus,
      previous_status: previousStatus,
      changed_by: changedBy,
      changed_by_role: changedByRole,
      notes: notes || null,
    });
  }
}
