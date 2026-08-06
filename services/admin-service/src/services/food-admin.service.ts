import { supabase } from '../config/database';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class FoodAdminService {
  // ─── Orders ──────────────────────────────────────────────────────────────────

  static async getOrders(filters: {
    status?: string;
    restaurant_id?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, restaurant_id, from, to, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('food_orders')
      .select(`
        id, customer_id, courier_id, restaurant_id, status,
        payment_method, payment_status,
        subtotal, delivery_fee, service_fee, total_amount,
        pickup_code, delivery_code,
        ready_at, picked_up_at, delivered_at, cancelled_at,
        created_at, updated_at,
        restaurant:food_restaurants(id, name),
        orderItems:food_order_items(id, item_name, item_price, quantity)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (restaurant_id) query = query.eq('restaurant_id', restaurant_id);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data: orders, count, error } = await query;
    if (error) throw new Error(`Failed to get orders: ${error.message}`);

    const rows = orders ?? [];

    // Batch fetch customer names
    const customerIds = [...new Set(rows.map((o: any) => o.customer_id).filter(Boolean))];
    const customerMap = new Map<string, { name: string; phone: string | null; email: string | null }>();
    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone, email')
        .in('id', customerIds);
      for (const u of users ?? []) {
        customerMap.set(u.id, {
          name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
          phone: u.phone ?? null,
          email: u.email ?? null,
        });
      }
    }

    // Batch fetch courier names
    const courierIds = [...new Set(rows.map((o: any) => o.courier_id).filter(Boolean))];
    const courierMap = new Map<string, { name: string; phone: string | null }>();
    if (courierIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, user_id')
        .in('id', courierIds);

      const driverUserMap = new Map<string, string>();
      for (const d of drivers ?? []) driverUserMap.set(d.id, d.user_id);

      const courierUserIds = [...new Set([...driverUserMap.values()])];
      if (courierUserIds.length > 0) {
        const { data: courierUsers } = await supabase
          .from('users')
          .select('id, first_name, last_name, phone')
          .in('id', courierUserIds);

        const userDetailMap = new Map<string, { name: string; phone: string | null }>();
        for (const u of courierUsers ?? []) {
          userDetailMap.set(u.id, {
            name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
            phone: u.phone ?? null,
          });
        }
        for (const [driverId, userId] of driverUserMap.entries()) {
          const details = userDetailMap.get(userId);
          if (details) courierMap.set(driverId, details);
        }
      }
    }

    // Enrich each row
    const enriched = rows.map((o: any, idx: number) => {
      const customer = customerMap.get(o.customer_id);
      const courier  = o.courier_id ? courierMap.get(o.courier_id) : null;

      return {
        sn:     offset + idx + 1,
        id:     o.id,
        status: o.status,
        customer: {
          id:    o.customer_id,
          name:  customer?.name  ?? 'Unknown',
          phone: customer?.phone ?? null,
          email: customer?.email ?? null,
        },
        courier: o.courier_id ? {
          id:    o.courier_id,
          name:  courier?.name  ?? 'Unknown',
          phone: courier?.phone ?? null,
        } : null,
        restaurant: o.restaurant,
        orderItems: o.orderItems ?? [],
        amount: {
          subtotal:      parseFloat(o.subtotal ?? 0),
          deliveryFee:   parseFloat(o.delivery_fee ?? 0),
          serviceFee:    parseFloat(o.service_fee ?? 0),
          total:         parseFloat(o.total_amount ?? 0),
          paymentMethod: o.payment_method,
          paymentStatus: o.payment_status,
          display:       `₦${parseFloat(o.total_amount ?? 0).toLocaleString('en-NG')} · ${o.payment_method}`,
        },
        codes: {
          pickup_code:          o.pickup_code ?? null,
          pickup_code_status:   o.ready_at
            ? (o.picked_up_at  ? 'verified' : 'pending')
            : 'not_generated',
          delivery_code:        o.delivery_code ?? null,
          delivery_code_status: o.delivery_code
            ? (o.delivered_at ? 'verified' : 'pending')
            : 'not_generated',
        },
        deliveredAt: o.delivered_at ?? null,
        cancelledAt: o.cancelled_at ?? null,
        createdAt:   o.created_at,
      };
    });

    return { orders: enriched, total: count || 0, page, limit };
  }

  static async getStatusCounts(filters: { restaurant_id?: string; from?: string; to?: string } = {}) {
    let query = supabase
      .from('food_orders')
      .select('status');

    if (filters.restaurant_id) query = query.eq('restaurant_id', filters.restaurant_id);
    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get status counts: ${error.message}`);

    const rows = data ?? [];
    const counts = { all: rows.length, pending: 0, preparing: 0, picked_up: 0, delivered: 0, cancelled: 0 };

    for (const row of rows) {
      const s = (row as any).status as string;
      if (s === 'pending')                                   counts.pending++;
      else if (['accepted', 'preparing', 'ready_for_pickup',
                'arrived_vendor'].includes(s))               counts.preparing++;
      else if (['picked_up', 'arrived_delivery', 'courier_at_door'].includes(s)) counts.picked_up++;
      else if (s === 'delivered')                            counts.delivered++;
      else if (s === 'cancelled' || s === 'rejected')        counts.cancelled++;
    }

    return counts;
  }

  static async updateOrderStatus(orderId: string, status: string, adminId: string) {
    const { data: order, error: fetchError } = await supabase
      .from('food_orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) throw new Error('Order not found');

    const { data: updated, error: updateError } = await supabase
      .from('food_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to update order: ${updateError.message}`);

    // Log status history
    await supabase.from('food_order_status_history').insert({
      order_id: orderId,
      status,
      previous_status: (order as Record<string, unknown>).status,
      changed_by: adminId,
      changed_by_role: 'admin',
      notes: 'Updated by admin',
    });

    return updated;
  }

  // ─── Vendors (restaurants) ───────────────────────────────────────────────────

  static async getVendors(filters: {
    is_verified?: boolean;
    is_active?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { is_verified, is_active, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('food_restaurants')
      .select('id, owner_id, name, city, state, is_active, is_verified, average_rating, total_orders, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (is_verified !== undefined) query = query.eq('is_verified', is_verified);
    if (is_active !== undefined) query = query.eq('is_active', is_active);

    const { data: vendors, count, error } = await query;
    if (error) throw new Error(`Failed to get vendors: ${error.message}`);

    return { vendors: vendors || [], total: count || 0, page, limit };
  }

  static async approveVendor(restaurantId: string) {
    const { data: existing } = await supabase.from('food_restaurants').select('id').eq('id', restaurantId).single();
    if (!existing) throw new Error('Restaurant not found');

    const { data, error } = await supabase
      .from('food_restaurants')
      .update({ is_verified: true, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .select()
      .single();

    if (error) throw new Error(`Failed to approve vendor: ${error.message}`);
    return data;
  }

  static async suspendVendor(restaurantId: string, _reason?: string) {
    const { data: existing } = await supabase.from('food_restaurants').select('id').eq('id', restaurantId).single();
    if (!existing) throw new Error('Restaurant not found');

    const { data, error } = await supabase
      .from('food_restaurants')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', restaurantId)
      .select()
      .single();

    if (error) throw new Error(`Failed to suspend vendor: ${error.message}`);
    return data;
  }

  // ─── Couriers ────────────────────────────────────────────────────────────────

  static async getCouriers(filters: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const { data: couriers, error, count } = await supabase
      .from('drivers')
      .select(`
        id, user_id, status, rating, total_rides, total_earnings, created_at,
        vehicle_type:vehicle_types(name, display_name),
        availability:driver_availability(is_online, is_available)
      `, { count: 'exact' })
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('getCouriers error', { error: error.message });
      throw new Error(`Failed to get couriers: ${error.message}`);
    }

    return { couriers: couriers || [], total: count || 0, page, limit };
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  static async getAnalytics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { count: totalOrders },
      { count: totalRestaurants },
      { count: activeRestaurants },
      { data: monthOrders },
    ] = await Promise.all([
      supabase.from('food_orders').select('*', { count: 'exact', head: true }),
      supabase.from('food_restaurants').select('*', { count: 'exact', head: true }),
      supabase.from('food_restaurants').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('food_orders').select('total_amount, status, payment_status').gte('created_at', startOfMonth),
    ]);

    const orders = monthOrders || [];
    const monthRevenue = orders
      .filter((o: Record<string, unknown>) => o.payment_status === 'paid')
      .reduce((s: number, o: Record<string, unknown>) => s + Number(o.total_amount), 0);

    return {
      total_orders: totalOrders || 0,
      total_restaurants: totalRestaurants || 0,
      active_restaurants: activeRestaurants || 0,
      this_month: {
        orders: orders.length,
        revenue: monthRevenue,
        completed: orders.filter((o: Record<string, unknown>) => o.status === 'delivered').length,
        cancelled: orders.filter((o: Record<string, unknown>) => o.status === 'cancelled').length,
      },
    };
  }

  // ─── Order Trends (analytics) ────────────────────────────────────────────────

  static async getOrderTrends(filters: { from?: string; to?: string; restaurant_id?: string }) {
    let query = supabase
      .from('food_orders')
      .select('id, total_amount, status, payment_status, created_at, restaurant_id')
      .order('created_at', { ascending: true });

    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) query = query.lte('created_at', filters.to);
    if (filters.restaurant_id) query = query.eq('restaurant_id', filters.restaurant_id);

    const { data: orders, error } = await query;
    if (error) throw new Error(`Failed to get order trends: ${error.message}`);

    const byDate: Record<string, { orders: number; revenue: number }> = {};
    for (const o of orders || []) {
      const date = new Date((o as Record<string, unknown>).created_at as string).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { orders: 0, revenue: 0 };
      byDate[date].orders++;
      if ((o as Record<string, unknown>).payment_status === 'paid') {
        byDate[date].revenue += Number((o as Record<string, unknown>).total_amount);
      }
    }

    const allOrders = orders || [];
    return {
      total_orders: allOrders.length,
      total_revenue: allOrders
        .filter((o: Record<string, unknown>) => o.payment_status === 'paid')
        .reduce((s: number, o: Record<string, unknown>) => s + Number(o.total_amount), 0),
      by_date: Object.entries(byDate).map(([date, data]) => ({ date, ...data })),
    };
  }

  // ─── Food Order Detail ────────────────────────────────────────────────────────

  static async getOrderById(orderId: string) {
    // Full order row
    const { data: order, error } = await supabase
      .from('food_orders')
      .select(`
        id, customer_id, courier_id, restaurant_id, status,
        payment_method, payment_status,
        subtotal, delivery_fee, service_fee, rounding_fee, total_amount,
        pickup_code, delivery_code,
        delivery_address,
        special_instructions,
        estimated_prep_time_minutes, estimated_delivery_time_minutes,
        accepted_at, preparing_at, ready_at, picked_up_at,
        arrived_vendor_at, arrived_delivery_at, delivered_at, cancelled_at,
        pickup_photo_url, delivery_photo_url,
        rejection_reason, cancellation_reason, cancelled_by,
        created_at, updated_at
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Order not found');

    // Order items
    const { data: items } = await supabase
      .from('food_order_items')
      .select('id, item_id, item_name, item_price, quantity, selected_extras')
      .eq('order_id', orderId);

    // Restaurant info
    const { data: restaurant } = await supabase
      .from('food_restaurants')
      .select('id, name, address, phone, city, state, logo_url')
      .eq('id', order.restaurant_id)
      .single();

    // Customer info
    const { data: customer } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .eq('id', order.customer_id)
      .single();

    // Courier info
    let courierInfo: any = null;
    if (order.courier_id) {
      const { data: courier } = await supabase
        .from('drivers')
        .select(`
          id, user_id, rating, total_deliveries,
          vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)
        `)
        .eq('id', order.courier_id)
        .single();

      if (courier) {
        const { data: courierUser } = await supabase
          .from('users')
          .select('first_name, last_name, email, phone, avatar_url')
          .eq('id', courier.user_id)
          .single();

        const vehicles = (courier.vehicles as any[]) ?? [];
        const activeVehicle = vehicles.find((v: any) => v.is_active) ?? vehicles[0] ?? null;

        courierInfo = {
          id:     courier.id,
          userId: courier.user_id,
          name:   courierUser ? `${courierUser.first_name ?? ''} ${courierUser.last_name ?? ''}`.trim() : 'Unknown',
          phone:  courierUser?.phone ?? null,
          avatar: courierUser?.avatar_url ?? null,
          rating: parseFloat(String(courier.rating)) || 0,
          totalDeliveries: courier.total_deliveries ?? 0,
          vehicle: activeVehicle ? {
            plateNumber:  activeVehicle.plate_number,
            manufacturer: activeVehicle.manufacturer,
            model:        activeVehicle.model,
            color:        activeVehicle.color,
          } : null,
        };
      }
    }

    // Status timeline from history table
    const { data: statusHistory } = await supabase
      .from('food_order_status_history')
      .select('id, status, previous_status, changed_by_role, notes, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    // Build codes section
    const codes = {
      pickup_code:          order.pickup_code ?? null,
      pickup_code_status:   order.ready_at
        ? (order.picked_up_at ? 'verified' : 'pending')
        : 'not_generated',
      delivery_code:        order.delivery_code ?? null,
      delivery_code_status: order.delivery_code
        ? (order.delivered_at ? 'verified' : 'pending')
        : 'not_generated',
    };

    return {
      id:          order.id,
      status:      order.status,
      paymentMethod:  order.payment_method,
      paymentStatus:  order.payment_status,
      amount: {
        subtotal:    parseFloat(order.subtotal),
        deliveryFee: parseFloat(order.delivery_fee),
        serviceFee:  parseFloat(order.service_fee ?? 0),
        roundingFee: parseFloat(order.rounding_fee ?? 0),
        total:       parseFloat(order.total_amount),
      },
      deliveryAddress:     order.delivery_address,
      specialInstructions: order.special_instructions ?? null,
      customer: customer ? {
        id:     customer.id,
        name:   `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
        email:  customer.email,
        phone:  customer.phone,
        avatar: customer.avatar_url,
      } : { id: order.customer_id, name: 'Unknown', email: null, phone: null, avatar: null },
      restaurant: restaurant ? {
        id:      restaurant.id,
        name:    restaurant.name,
        address: restaurant.address,
        phone:   restaurant.phone,
        city:    restaurant.city,
        state:   restaurant.state,
        logo:    restaurant.logo_url,
      } : { id: order.restaurant_id, name: 'Unknown' },
      courier:     courierInfo,
      items:       items ?? [],
      codes,
      proofOfDelivery: {
        pickupPhotoUrl:   order.pickup_photo_url ?? null,
        deliveryPhotoUrl: order.delivery_photo_url ?? null,
      },
      timeline: (statusHistory ?? []).map((h: any) => ({
        id:             h.id,
        status:         h.status,
        previousStatus: h.previous_status,
        changedByRole:  h.changed_by_role,
        notes:          h.notes,
        createdAt:      h.created_at,
      })),
      estimatedPrepMinutes:     order.estimated_prep_time_minutes ?? null,
      estimatedDeliveryMinutes: order.estimated_delivery_time_minutes ?? null,
      acceptedAt:      order.accepted_at ?? null,
      preparingAt:     order.preparing_at ?? null,
      readyAt:         order.ready_at ?? null,
      arrivedVendorAt: order.arrived_vendor_at ?? null,
      pickedUpAt:      order.picked_up_at ?? null,
      arrivedDeliveryAt: order.arrived_delivery_at ?? null,
      deliveredAt:     order.delivered_at ?? null,
      cancelledAt:     order.cancelled_at ?? null,
      cancellationReason: order.cancellation_reason ?? null,
      createdAt:       order.created_at,
    };
  }
}
