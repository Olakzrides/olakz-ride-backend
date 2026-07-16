import { supabase } from '../config/database';
import { OrderService } from './order.service';
import { FoodMatchingService } from './food-matching.service';
import { FoodNotificationService } from './food-notification.service';
import { getFoodSocketService } from './food-socket.service';
import logger from '../utils/logger';

export class VendorOrderService {
  /**
   * Get vendor orders with filters
   * Enriched with customer name + phone and assigned courier details.
   */
  static async getOrders(params: {
    restaurantId: string;
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
        id, status, payment_status, payment_method, subtotal, delivery_fee,
        service_fee, total_amount, special_instructions, estimated_prep_time_minutes,
        created_at, accepted_at, preparing_at, ready_at,
        delivery_address, customer_id, courier_id,
        order_items:food_order_items (id, item_name, quantity, item_price, selected_extras, special_instructions, subtotal)
      `, { count: 'exact' })
      .eq('restaurant_id', params.restaurantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status) query = query.eq('status', params.status);
    if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
    if (params.dateTo) query = query.lte('created_at', params.dateTo);

    const { data, error, count } = await query;
    if (error) throw new Error('Failed to fetch orders');

    const orders = data || [];

    // ── Enrich with customer details ────────────────────────────────────────
    const customerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];
    const courierIds  = [...new Set(orders.map((o: any) => o.courier_id).filter(Boolean))];

    const customerMap = new Map<string, { name: string; phone: string | null }>();
    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', customerIds);
      for (const u of users ?? []) {
        customerMap.set(u.id, {
          name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Customer',
          phone: u.phone ?? null,
        });
      }
    }

    // ── Enrich with courier/driver details ────────────────────────────────
    const courierMap = new Map<string, { name: string; phone: string | null; photo: string | null }>();
    if (courierIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, user:users!drivers_user_id_fkey(first_name, last_name, phone, avatar_url)')
        .in('id', courierIds);
      for (const d of drivers ?? []) {
        const u = (d as any).user;
        courierMap.set(d.id, {
          name:  u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Courier' : 'Courier',
          phone: u?.phone ?? null,
          photo: u?.avatar_url ?? null,
        });
      }
    }

    const enriched = orders.map((o: any) => ({
      ...o,
      customer: customerMap.get(o.customer_id) ?? null,
      courier:  o.courier_id ? (courierMap.get(o.courier_id) ?? null) : null,
    }));

    return {
      orders: enriched,
      total: count || 0,
      page: params.page || 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Get single order for vendor — enriched with customer + courier details
   */
  static async getOrder(orderId: string, restaurantId: string) {
    const { data, error } = await supabase
      .from('food_orders')
      .select(`
        *,
        order_items:food_order_items (*),
        status_history:food_order_status_history (status, previous_status, changed_by_role, notes, created_at),
        pickup:food_vendor_pickups (id, pickup_code, status, special_instructions, created_at)
      `)
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) return null;

    const order = data as Record<string, any>;

    // Fetch product images for order items
    const itemIds = (order.order_items as any[]).map((i: any) => i.item_id).filter(Boolean);
    let itemImageMap: Record<string, string | null> = {};

    if (itemIds.length > 0) {
      const { data: menuItems } = await supabase
        .from('food_menu_items')
        .select('id, images')
        .in('id', itemIds);

      if (menuItems) {
        for (const m of menuItems) {
          const firstImage = Array.isArray(m.images) && m.images.length > 0 ? m.images[0] : null;
          itemImageMap[m.id] = firstImage;
        }
      }
    }

    const enrichedOrderItems = (order.order_items as any[]).map((item: any) => ({
      ...item,
      item_image: itemImageMap[item.item_id] ?? null,
    }));

    // Enrich customer details
    let customer = null;
    if (order.customer_id) {
      const { data: user } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone, avatar_url')
        .eq('id', order.customer_id)
        .maybeSingle();
      if (user) {
        customer = {
          id:    user.id,
          name:  `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
          phone: user.phone ?? null,
          photo: user.avatar_url ?? null,
        };
      }
    }

    // Enrich courier/driver details
    let courier = null;
    if (order.courier_id) {
      const { data: driver } = await supabase
        .from('drivers')
        .select(`
          id, rating,
          user:users!drivers_user_id_fkey(first_name, last_name, phone, avatar_url),
          vehicles:driver_vehicles(manufacturer, model, color, plate_number, is_active)
        `)
        .eq('id', order.courier_id)
        .maybeSingle();

      if (driver) {
        const d = driver as Record<string, any>;
        const u = d.user as Record<string, any> | null;
        const vehicles = (d.vehicles as any[]) || [];
        const activeVehicle = vehicles.find(v => v.is_active) || vehicles[0] || null;
        courier = {
          id:     order.courier_id,
          name:   u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Courier' : 'Courier',
          phone:  u?.phone ?? null,
          photo:  u?.avatar_url ?? null,
          rating: parseFloat(String(d.rating ?? 0)),
          vehicle: activeVehicle ? {
            model:        `${activeVehicle.manufacturer} ${activeVehicle.model}`,
            color:        activeVehicle.color,
            plate_number: activeVehicle.plate_number,
          } : null,
        };
      }
    }

    return { ...order, order_items: enrichedOrderItems, customer, courier };
  }

  /**
   * Accept order
   */
  static async acceptOrder(orderId: string, restaurantId: string, vendorId: string, estimatedPrepTime?: number) {
    const { data: order, error } = await supabase
      .from('food_orders')
      .select('id, status, restaurant_id')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error || !order) throw new Error('Order not found');
    if (order.status !== 'pending') throw new Error(`Cannot accept order in status: ${order.status}`);

    const updateData: any = {
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (estimatedPrepTime) updateData.estimated_prep_time_minutes = estimatedPrepTime;

    await supabase.from('food_orders').update(updateData).eq('id', orderId);
    await OrderService.recordStatusChange(orderId, 'accepted', 'pending', vendorId, 'vendor');

    // Get customer_id for socket + push notification
    const { data: fullOrder } = await supabase
      .from('food_orders')
      .select('customer_id, food_restaurants(name)')
      .eq('id', orderId)
      .single();

    const socketSvc = getFoodSocketService();
    if (socketSvc && fullOrder) {
      socketSvc.emitToCustomer(fullOrder.customer_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'accepted',
        estimated_prep_time_minutes: estimatedPrepTime,
      });
    }

    if (fullOrder) {
      const restaurantName = (fullOrder as any).food_restaurants?.name || 'Restaurant';
      await FoodNotificationService.notifyCustomerOrderAccepted(
        fullOrder.customer_id, orderId, restaurantName, estimatedPrepTime
      );
    }

    // Start courier search
    FoodMatchingService.startCourierSearch(orderId).catch((err) =>
      logger.error('Failed to start courier search', { orderId, err })
    );

    logger.info('Order accepted by vendor', { orderId, restaurantId });
    return { success: true };
  }

  /**
   * Reject order
   */
  static async rejectOrder(orderId: string, restaurantId: string, vendorId: string, rejectionReason: string) {
    const { data: order, error } = await supabase
      .from('food_orders')
      .select('*')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error || !order) throw new Error('Order not found');
    if (order.status !== 'pending') throw new Error(`Cannot reject order in status: ${order.status}`);

    await supabase
      .from('food_orders')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    await OrderService.recordStatusChange(orderId, 'rejected', 'pending', vendorId, 'vendor', rejectionReason);

    // Refund customer wallet — route back to correct buckets using stored portions
    if (order.payment_status === 'paid' && order.payment_method === 'wallet') {
      const { WalletService } = await import('./wallet.service');
      // Retrieve stored portions from the original debit transaction
      const { data: origTx } = await supabase
        .from('wallet_transactions')
        .select('metadata')
        .eq('user_id', order.customer_id)
        .eq('transaction_type', 'debit')
        .ilike('description', `%${orderId}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const meta = (origTx?.metadata ?? {}) as Record<string, number>;
      const total = parseFloat(order.total_amount);
      const promoPortion = Math.min(meta.promo_portion ?? 0, total);
      const cashPortion  = total - promoPortion;
      await WalletService.refundToBuckets({
        userId:        order.customer_id,
        cashPortion,
        promoPortion,
        baseReference: `refund_rejected_${orderId}`,
        description:   'Refund: order rejected by restaurant',
      });
      await supabase.from('food_orders').update({ payment_status: 'refunded' }).eq('id', orderId);
      logger.info('Wallet refunded for rejected order', { orderId, amount: order.total_amount });
    }

    // Notify customer via socket + push
    const socketSvc = getFoodSocketService();
    if (socketSvc) {
      socketSvc.emitToCustomer(order.customer_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'rejected',
        reason: rejectionReason,
      });
    }
    await FoodNotificationService.notifyCustomerOrderRejected(order.customer_id, orderId, rejectionReason);

    return { success: true };
  }

  /**
   * Mark order as ready_for_pickup
   * Direct transition: accepted → ready_for_pickup (no preparing step)
   */
  static async updateStatus(
    orderId: string,
    restaurantId: string,
    vendorId: string,
    newStatus: string,
    estimatedPrepTime?: number
  ) {
    // Only allow marking as ready_for_pickup
    if (newStatus !== 'ready_for_pickup') {
      throw new Error(`Invalid status. Only "ready_for_pickup" is allowed via this endpoint`);
    }

    const { data: order, error } = await supabase
      .from('food_orders')
      .select('id, status')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error || !order) throw new Error('Order not found');

    // Allow transition from accepted, preparing, or arrived_vendor → ready_for_pickup
    const allowedFromStatuses = ['accepted', 'preparing', 'arrived_vendor'];
    if (!allowedFromStatuses.includes(order.status)) {
      throw new Error(`Cannot mark ready — order is currently: ${order.status}`);
    }

    const updateData: any = {
      status: 'ready_for_pickup',
      ready_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (estimatedPrepTime) updateData.estimated_prep_time_minutes = estimatedPrepTime;

    // Generate pickup code now so we can write it to food_orders immediately
    const pickupCode = Math.floor(100000 + Math.random() * 900000).toString();
    updateData.pickup_code = pickupCode;

    await supabase.from('food_orders').update(updateData).eq('id', orderId);
    await OrderService.recordStatusChange(orderId, 'ready_for_pickup', order.status, vendorId, 'vendor');

    // Emit socket event to customer
    const socketSvc = getFoodSocketService();

    // Get customer_id
    const { data: fullOrder } = await supabase
      .from('food_orders')
      .select('customer_id')
      .eq('id', orderId)
      .single();

    if (socketSvc && fullOrder) {
      socketSvc.emitToCustomer(fullOrder.customer_id, 'food:order:status_update', {
        order_id: orderId,
        status: 'ready_for_pickup',
      });
    }

    // Auto-create vendor pickup record and get the pickup_code
    const { VendorPickupService } = await import('./vendor-pickup.service');
    const pickup = await VendorPickupService.createPickup(orderId, vendorId, restaurantId, undefined, pickupCode).catch((err: any) => {
      logger.error('Failed to create vendor pickup — pickup_code will be null', {
        orderId,
        vendorId,
        restaurantId,
        error: err?.message || String(err),
      });
      return null;
    });

    if (fullOrder) {
      await FoodNotificationService.notifyCustomerOrderReady(fullOrder.customer_id, orderId);
    }

    logger.info('Order marked ready_for_pickup by vendor', { orderId, from: order.status, pickup_code: pickupCode });
    return { success: true, pickup_code: pickup?.pickup_code || pickupCode };
  }

  /**
   * Update estimated prep time
   */
  static async updatePrepTime(orderId: string, restaurantId: string, estimatedMinutes: number) {
    const { error } = await supabase
      .from('food_orders')
      .update({
        estimated_prep_time_minutes: estimatedMinutes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId);

    if (error) throw new Error('Failed to update prep time');
    return { success: true };
  }
}
