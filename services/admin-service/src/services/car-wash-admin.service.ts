import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export class CarWashAdminService {
  // ─── Vendors ──────────────────────────────────────────────────────────────

  static async getVendors(filters: {
    status?: string;
    city?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, city, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('car_wash_vendors')
      .select(
        'id, user_id, business_name, phone, email, city, state, address, status, rating, total_customers, total_hours_served, logo_url, cover_image_url, created_at, updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (city)   query = query.ilike('city', `%${city}%`);

    const { data: vendors, count, error } = await query;
    if (error) throw new Error(`Failed to get car wash vendors: ${error.message}`);

    return { vendors: vendors ?? [], total: count ?? 0, page, limit };
  }

  static async getVendorById(vendorId: string) {
    const { data: vendor, error } = await supabase
      .from('car_wash_vendors')
      .select('*, car_wash_services(*)')
      .eq('id', vendorId)
      .single();

    if (error || !vendor) throw new Error('Car wash vendor not found');

    // Enrich with user details
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, status, email_verified')
      .eq('id', vendor.user_id)
      .single();

    // Pull submitted documents from platform-service vendors table
    // (NIN, CAC, profile picture, store images submitted during registration)
    const { data: platformVendor } = await supabase
      .from('vendors')
      .select('nin_number, cac_document_url, profile_picture_url, store_images, logo_url, verification_status, rejection_reason, approved_at')
      .eq('user_id', vendor.user_id)
      .maybeSingle();

    // Wallet balance
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount')
      .eq('user_id', vendor.user_id)
      .eq('status', 'completed');

    const CREDIT = new Set(['credit', 'topup', 'refund', 'earning', 'tip_payment']);
    const DEBIT  = new Set(['debit', 'hold', 'withdrawal', 'payment']);
    let walletBalance = 0;
    for (const tx of txns ?? []) {
      const t = tx as any;
      const amt = parseFloat(String(t.amount ?? 0));
      if (CREDIT.has(t.transaction_type))     walletBalance += amt;
      else if (DEBIT.has(t.transaction_type)) walletBalance -= amt;
    }

    // Booking stats
    const { data: bookingStats } = await supabase
      .from('car_wash_bookings')
      .select('status, total_amount, payment_status')
      .eq('vendor_id', vendorId);

    const bookings = bookingStats ?? [];
    const revenue = bookings
      .filter((b: any) => b.status === 'completed' && b.payment_status === 'paid')
      .reduce((sum: number, b: any) => sum + parseFloat(b.total_amount ?? 0), 0);

    const u = user ?? {} as any;
    const pv = platformVendor ?? {} as any;

    return {
      // Car wash vendor record
      id:               vendor.id,
      business_name:    vendor.business_name,
      description:      vendor.description,
      phone:            vendor.phone,
      email:            vendor.email,
      address:          vendor.address,
      city:             vendor.city,
      state:            vendor.state,
      latitude:         vendor.latitude,
      longitude:        vendor.longitude,
      logo_url:         vendor.logo_url,
      cover_image_url:  vendor.cover_image_url,
      status:           vendor.status,
      rating:           vendor.rating,
      total_customers:  vendor.total_customers,
      total_hours_served: vendor.total_hours_served,
      operating_hours:  vendor.operating_hours,
      is_open:          vendor.is_open ?? false,
      rejection_reason: vendor.rejection_reason,
      reviewed_at:      vendor.reviewed_at,
      created_at:       vendor.created_at,
      // Owner identity
      owner: {
        id:             vendor.user_id,
        name:           `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
        email:          u.email ?? null,
        phone:          u.phone ?? null,
        avatar_url:     u.avatar_url ?? null,
        account_status: u.status ?? null,
        email_verified: u.email_verified ?? null,
      },
      // Submitted documents (from platform-service vendors table)
      documents: {
        nin_number:          pv.nin_number ? '***provided***' : null,
        cac_document_url:    pv.cac_document_url ?? null,
        profile_picture_url: pv.profile_picture_url ?? null,
        store_images:        pv.store_images ?? [],
        registration_status: pv.verification_status ?? null,
        approved_at:         pv.approved_at ?? null,
      },
      // Wallet
      wallet_balance: Math.max(0, walletBalance),
      wallet_formatted: `₦${Math.max(0, walletBalance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
      // Stats
      stats: {
        total_bookings:     bookings.length,
        completed_bookings: bookings.filter((b: any) => b.status === 'completed').length,
        cancelled_bookings: bookings.filter((b: any) => b.status === 'cancelled').length,
        pending_bookings:   bookings.filter((b: any) => b.status === 'pending').length,
        total_revenue:      parseFloat(revenue.toFixed(2)),
      },
      // Active services
      services: (vendor.car_wash_services ?? []).filter((s: any) => s.is_active),
    };
  }

  static async approveVendor(vendorId: string, adminId: string) {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .update({
        status: 'approved',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error || !data) throw new Error('Car wash vendor not found');
    logger.info('Car wash vendor approved', { adminId, vendorId });
    return data;
  }

  static async rejectVendor(vendorId: string, adminId: string, reason: string) {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .update({
        status: 'rejected',
        rejection_reason: reason,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error || !data) throw new Error('Car wash vendor not found');
    logger.info('Car wash vendor rejected', { adminId, vendorId, reason });
    return data;
  }

  static async suspendVendor(vendorId: string, adminId: string, reason: string) {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .update({
        status: 'suspended',
        rejection_reason: reason,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error || !data) throw new Error('Car wash vendor not found');
    logger.warn('Car wash vendor suspended', { adminId, vendorId, reason });
    return data;
  }

  static async reactivateVendor(vendorId: string, adminId: string) {
    const { data, error } = await supabase
      .from('car_wash_vendors')
      .update({
        status: 'approved',
        rejection_reason: null,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error || !data) throw new Error('Car wash vendor not found');
    logger.info('Car wash vendor reactivated', { adminId, vendorId });
    return data;
  }

  // ─── Bookings ──────────────────────────────────────────────────────────────

  static async getBookingStatusCounts(filters: {
    vendor_id?: string;
    from?: string;
    to?: string;
  }) {
    let query = supabase
      .from('car_wash_bookings')
      .select('status');

    if (filters.vendor_id) query = query.eq('vendor_id', filters.vendor_id);
    if (filters.from)      query = query.gte('created_at', filters.from);
    if (filters.to)        query = query.lte('created_at', filters.to);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get booking counts: ${error.message}`);

    const rows = data ?? [];
    return {
      all:         rows.length,
      pending:     rows.filter((b: any) => b.status === 'pending').length,
      confirmed:   rows.filter((b: any) => b.status === 'confirmed').length,
      in_progress: rows.filter((b: any) => b.status === 'in_progress').length,
      completed:   rows.filter((b: any) => b.status === 'completed').length,
      cancelled:   rows.filter((b: any) => b.status === 'cancelled').length,
      no_show:     rows.filter((b: any) => b.status === 'no_show').length,
    };
  }

  static async getBookingById(bookingId: string) {
    const { data: booking, error } = await supabase
      .from('car_wash_bookings')
      .select('*, car_wash_services(id, name, category, duration_minutes, price)')
      .eq('id', bookingId)
      .single();

    if (error || !booking) throw new Error('Booking not found');

    // Customer full profile
    const { data: customer } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .eq('id', booking.customer_id)
      .single();

    // Vendor full profile
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('id, business_name, phone, email, address, city, state, logo_url, rating')
      .eq('id', booking.vendor_id)
      .single();

    const c = (customer ?? {}) as any;
    const v = (vendor    ?? {}) as any;
    const s = (booking.car_wash_services ?? {}) as any;

    return {
      id:               booking.id,
      booking_type:     booking.booking_type,
      status:           booking.status,
      scheduled_at:     booking.scheduled_at,
      service_address:  booking.service_address,
      service_latitude: booking.service_latitude,
      service_longitude: booking.service_longitude,

      // Vehicle info
      vehicle: {
        description: booking.vehicle_description ?? null,
        photo_urls:  booking.vehicle_photo_urls ?? [],
      },

      // Notes
      notes: booking.notes ?? null,

      // Payment breakdown
      payment: {
        total_amount:   parseFloat(booking.total_amount ?? 0),
        payment_method: booking.payment_method,
        payment_status: booking.payment_status,
      },

      // Customer full profile
      customer: customer ? {
        id:        c.id,
        name:      `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Customer',
        email:     c.email ?? null,
        phone:     c.phone ?? null,
        avatar_url: c.avatar_url ?? null,
      } : { id: booking.customer_id, name: 'Customer', email: null, phone: null, avatar_url: null },

      // Vendor full profile
      vendor: vendor ? {
        id:            v.id,
        business_name: v.business_name,
        phone:         v.phone ?? null,
        email:         v.email ?? null,
        address:       v.address ?? null,
        city:          v.city ?? null,
        state:         v.state ?? null,
        logo_url:      v.logo_url ?? null,
        rating:        parseFloat(v.rating ?? 0),
      } : { id: booking.vendor_id, business_name: 'Vendor' },

      // Service detail
      service: s,

      // Rating & feedback
      customer_rating:   booking.customer_rating ?? null,
      customer_feedback: booking.customer_feedback ?? null,
      vendor_rating:     booking.vendor_rating ?? null,

      // Timeline
      timeline: {
        created_at:   booking.created_at,
        confirmed_at: null,   // not stored separately — use status transitions
        started_at:   booking.started_at ?? null,
        completed_at: booking.completed_at ?? null,
        cancelled_at: booking.cancelled_at ?? null,
      },

      cancellation_reason: booking.cancellation_reason ?? null,
    };
  }

  static async getBookings(filters: {
    status?: string;
    vendor_id?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, vendor_id, from, to, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('car_wash_bookings')
      .select(
        `id, customer_id, vendor_id, service_id, booking_type, status,
         scheduled_at, service_address, total_amount, payment_method, payment_status,
         customer_rating, created_at, updated_at,
         vendor:car_wash_vendors(id, business_name),
         service:car_wash_services(id, name, category)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status)    query = query.eq('status', status);
    if (vendor_id) query = query.eq('vendor_id', vendor_id);
    if (from)      query = query.gte('created_at', from);
    if (to)        query = query.lte('created_at', to);

    const { data: bookings, count, error } = await query;
    if (error) throw new Error(`Failed to get car wash bookings: ${error.message}`);

    // Enrich with customer names
    const rows = bookings ?? [];
    const customerIds = [...new Set(rows.map((b: any) => b.customer_id).filter(Boolean))];
    const customerMap = new Map<string, string>();

    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .in('id', customerIds);
      for (const u of users ?? []) {
        const user = u as any;
        customerMap.set(user.id, `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unknown');
      }
    }

    const enriched = rows.map((b: any, idx: number) => ({
      sn: offset + idx + 1,
      id: b.id,
      status: b.status,
      booking_type: b.booking_type,
      scheduled_at: b.scheduled_at,
      service_address: b.service_address,
      customer: {
        id: b.customer_id,
        name: customerMap.get(b.customer_id) ?? 'Unknown',
      },
      vendor: b.vendor,
      service: b.service,
      amount: {
        total: parseFloat(b.total_amount ?? 0),
        payment_method: b.payment_method,
        payment_status: b.payment_status,
      },
      customer_rating: b.customer_rating,
      created_at: b.created_at,
    }));

    return { bookings: enriched, total: count ?? 0, page, limit };
  }

  // ─── Vendor wallet balance ─────────────────────────────────────────────────

  static async getVendorWalletBalance(vendorId: string) {
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('id, user_id, business_name, status')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Car wash vendor not found');

    // Wallet balance from wallet_transactions
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount')
      .eq('user_id', vendor.user_id)
      .eq('status', 'completed');

    const CREDIT = new Set(['credit', 'topup', 'refund', 'earning', 'tip_payment']);
    const DEBIT  = new Set(['debit', 'hold', 'withdrawal', 'payment']);

    let balance = 0;
    for (const tx of txns ?? []) {
      const t = tx as any;
      const amt = parseFloat(String(t.amount ?? 0));
      if (CREDIT.has(t.transaction_type))     balance += amt;
      else if (DEBIT.has(t.transaction_type)) balance -= amt;
    }

    const { data: user } = await supabase
      .from('users')
      .select('first_name, last_name, email, phone')
      .eq('id', vendor.user_id)
      .single();

    const u = (user ?? {}) as any;

    return {
      vendor_id:       vendor.id,
      user_id:         vendor.user_id,
      business_name:   vendor.business_name,
      status:          vendor.status,
      first_name:      u.first_name ?? null,
      last_name:       u.last_name ?? null,
      email:           u.email ?? null,
      phone:           u.phone ?? null,
      wallet_balance:  Math.max(0, balance),
      currency_code:   'NGN',
      formatted_balance: `₦${Math.max(0, balance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
    };
  }

  // ─── Vendor booking history ─────────────────────────────────────────────────

  static async getVendorBookings(vendorId: string, filters: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, from, to, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Verify vendor exists
    const { data: vendor } = await supabase
      .from('car_wash_vendors')
      .select('id, business_name')
      .eq('id', vendorId)
      .single();

    if (!vendor) throw new Error('Car wash vendor not found');

    let query = supabase
      .from('car_wash_bookings')
      .select(
        `id, customer_id, booking_type, status, scheduled_at,
         service_address, total_amount, payment_method, payment_status,
         customer_rating, customer_feedback, created_at,
         service:car_wash_services(id, name, category, duration_minutes)`,
        { count: 'exact' }
      )
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (from)   query = query.gte('created_at', from);
    if (to)     query = query.lte('created_at', to);

    const { data: bookings, count, error } = await query;
    if (error) throw new Error(`Failed to fetch bookings: ${error.message}`);

    // Batch-fetch customer names
    const rows = bookings ?? [];
    const customerIds = [...new Set(rows.map((b: any) => b.customer_id).filter(Boolean))];
    const customerMap = new Map<string, { name: string; phone: string | null }>();

    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', customerIds);
      for (const u of users ?? []) {
        const user = u as any;
        customerMap.set(user.id, {
          name:  `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Customer',
          phone: user.phone ?? null,
        });
      }
    }

    const orders = rows.map((b: any, idx: number) => ({
      sn:              offset + idx + 1,
      id:              b.id,
      booking_type:    b.booking_type,
      status:          b.status,
      scheduled_at:    b.scheduled_at,
      service_address: b.service_address,
      service:         b.service,
      customer: customerMap.get(b.customer_id) ?? { name: 'Customer', phone: null },
      amount: {
        total:          parseFloat(b.total_amount ?? 0),
        payment_method: b.payment_method,
        payment_status: b.payment_status,
      },
      rating:    b.customer_rating ?? null,
      feedback:  b.customer_feedback ?? null,
      created_at: b.created_at,
    }));

    return {
      vendor: { id: vendor.id, business_name: vendor.business_name },
      orders,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    };
  }

  // ─── Dashboard stats ───────────────────────────────────────────────────────

  static async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { data: vendorData },
      { data: bookingData },
      { data: monthBookingData },
    ] = await Promise.all([
      supabase.from('car_wash_vendors').select('status'),
      supabase.from('car_wash_bookings').select('status, total_amount, payment_status'),
      supabase.from('car_wash_bookings')
        .select('status, total_amount, payment_status')
        .gte('created_at', startOfMonth),
    ]);

    const vendors  = vendorData  ?? [];
    const bookings = bookingData ?? [];
    const monthly  = monthBookingData ?? [];

    const totalRevenue = bookings
      .filter((b: any) => b.status === 'completed' && b.payment_status === 'paid')
      .reduce((sum: number, b: any) => sum + parseFloat(b.total_amount ?? 0), 0);

    const monthRevenue = monthly
      .filter((b: any) => b.status === 'completed' && b.payment_status === 'paid')
      .reduce((sum: number, b: any) => sum + parseFloat(b.total_amount ?? 0), 0);

    return {
      vendors: {
        total:    vendors.length,
        pending:  vendors.filter((v: any) => v.status === 'pending').length,
        approved: vendors.filter((v: any) => v.status === 'approved').length,
        suspended: vendors.filter((v: any) => v.status === 'suspended').length,
      },
      bookings: {
        total:     bookings.length,
        completed: bookings.filter((b: any) => b.status === 'completed').length,
        cancelled: bookings.filter((b: any) => b.status === 'cancelled').length,
        pending:   bookings.filter((b: any) => b.status === 'pending').length,
      },
      revenue: {
        total:       parseFloat(totalRevenue.toFixed(2)),
        this_month:  parseFloat(monthRevenue.toFixed(2)),
        month_orders: monthly.length,
      },
    };
  }
}
