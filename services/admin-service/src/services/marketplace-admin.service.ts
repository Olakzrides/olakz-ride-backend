import { supabase } from '../config/database';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class MarketplaceAdminService {
  // ─── Stores ──────────────────────────────────────────────────────────────────

  static async getStores(params: {
    status?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    let query = supabase
      .from('marketplace_stores')
      .select(`
        *,
        storeCategories:marketplace_store_categories(
          category:marketplace_categories(name)
        )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status === 'active') query = query.eq('is_active', true);
    if (params.status === 'inactive') query = query.eq('is_active', false);

    const { data: stores, count, error } = await query;
    if (error) throw new Error(`Failed to get stores: ${error.message}`);

    return {
      stores: stores || [],
      total: count || 0,
      page: params.page || 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  static async setStoreStatus(storeId: string, isActive: boolean) {
    const { data: existing } = await supabase
      .from('marketplace_stores')
      .select('id')
      .eq('id', storeId)
      .single();

    if (!existing) throw new Error('Store not found');

    const { error } = await supabase
      .from('marketplace_stores')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', storeId);

    if (error) throw new Error(`Failed to update store: ${error.message}`);
  }

  // ─── Orders ──────────────────────────────────────────────────────────────────

  static async getOrders(params: {
    status?: string;
    storeId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const limit = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    let query = supabase
      .from('marketplace_orders')
      .select(`
        id, customer_id, store_id, rider_id, status,
        payment_method, payment_status,
        subtotal, delivery_fee, service_fee, total_amount,
        delivery_address,
        accepted_at, delivered_at, cancelled_at, created_at,
        store:marketplace_stores(id, name),
        orderItems:marketplace_order_items(id, product_name, product_price, quantity, subtotal)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status) query = query.eq('status', params.status);
    if (params.storeId) query = query.eq('store_id', params.storeId);
    if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
    if (params.dateTo) query = query.lte('created_at', params.dateTo);

    const { data: orders, count, error } = await query;
    if (error) throw new Error(`Failed to get orders: ${error.message}`);

    const rows = orders ?? [];

    // Collect unique customer_ids and rider_ids for batch lookup
    const customerIds = [...new Set(rows.map((o: any) => o.customer_id).filter(Boolean))];
    const riderIds    = [...new Set(rows.map((o: any) => o.rider_id).filter(Boolean))];

    // Fetch customer names
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

    // Fetch rider user_ids, then their names
    const riderMap = new Map<string, { name: string; phone: string | null }>();
    if (riderIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, user_id')
        .in('id', riderIds);

      const riderUserIds = (drivers ?? []).map((d: any) => d.user_id);
      const driverUserMap = new Map<string, string>(); // driverId → userId
      for (const d of drivers ?? []) driverUserMap.set(d.id, d.user_id);

      if (riderUserIds.length > 0) {
        const { data: riderUsers } = await supabase
          .from('users')
          .select('id, first_name, last_name, phone')
          .in('id', riderUserIds);

        const userDetailMap = new Map<string, { name: string; phone: string | null }>();
        for (const u of riderUsers ?? []) {
          userDetailMap.set(u.id, {
            name:  `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
            phone: u.phone ?? null,
          });
        }

        // Map driverId → user details
        for (const [driverId, userId] of driverUserMap.entries()) {
          const details = userDetailMap.get(userId);
          if (details) riderMap.set(driverId, details);
        }
      }
    }

    // Enrich rows
    const enriched = rows.map((o: any, idx: number) => {
      const customer = customerMap.get(o.customer_id);
      const rider    = o.rider_id ? riderMap.get(o.rider_id) : null;

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
        rider: o.rider_id ? {
          id:    o.rider_id,
          name:  rider?.name  ?? 'Unknown',
          phone: rider?.phone ?? null,
        } : null,
        store:      o.store,
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
        deliveryAddress: o.delivery_address,
        acceptedAt:  o.accepted_at  ?? null,
        deliveredAt: o.delivered_at ?? null,
        cancelledAt: o.cancelled_at ?? null,
        createdAt:   o.created_at,
      };
    });

    return {
      orders: enriched,
      total:  count || 0,
      page:   params.page || 1,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  }

  // ─── Status Counts ────────────────────────────────────────────────────────────

  static async getStatusCounts(filters: { storeId?: string; dateFrom?: string; dateTo?: string } = {}) {
    let query = supabase
      .from('marketplace_orders')
      .select('status');

    if (filters.storeId)   query = query.eq('store_id', filters.storeId);
    if (filters.dateFrom)  query = query.gte('created_at', filters.dateFrom);
    if (filters.dateTo)    query = query.lte('created_at', filters.dateTo);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get status counts: ${error.message}`);

    const rows = data ?? [];
    const counts = { all: rows.length, pending: 0, accepted: 0, in_progress: 0, delivered: 0, cancelled: 0 };

    for (const row of rows) {
      const s = (row as any).status as string;
      if (s === 'pending')                           counts.pending++;
      else if (s === 'accepted')                     counts.accepted++;
      else if (['shipped', 'arrived',
                'heading_to_store',
                'heading_to_customer'].includes(s))  counts.in_progress++;
      else if (s === 'delivered')                    counts.delivered++;
      else if (s === 'cancelled' || s === 'rejected') counts.cancelled++;
    }

    return counts;
  }

  // ─── Order Detail ─────────────────────────────────────────────────────────────

  static async getOrderById(orderId: string) {
    const { data: order, error } = await supabase
      .from('marketplace_orders')
      .select(`
        id, customer_id, store_id, rider_id, status,
        payment_method, payment_status,
        subtotal, delivery_fee, service_fee, total_amount,
        delivery_address, special_instructions,
        cancellation_reason, cancelled_by, rejection_reason,
        accepted_at, ready_at, shipped_at, arrived_at, delivered_at, cancelled_at,
        created_at, updated_at
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Order not found');

    // Order items
    const { data: items } = await supabase
      .from('marketplace_order_items')
      .select('id, product_id, product_name, product_price, quantity, subtotal')
      .eq('order_id', orderId);

    // Store info
    const { data: store } = await supabase
      .from('marketplace_stores')
      .select('id, name, address, city, state, logo_url, owner_id')
      .eq('id', order.store_id)
      .single();

    // Customer info
    const { data: customer } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .eq('id', order.customer_id)
      .single();

    // Rider info
    let riderInfo: any = null;
    if (order.rider_id) {
      const { data: rider } = await supabase
        .from('drivers')
        .select(`
          id, user_id, rating,
          vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)
        `)
        .eq('id', order.rider_id)
        .single();

      if (rider) {
        const { data: riderUser } = await supabase
          .from('users')
          .select('first_name, last_name, phone, avatar_url')
          .eq('id', rider.user_id)
          .single();

        const vehicles = (rider.vehicles as any[]) ?? [];
        const activeVehicle = vehicles.find((v: any) => v.is_active) ?? vehicles[0] ?? null;

        riderInfo = {
          id:     rider.id,
          name:   riderUser ? `${riderUser.first_name ?? ''} ${riderUser.last_name ?? ''}`.trim() : 'Unknown',
          phone:  riderUser?.phone ?? null,
          avatar: riderUser?.avatar_url ?? null,
          rating: parseFloat(String(rider.rating)) || 0,
          vehicle: activeVehicle ? {
            plateNumber:  activeVehicle.plate_number,
            manufacturer: activeVehicle.manufacturer,
            model:        activeVehicle.model,
            color:        activeVehicle.color,
          } : null,
        };
      }
    }

    // Status timeline
    const { data: statusHistory } = await supabase
      .from('marketplace_order_status_history')
      .select('id, status, previous_status, changed_by_role, notes, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    return {
      id:            order.id,
      status:        order.status,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      amount: {
        subtotal:    parseFloat(order.subtotal),
        deliveryFee: parseFloat(order.delivery_fee),
        serviceFee:  parseFloat(order.service_fee ?? 0),
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
      store: store ? {
        id:      store.id,
        name:    store.name,
        address: store.address,
        city:    store.city,
        state:   store.state,
        logo:    store.logo_url,
      } : { id: order.store_id, name: 'Unknown' },
      rider: riderInfo,
      items: items ?? [],
      // No codes for marketplace orders
      timeline: (statusHistory ?? []).map((h: any) => ({
        id:             h.id,
        status:         h.status,
        previousStatus: h.previous_status,
        changedByRole:  h.changed_by_role,
        notes:          h.notes,
        createdAt:      h.created_at,
      })),
      acceptedAt:   order.accepted_at ?? null,
      readyAt:      order.ready_at ?? null,
      shippedAt:    order.shipped_at ?? null,
      arrivedAt:    order.arrived_at ?? null,
      deliveredAt:  order.delivered_at ?? null,
      cancelledAt:  order.cancelled_at ?? null,
      cancellationReason: order.cancellation_reason ?? null,
      rejectionReason:    order.rejection_reason ?? null,
      createdAt:    order.created_at,
    };
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  static async getAnalytics(dateFrom?: string, dateTo?: string) {
    let query = supabase
      .from('marketplace_orders')
      .select('created_at, total_amount, status')
      .neq('status', 'cancelled');

    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo);

    const [
      { data: orders, error: ordersError },
      { count: totalStores },
      { count: activeStores },
    ] = await Promise.all([
      query,
      supabase.from('marketplace_stores').select('*', { count: 'exact', head: true }),
      supabase.from('marketplace_stores').select('*', { count: 'exact', head: true }).eq('is_active', true),
    ]);

    if (ordersError) throw new Error(`Failed to get analytics: ${ordersError.message}`);

    const allOrders = orders || [];
    const totalRevenue = allOrders.reduce(
      (acc: number, o: Record<string, unknown>) => acc + parseFloat(String(o.total_amount || 0)),
      0
    );

    const byDate: Record<string, { orders: number; revenue: number }> = {};
    for (const o of allOrders) {
      const date = new Date((o as Record<string, unknown>).created_at as string).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { orders: 0, revenue: 0 };
      byDate[date].orders++;
      byDate[date].revenue += parseFloat(String((o as Record<string, unknown>).total_amount || 0));
    }

    return {
      total_orders: allOrders.length,
      total_revenue: totalRevenue,
      total_stores: totalStores || 0,
      active_stores: activeStores || 0,
      by_date: Object.entries(byDate).map(([date, data]) => ({ date, ...data })),
    };
  }
}
