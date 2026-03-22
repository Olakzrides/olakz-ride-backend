import { supabase } from '../config/database';
import { getFoodSocketService } from './food-socket.service';
import logger from '../utils/logger';

export class VendorPickupService {
  /**
   * Create a pickup request when order is ready_for_pickup
   * Called automatically when vendor marks order as ready_for_pickup
   */
  static async createPickup(orderId: string, vendorId: string, restaurantId: string, specialInstructions?: string): Promise<any> {
    // Check if pickup already exists
    const { data: existing } = await supabase
      .from('food_vendor_pickups')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();

    if (existing) return existing;

    const pickupCode = Math.floor(100000 + Math.random() * 900000).toString();

    const { data, error } = await supabase
      .from('food_vendor_pickups')
      .insert({
        order_id: orderId,
        vendor_id: vendorId,
        restaurant_id: restaurantId,
        status: 'pending',
        pickup_code: pickupCode,
        special_instructions: specialInstructions || null,
      })
      .select()
      .single();

    if (error) throw new Error('Failed to create pickup request');

    // Get order courier_id and notify them
    const { data: order } = await supabase
      .from('food_orders')
      .select('courier_id, customer_id')
      .eq('id', orderId)
      .single();

    const socketSvc = getFoodSocketService();
    if (socketSvc && order?.courier_id) {
      socketSvc.emitToCourier(order.courier_id, 'food:delivery:ready_for_pickup', {
        order_id: orderId,
        pickup_id: data.id,
        restaurant_id: restaurantId,
        pickup_code: pickupCode,
        special_instructions: specialInstructions,
      });
    }

    logger.info('Vendor pickup created', { orderId, pickupId: data.id });
    return data;
  }

  /**
   * Get vendor's pickup requests
   */
  static async getVendorPickups(params: {
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
      .from('food_vendor_pickups')
      .select('*, order:food_orders(id, status, total_amount, delivery_address, order_items:food_order_items(item_name, quantity))', { count: 'exact' })
      .eq('restaurant_id', params.restaurantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status) query = query.eq('status', params.status);
    if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
    if (params.dateTo) query = query.lte('created_at', params.dateTo);

    const { data, error, count } = await query;
    if (error) throw new Error('Failed to fetch pickups');

    return { pickups: data || [], total: count || 0, page: params.page || 1, limit };
  }

  /**
   * Get single pickup
   */
  static async getPickup(pickupId: string) {
    const { data, error } = await supabase
      .from('food_vendor_pickups')
      .select('*, order:food_orders(*)')
      .eq('id', pickupId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Mark pickup as ready (vendor confirms order is packed)
   */
  static async markReady(pickupId: string, restaurantId: string, specialInstructions?: string): Promise<void> {
    const { data: pickup, error } = await supabase
      .from('food_vendor_pickups')
      .select('*')
      .eq('id', pickupId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (error || !pickup) throw new Error('Pickup not found');

    await supabase
      .from('food_vendor_pickups')
      .update({
        status: 'pending', // still pending until courier arrives
        special_instructions: specialInstructions || pickup.special_instructions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pickupId);

    // Notify courier again
    const { data: order } = await supabase
      .from('food_orders')
      .select('courier_id')
      .eq('id', pickup.order_id)
      .single();

    const socketSvc = getFoodSocketService();
    if (socketSvc && order?.courier_id) {
      socketSvc.emitToCourier(order.courier_id, 'food:delivery:ready_for_pickup', {
        order_id: pickup.order_id,
        pickup_id: pickupId,
        pickup_code: pickup.pickup_code,
        special_instructions: specialInstructions,
      });
    }
  }

  /**
   * Cancel pickup
   */
  static async cancelPickup(pickupId: string, restaurantId: string, reason: string, cancelledBy: string): Promise<void> {
    const { data: pickup } = await supabase
      .from('food_vendor_pickups')
      .select('*')
      .eq('id', pickupId)
      .eq('restaurant_id', restaurantId)
      .single();

    if (!pickup) throw new Error('Pickup not found');

    await supabase
      .from('food_vendor_pickups')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        cancelled_by: cancelledBy,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pickupId);
  }

  // ── Courier-side pickup actions ─────────────────────────────────────────────

  /**
   * Courier updates location during pickup
   */
  static async updateCourierLocation(pickupId: string, driverId: string, lat: number, lng: number): Promise<void> {
    const { data: pickup } = await supabase
      .from('food_vendor_pickups')
      .select('order_id')
      .eq('id', pickupId)
      .single();

    if (!pickup) return;

    await supabase.from('food_courier_locations').insert({
      order_id: pickup.order_id,
      courier_id: driverId,
      latitude: lat,
      longitude: lng,
    });

    const socketSvc = getFoodSocketService();
    if (socketSvc) {
      socketSvc.emitToPickupRoom(pickupId, 'vendor_pickup:courier_location', {
        pickup_id: pickupId,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      });
    }
  }
}
