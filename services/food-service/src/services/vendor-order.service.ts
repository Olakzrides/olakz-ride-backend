import { supabase } from '../config/database';
import { OrderService } from './order.service';
import { FoodMatchingService } from './food-matching.service';
import { FoodNotificationService } from './food-notification.service';
import { getFoodSocketService } from './food-socket.service';
import logger from '../utils/logger';

export class VendorOrderService {
  /**
   * Get vendor orders with filters
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
        delivery_address,
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

    return {
      orders: data || [],
      total: count || 0,
      page: params.page || 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  /**
   * Get single order for vendor
   */
  static async getOrder(orderId: string, restaurantId: string) {
    const { data, error } = await supabase
      .from('food_orders')
      .select(`
        *,
        order_items:food_order_items (*),
        status_history:food_order_status_history (status, previous_status, changed_by_role, notes, created_at)
      `)
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error) return null;
    return data;
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

    // Refund customer wallet
    if (order.payment_status === 'paid' && order.payment_method === 'wallet') {
      const { WalletService } = await import('./wallet.service');
      await WalletService.credit({
        userId: order.customer_id,
        amount: parseFloat(order.total_amount),
        reference: `refund_rejected_${orderId}_${Date.now()}`,
        description: `Refund: order rejected by restaurant`,
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
   * Update order status (preparing, ready_for_pickup)
   */
  static async updateStatus(
    orderId: string,
    restaurantId: string,
    vendorId: string,
    newStatus: string,
    estimatedPrepTime?: number
  ) {
    const allowedTransitions: Record<string, string[]> = {
      accepted: ['preparing'],
      preparing: ['ready_for_pickup'],
      arrived_vendor: ['ready_for_pickup'], // courier may arrive before food is ready
    };

    const { data: order, error } = await supabase
      .from('food_orders')
      .select('id, status')
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error || !order) throw new Error('Order not found');

    const allowed = allowedTransitions[order.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
    }

    const updateData: any = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'preparing') updateData.preparing_at = new Date().toISOString();
    if (newStatus === 'ready_for_pickup') updateData.ready_at = new Date().toISOString();
    if (estimatedPrepTime) updateData.estimated_prep_time_minutes = estimatedPrepTime;

    await supabase.from('food_orders').update(updateData).eq('id', orderId);
    await OrderService.recordStatusChange(orderId, newStatus, order.status, vendorId, 'vendor');

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
        status: newStatus,
        estimated_prep_time_minutes: estimatedPrepTime,
      });
    }

    // When ready_for_pickup — auto-create vendor pickup record
    if (newStatus === 'ready_for_pickup' && fullOrder) {
      const { VendorPickupService } = await import('./vendor-pickup.service');
      VendorPickupService.createPickup(orderId, vendorId, restaurantId).catch((err) =>
        logger.error('Failed to create vendor pickup', { orderId, err })
      );

      // Push notify customer
      await FoodNotificationService.notifyCustomerOrderReady(fullOrder.customer_id, orderId);
    }

    logger.info('Order status updated by vendor', { orderId, from: order.status, to: newStatus });
    return { success: true };
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
