import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export class SparePartsAdminService {
  // ─── Stores ───────────────────────────────────────────────────────────────────

  static async getStores(params: {
    status?:    string;   // 'active' | 'inactive' | 'verified' | 'unverified'
    city?:      string;
    page?:      number;
    limit?:     number;
  }) {
    const limit  = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    let query = supabase
      .from('spare_parts_stores')
      .select(
        'id, owner_id, vendor_id, name, description, logo_url, banner_url, address, city, state, phone, email, is_active, is_open, is_verified, average_rating, total_ratings, total_orders, created_at, updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status === 'active')     query = query.eq('is_active', true);
    if (params.status === 'inactive')   query = query.eq('is_active', false);
    if (params.status === 'verified')   query = query.eq('is_verified', true);
    if (params.status === 'unverified') query = query.eq('is_verified', false);
    if (params.city)                    query = query.ilike('city', `%${params.city}%`);

    const { data: stores, count, error } = await query;
    if (error) throw new Error(`Failed to get spare parts stores: ${error.message}`);

    // Enrich with owner info
    const rows        = stores ?? [];
    const ownerIds    = [...new Set(rows.map((s: any) => s.owner_id).filter(Boolean))];
    const ownerMap    = new Map<string, { name: string; email: string | null; phone: string | null }>();

    if (ownerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, phone')
        .in('id', ownerIds);
      for (const u of users ?? []) {
        const user = u as any;
        ownerMap.set(user.id, {
          name:  `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unknown',
          email: user.email  ?? null,
          phone: user.phone  ?? null,
        });
      }
    }

    const enriched = rows.map((s: any) => ({
      id:             s.id,
      name:           s.name,
      description:    s.description ?? null,
      logoUrl:        s.logo_url    ?? null,
      bannerUrl:      s.banner_url  ?? null,
      address:        s.address,
      city:           s.city        ?? null,
      state:          s.state       ?? null,
      phone:          s.phone       ?? null,
      email:          s.email       ?? null,
      isActive:       s.is_active,
      isOpen:         s.is_open,
      isVerified:     s.is_verified,
      averageRating:  parseFloat(s.average_rating ?? 0),
      totalRatings:   s.total_ratings  ?? 0,
      totalOrders:    s.total_orders   ?? 0,
      owner:          ownerMap.get(s.owner_id) ?? { name: 'Unknown', email: null, phone: null },
      createdAt:      s.created_at,
      updatedAt:      s.updated_at,
    }));

    return {
      stores:     enriched,
      total:      count ?? 0,
      page:       params.page ?? 1,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    };
  }

  static async getStoreById(storeId: string) {
    const { data: store, error } = await supabase
      .from('spare_parts_stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (error || !store) throw new Error('Store not found');

    // Owner identity
    const { data: owner } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, status, email_verified')
      .eq('id', store.owner_id)
      .single();

    // Platform vendor docs
    const { data: platformVendor } = await supabase
      .from('vendors')
      .select('nin_number, cac_document_url, profile_picture_url, store_images, verification_status, rejection_reason, approved_at')
      .eq('user_id', store.owner_id)
      .maybeSingle();

    // Wallet balance
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount')
      .eq('user_id', store.owner_id)
      .eq('status', 'completed');

    const CREDIT = new Set(['credit', 'topup', 'refund', 'earning', 'tip_payment']);
    const DEBIT  = new Set(['debit', 'hold', 'withdrawal', 'payment']);
    let walletBalance = 0;
    for (const tx of txns ?? []) {
      const t   = tx as any;
      const amt = parseFloat(String(t.amount ?? 0));
      if (CREDIT.has(t.transaction_type))     walletBalance += amt;
      else if (DEBIT.has(t.transaction_type)) walletBalance -= amt;
    }

    // Order stats
    const { data: orderStats } = await supabase
      .from('spare_parts_orders')
      .select('status, total_amount, payment_status')
      .eq('store_id', storeId);

    const orders  = orderStats ?? [];
    const revenue = orders
      .filter((o: any) => o.status === 'delivered' && ['settled', 'completed'].includes(o.payment_status))
      .reduce((s: number, o: any) => s + parseFloat(o.total_amount ?? 0), 0);

    const u  = (owner          ?? {}) as any;
    const pv = (platformVendor ?? {}) as any;

    return {
      id:           store.id,
      name:         store.name,
      description:  store.description,
      logoUrl:      store.logo_url,
      bannerUrl:    store.banner_url,
      address:      store.address,
      city:         store.city,
      state:        store.state,
      latitude:     store.latitude,
      longitude:    store.longitude,
      phone:        store.phone,
      email:        store.email,
      isActive:     store.is_active,
      isOpen:       store.is_open,
      isVerified:   store.is_verified,
      averageRating: parseFloat(store.average_rating ?? 0),
      totalRatings: store.total_ratings  ?? 0,
      totalOrders:  store.total_orders   ?? 0,
      operatingHours: store.operating_hours ?? {},
      createdAt:    store.created_at,
      // Owner
      owner: {
        id:             store.owner_id,
        name:           `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
        email:          u.email          ?? null,
        phone:          u.phone          ?? null,
        avatarUrl:      u.avatar_url     ?? null,
        accountStatus:  u.status         ?? null,
        emailVerified:  u.email_verified ?? null,
      },
      // Documents
      documents: {
        ninNumber:          pv.nin_number ? '***provided***' : null,
        cacDocumentUrl:     pv.cac_document_url    ?? null,
        profilePictureUrl:  pv.profile_picture_url ?? null,
        storeImages:        pv.store_images        ?? [],
        registrationStatus: pv.verification_status ?? null,
        approvedAt:         pv.approved_at         ?? null,
      },
      // Wallet
      walletBalance:    Math.max(0, walletBalance),
      walletFormatted:  `₦${Math.max(0, walletBalance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
      // Stats
      stats: {
        totalOrders:     orders.length,
        deliveredOrders: orders.filter((o: any) => o.status === 'delivered').length,
        cancelledOrders: orders.filter((o: any) => o.status === 'cancelled').length,
        pendingOrders:   orders.filter((o: any) => o.status === 'pending').length,
        totalRevenue:    parseFloat(revenue.toFixed(2)),
      },
    };
  }

  static async setStoreStatus(storeId: string, isActive: boolean) {
    const { data: existing } = await supabase
      .from('spare_parts_stores')
      .select('id')
      .eq('id', storeId)
      .single();

    if (!existing) throw new Error('Store not found');

    const { error } = await supabase
      .from('spare_parts_stores')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', storeId);

    if (error) throw new Error(`Failed to update store: ${error.message}`);
    logger.info('Spare parts store status updated by admin', { storeId, isActive });
  }

  static async setStoreVerified(storeId: string, isVerified: boolean) {
    const { data: existing } = await supabase
      .from('spare_parts_stores')
      .select('id')
      .eq('id', storeId)
      .single();

    if (!existing) throw new Error('Store not found');

    const { error } = await supabase
      .from('spare_parts_stores')
      .update({ is_verified: isVerified, updated_at: new Date().toISOString() })
      .eq('id', storeId);

    if (error) throw new Error(`Failed to verify store: ${error.message}`);
    logger.info('Spare parts store verification updated by admin', { storeId, isVerified });
  }

  // ─── Orders ───────────────────────────────────────────────────────────────────

  static async getOrders(params: {
    status?:   string;
    storeId?:  string;
    dateFrom?: string;
    dateTo?:   string;
    page?:     number;
    limit?:    number;
  }) {
    const limit  = params.limit || 20;
    const offset = ((params.page || 1) - 1) * limit;

    let query = supabase
      .from('spare_parts_orders')
      .select(
        `id, customer_id, store_id, rider_id, status,
         payment_method, payment_status,
         subtotal, delivery_fee, service_fee, total_amount,
         delivery_address, vehicle_type, special_instructions,
         accepted_at, ready_at, shipped_at, delivered_at, cancelled_at, created_at,
         store:spare_parts_stores(id, name),
         orderItems:spare_parts_order_items(id, product_name, product_price, quantity, subtotal)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status)   query = query.eq('status', params.status);
    if (params.storeId)  query = query.eq('store_id', params.storeId);
    if (params.dateFrom) query = query.gte('created_at', params.dateFrom);
    if (params.dateTo)   query = query.lte('created_at', params.dateTo);

    const { data: orders, count, error } = await query;
    if (error) throw new Error(`Failed to get spare parts orders: ${error.message}`);

    const rows = orders ?? [];

    // Batch-fetch customers
    const customerIds = [...new Set(rows.map((o: any) => o.customer_id).filter(Boolean))];
    const customerMap = new Map<string, { name: string; phone: string | null; email: string | null }>();
    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone, email')
        .in('id', customerIds);
      for (const u of users ?? []) {
        const user = u as any;
        customerMap.set(user.id, {
          name:  `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unknown',
          phone: user.phone ?? null,
          email: user.email ?? null,
        });
      }
    }

    // Batch-fetch riders (driverId → user details)
    const riderIds  = [...new Set(rows.map((o: any) => o.rider_id).filter(Boolean))];
    const riderMap  = new Map<string, { name: string; phone: string | null }>();
    if (riderIds.length > 0) {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, user_id')
        .in('id', riderIds);

      const driverUserMap = new Map<string, string>();
      for (const d of drivers ?? []) driverUserMap.set((d as any).id, (d as any).user_id);

      const riderUserIds = [...driverUserMap.values()];
      if (riderUserIds.length > 0) {
        const { data: riderUsers } = await supabase
          .from('users')
          .select('id, first_name, last_name, phone')
          .in('id', riderUserIds);

        const userDetailMap = new Map<string, { name: string; phone: string | null }>();
        for (const u of riderUsers ?? []) {
          const user = u as any;
          userDetailMap.set(user.id, {
            name:  `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unknown',
            phone: user.phone ?? null,
          });
        }
        for (const [driverId, userId] of driverUserMap.entries()) {
          const details = userDetailMap.get(userId);
          if (details) riderMap.set(driverId, details);
        }
      }
    }

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
          subtotal:      parseFloat(o.subtotal     ?? 0),
          deliveryFee:   parseFloat(o.delivery_fee ?? 0),
          serviceFee:    parseFloat(o.service_fee  ?? 0),
          total:         parseFloat(o.total_amount ?? 0),
          paymentMethod: o.payment_method,
          paymentStatus: o.payment_status,
          display:       `₦${parseFloat(o.total_amount ?? 0).toLocaleString('en-NG')} · ${o.payment_method}`,
        },
        vehicleType:     o.vehicle_type ?? null,
        deliveryAddress: o.delivery_address,
        acceptedAt:      o.accepted_at  ?? null,
        readyAt:         o.ready_at     ?? null,
        shippedAt:       o.shipped_at   ?? null,
        deliveredAt:     o.delivered_at ?? null,
        cancelledAt:     o.cancelled_at ?? null,
        createdAt:       o.created_at,
      };
    });

    return {
      orders:     enriched,
      total:      count ?? 0,
      page:       params.page ?? 1,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    };
  }

  static async getOrderStatusCounts(filters: {
    storeId?:  string;
    dateFrom?: string;
    dateTo?:   string;
  } = {}) {
    let query = supabase.from('spare_parts_orders').select('status');

    if (filters.storeId)  query = query.eq('store_id', filters.storeId);
    if (filters.dateFrom) query = query.gte('created_at', filters.dateFrom);
    if (filters.dateTo)   query = query.lte('created_at', filters.dateTo);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get status counts: ${error.message}`);

    const rows = data ?? [];
    const counts = {
      all:               rows.length,
      pending:           0,
      in_progress:       0,
      ready_for_pickup:  0,
      searching_rider:   0,
      rider_accepted:    0,
      shipped:           0,
      delivered:         0,
      cancelled:         0,
    };

    for (const row of rows) {
      const s = (row as any).status as string;
      if (s === 'pending')                                        counts.pending++;
      else if (s === 'in_progress')                              counts.in_progress++;
      else if (s === 'ready_for_pickup')                         counts.ready_for_pickup++;
      else if (s === 'searching_rider')                          counts.searching_rider++;
      else if (['rider_accepted', 'heading_to_store',
                'heading_to_customer', 'arrived'].includes(s))   counts.rider_accepted++;
      else if (s === 'shipped')                                  counts.shipped++;
      else if (s === 'delivered')                                counts.delivered++;
      else if (s === 'cancelled')                                counts.cancelled++;
    }

    return counts;
  }

  static async getOrderById(orderId: string) {
    const { data: order, error } = await supabase
      .from('spare_parts_orders')
      .select(`
        id, customer_id, store_id, rider_id, status,
        payment_method, payment_status,
        subtotal, delivery_fee, service_fee, rounding_fee, total_amount,
        delivery_address, vehicle_type, special_instructions,
        cancellation_reason, cancelled_by, rejection_reason,
        accepted_at, ready_at, shipped_at, arrived_at, delivered_at, cancelled_at,
        created_at, updated_at
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Order not found');

    // Items
    const { data: items } = await supabase
      .from('spare_parts_order_items')
      .select('id, product_id, product_name, product_price, quantity, subtotal')
      .eq('order_id', orderId);

    // Store
    const { data: store } = await supabase
      .from('spare_parts_stores')
      .select('id, name, address, city, state, logo_url, phone')
      .eq('id', order.store_id)
      .single();

    // Customer
    const { data: customer } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .eq('id', order.customer_id)
      .single();

    // Rider
    let riderInfo: any = null;
    if (order.rider_id) {
      const { data: rider } = await supabase
        .from('drivers')
        .select(`id, user_id, rating, vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)`)
        .eq('id', order.rider_id)
        .single();

      if (rider) {
        const { data: riderUser } = await supabase
          .from('users')
          .select('first_name, last_name, phone, avatar_url')
          .eq('id', (rider as any).user_id)
          .single();

        const vehicles      = ((rider as any).vehicles as any[]) ?? [];
        const activeVehicle = vehicles.find((v: any) => v.is_active) ?? vehicles[0] ?? null;

        riderInfo = {
          id:     rider.id,
          name:   riderUser ? `${(riderUser as any).first_name ?? ''} ${(riderUser as any).last_name ?? ''}`.trim() : 'Unknown',
          phone:  (riderUser as any)?.phone ?? null,
          avatar: (riderUser as any)?.avatar_url ?? null,
          rating: parseFloat(String((rider as any).rating)) || 0,
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
      .from('spare_parts_order_status_history')
      .select('id, status, previous_status, changed_by_role, notes, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    const c = (customer ?? {}) as any;
    const s = (store    ?? {}) as any;

    return {
      id:            order.id,
      status:        order.status,
      paymentMethod: order.payment_method,
      paymentStatus: order.payment_status,
      amount: {
        subtotal:    parseFloat(order.subtotal     ?? 0),
        deliveryFee: parseFloat(order.delivery_fee ?? 0),
        serviceFee:  parseFloat(order.service_fee  ?? 0),
        roundingFee: parseFloat(order.rounding_fee ?? 0),
        total:       parseFloat(order.total_amount ?? 0),
      },
      vehicleType:         order.vehicle_type ?? null,
      deliveryAddress:     order.delivery_address,
      specialInstructions: order.special_instructions ?? null,
      customer: customer ? {
        id:     c.id,
        name:   `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
        email:  c.email      ?? null,
        phone:  c.phone      ?? null,
        avatar: c.avatar_url ?? null,
      } : { id: order.customer_id, name: 'Unknown', email: null, phone: null, avatar: null },
      store: store ? {
        id:      s.id,
        name:    s.name,
        address: s.address,
        city:    s.city,
        state:   s.state,
        logo:    s.logo_url,
        phone:   s.phone,
      } : { id: order.store_id, name: 'Unknown' },
      rider: riderInfo,
      items: items ?? [],
      timeline: (statusHistory ?? []).map((h: any) => ({
        id:             h.id,
        status:         h.status,
        previousStatus: h.previous_status,
        changedByRole:  h.changed_by_role,
        notes:          h.notes,
        createdAt:      h.created_at,
      })),
      acceptedAt:         order.accepted_at  ?? null,
      readyAt:            order.ready_at     ?? null,
      shippedAt:          order.shipped_at   ?? null,
      arrivedAt:          order.arrived_at   ?? null,
      deliveredAt:        order.delivered_at ?? null,
      cancelledAt:        order.cancelled_at ?? null,
      cancellationReason: order.cancellation_reason ?? null,
      rejectionReason:    order.rejection_reason    ?? null,
      createdAt:          order.created_at,
      updatedAt:          order.updated_at,
    };
  }

  // ─── Store Order History ───────────────────────────────────────────────────

  static async getStoreOrders(storeId: string, filters: {
    status?:   string;
    dateFrom?: string;
    dateTo?:   string;
    page?:     number;
    limit?:    number;
  }) {
    // Verify store exists
    const { data: store } = await supabase
      .from('spare_parts_stores')
      .select('id, name')
      .eq('id', storeId)
      .single();

    if (!store) throw new Error('Store not found');

    return SparePartsAdminService.getOrders({
      ...filters,
      storeId,
    });
  }

  // ─── Analytics ────────────────────────────────────────────────────────────────

  static async getAnalytics(dateFrom?: string, dateTo?: string) {
    let orderQuery = supabase
      .from('spare_parts_orders')
      .select('created_at, total_amount, status, payment_method');

    if (dateFrom) orderQuery = orderQuery.gte('created_at', dateFrom);
    if (dateTo)   orderQuery = orderQuery.lte('created_at', dateTo);

    const [
      { data: orders,      error: ordersError },
      { count: totalStores                    },
      { count: activeStores                   },
      { count: verifiedStores                 },
    ] = await Promise.all([
      orderQuery,
      supabase.from('spare_parts_stores').select('*', { count: 'exact', head: true }),
      supabase.from('spare_parts_stores').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('spare_parts_stores').select('*', { count: 'exact', head: true }).eq('is_verified', true),
    ]);

    if (ordersError) throw new Error(`Failed to get analytics: ${ordersError.message}`);

    const allOrders = orders ?? [];
    const delivered = allOrders.filter((o: any) => o.status === 'delivered');

    const totalRevenue = delivered.reduce(
      (acc: number, o: any) => acc + parseFloat(String(o.total_amount ?? 0)), 0
    );

    const byDate: Record<string, { orders: number; revenue: number }> = {};
    for (const o of delivered) {
      const date = new Date((o as any).created_at as string).toISOString().split('T')[0];
      if (!byDate[date]) byDate[date] = { orders: 0, revenue: 0 };
      byDate[date].orders++;
      byDate[date].revenue += parseFloat(String((o as any).total_amount ?? 0));
    }

    return {
      total_orders:     allOrders.length,
      delivered_orders: delivered.length,
      cancelled_orders: allOrders.filter((o: any) => o.status === 'cancelled').length,
      pending_orders:   allOrders.filter((o: any) => o.status === 'pending').length,
      total_revenue:    parseFloat(totalRevenue.toFixed(2)),
      total_stores:     totalStores   ?? 0,
      active_stores:    activeStores  ?? 0,
      verified_stores:  verifiedStores ?? 0,
      by_date: Object.entries(byDate)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }
}
