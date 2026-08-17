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
      .select('id, first_name, last_name, email, phone, avatar_url, status')
      .eq('id', vendor.user_id)
      .single();

    // Booking stats
    const { data: bookingStats } = await supabase
      .from('car_wash_bookings')
      .select('status, total_amount, payment_status')
      .eq('vendor_id', vendorId);

    const bookings = bookingStats ?? [];
    const totalBookings = bookings.length;
    const completedBookings = bookings.filter((b: any) => b.status === 'completed').length;
    const revenue = bookings
      .filter((b: any) => b.status === 'completed' && b.payment_status === 'paid')
      .reduce((sum: number, b: any) => sum + parseFloat(b.total_amount ?? 0), 0);

    const u = user ?? {} as any;

    return {
      ...vendor,
      owner: {
        id: vendor.user_id,
        name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
        email: u.email ?? null,
        phone: u.phone ?? null,
        avatar_url: u.avatar_url ?? null,
        account_status: u.status ?? null,
      },
      stats: {
        total_bookings: totalBookings,
        completed_bookings: completedBookings,
        total_revenue: parseFloat(revenue.toFixed(2)),
      },
      services: vendor.car_wash_services ?? [],
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
