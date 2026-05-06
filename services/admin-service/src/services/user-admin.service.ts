import { supabase } from '../config/database';
import { logger } from '../utils/logger';

const VALID_ROLES = ['customer', 'driver', 'vendor', 'admin', 'super_admin'];

export class UserAdminService {
  static async getUsers(filters: {
    role?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { role, status, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select(
        'id, email, first_name, last_name, username, roles, active_role, phone, status, email_verified, created_at, updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role) query = query.contains('roles', [role]);
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);

    const { data: users, count, error } = await query;
    if (error) throw new Error(`Failed to get users: ${error.message}`);

    return { users: users || [], total: count || 0, page, limit };
  }

  static async getUserById(userId: string) {
    // ── 1. Core user record ───────────────────────────────────────────────────
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, username, roles, active_role, phone, status, email_verified, avatar_url, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (userError || !user) return null;
    const u = user as Record<string, unknown>;

    // ── 2. Wallet balance — sum of completed credit minus debit transactions ──
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount, status')
      .eq('user_id', userId)
      .eq('status', 'completed');

    let walletBalance = 0;
    for (const tx of txns ?? []) {
      const row = tx as Record<string, unknown>;
      const amt = Number(row.amount ?? 0);
      if (row.transaction_type === 'credit' || row.transaction_type === 'topup') {
        walletBalance += amt;
      } else if (row.transaction_type === 'debit' || row.transaction_type === 'payment') {
        walletBalance -= amt;
      }
    }

    // ── 3. Build response (no orders — use GET /:userId/orders for that) ──────
    return {
      id: u.id,
      email: u.email,
      first_name: u.first_name,
      last_name: u.last_name,
      username: u.username,
      phone: u.phone,
      avatar_url: u.avatar_url,
      roles: u.roles,
      active_role: u.active_role,
      status: u.status,
      email_verified: u.email_verified,
      created_at: u.created_at,
      updated_at: u.updated_at,

      // Profile fields — not yet in DB, return null until schema is extended
      gender: null,
      date_of_birth: null,
      nationality: null,
      address_line: null,
      city: null,
      state: null,
      country: null,
      nin_number: null,
      verification_photo_url: null,

      // Wallet
      wallet_balance: Math.max(0, walletBalance),
    };
  }

  /**
   * GET /api/admin/users/:userId/orders
   * Returns the full order history for a specific user across all services.
   * Called when admin clicks "View History".
   */
  static async getUserOrders(userId: string, filters: {
    status?: string;
    service?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Normalise display status → raw DB statuses
    const statusMap: Record<string, string> = {
      delivered: 'Completed', completed: 'Completed',
      cancelled: 'Cancelled', pending: 'Pending',
      accepted: 'In Progress', preparing: 'In Progress',
      ready: 'In Progress', picked_up: 'In Progress',
      shipped: 'In Progress', in_progress: 'In Progress',
      confirmed: 'In Progress', arrived: 'In Progress',
      rejected: 'Cancelled', courier_not_found: 'Pending',
    };

    const formatDate = (iso: string) =>
      new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    const serviceKey = filters.service?.toLowerCase().replace(/[\s-]+/g, '_');

    type RawRow = { id: string; status: string; created_at: string };

    const fetchers: Promise<{ rows: RawRow[]; service: string }>[] = [];

    const buildFetcher = (
      query: PromiseLike<{ data: RawRow[] | null }>,
      service: string
    ): Promise<{ rows: RawRow[]; service: string }> =>
      Promise.resolve(query).then(({ data }) => ({ rows: (data ?? []) as RawRow[], service }))
        .catch(() => ({ rows: [] as RawRow[], service }));

    if (!serviceKey || serviceKey === 'olakz_food') {
      fetchers.push(buildFetcher(
        supabase.from('food_orders').select('id, status, created_at').eq('customer_id', userId).order('created_at', { ascending: false }),
        'Olakz Food'
      ));
    }
    if (!serviceKey || serviceKey === 'marketplace') {
      fetchers.push(buildFetcher(
        supabase.from('marketplace_orders').select('id, status, created_at').eq('customer_id', userId).order('created_at', { ascending: false }),
        'Marketplace'
      ));
    }
    if (!serviceKey || serviceKey === 'olakz_ride') {
      fetchers.push(buildFetcher(
        supabase.from('rides').select('id, status, created_at').eq('passenger_id', userId).order('created_at', { ascending: false }),
        'Olakz Ride'
      ));
    }
    if (!serviceKey || serviceKey === 'olakz_delivery') {
      fetchers.push(buildFetcher(
        supabase.from('deliveries').select('id, status, created_at').eq('sender_id', userId).order('created_at', { ascending: false }),
        'Olakz Delivery'
      ));
    }

    const results = await Promise.allSettled(fetchers);

    type MergedOrder = { id: string; status: string; created_at: string; service: string };
    let allOrders: MergedOrder[] = [];

    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const row of r.value.rows) {
          allOrders.push({ ...row, service: r.value.service });
        }
      }
    }

    // Sort newest first
    allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply status filter after merge (display status)
    if (filters.status && filters.status.toLowerCase() !== 'all') {
      const target = filters.status.toLowerCase();
      allOrders = allOrders.filter(
        (o) => (statusMap[o.status.toLowerCase()] ?? o.status).toLowerCase() === target
      );
    }

    // Apply date range filter
    if (filters.from) {
      allOrders = allOrders.filter((o) => new Date(o.created_at) >= new Date(filters.from!));
    }
    if (filters.to) {
      const toEnd = new Date(filters.to);
      toEnd.setHours(23, 59, 59, 999);
      allOrders = allOrders.filter((o) => new Date(o.created_at) <= toEnd);
    }

    const total = allOrders.length;
    const paginated = allOrders.slice(offset, offset + limit);

    const orders = paginated.map((o, idx) => ({
      sn: offset + idx + 1,
      id: o.id,
      service: o.service,
      status: statusMap[o.status.toLowerCase()] ?? o.status,
      date: formatDate(o.created_at),
    }));

    return {
      orders,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  static async updateRoles(userId: string, roles: string[], activeRole?: string) {
    // Validate roles
    const invalidRoles = roles.filter(r => !VALID_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      throw new Error(`Invalid roles: ${invalidRoles.join(', ')}. Valid roles: ${VALID_ROLES.join(', ')}`);
    }

    if (activeRole && !roles.includes(activeRole)) {
      throw new Error('activeRole must be one of the assigned roles');
    }

    const updateData: Record<string, unknown> = {
      roles,
      updated_at: new Date().toISOString(),
    };
    if (activeRole) updateData.active_role = activeRole;

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select('id, email, roles, active_role, status')
      .single();

    if (error || !user) throw new Error('User not found');

    logger.info('User roles updated by admin', { userId, roles, activeRole });
    return user;
  }

  static async setUserStatus(userId: string, status: 'active' | 'suspended' | 'terminated') {
    // First check the user exists and get current status
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id, email, status')
      .eq('id', userId)
      .single();

    if (fetchError || !existing) throw new Error('User not found');

    const current = (existing as Record<string, unknown>).status as string;

    // Terminated accounts cannot be reactivated or suspended via this method
    if (current === 'terminated') {
      throw new Error('ACCOUNT_TERMINATED');
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, email, status, updated_at')
      .single();

    if (error || !user) throw new Error('Failed to update user status');

    logger.info('User status updated by admin', { userId, from: current, to: status });
    return user;
  }

  // ─── Suspend / Reactivate ─────────────────────────────────────────────────

  static async toggleSuspend(userId: string, adminId: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id, email, status')
      .eq('id', userId)
      .single();

    if (fetchError || !existing) throw new Error('User not found');

    const current = (existing as Record<string, unknown>).status as string;
    if (current === 'terminated') throw new Error('ACCOUNT_TERMINATED');

    const newStatus = current === 'suspended' ? 'active' : 'suspended';

    const { data: user, error } = await supabase
      .from('users')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, email, status, updated_at')
      .single();

    if (error || !user) throw new Error('Failed to update account status');

    logger.info('Admin toggled user suspension', { adminId, userId, from: current, to: newStatus });
    return { user, action: newStatus === 'suspended' ? 'suspended' : 'reactivated' };
  }

  // ─── Terminate ────────────────────────────────────────────────────────────

  static async terminateAccount(userId: string, adminId: string, reason?: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id, email, status')
      .eq('id', userId)
      .single();

    if (fetchError || !existing) throw new Error('User not found');

    const current = (existing as Record<string, unknown>).status as string;
    if (current === 'terminated') throw new Error('ALREADY_TERMINATED');

    const { data: user, error } = await supabase
      .from('users')
      .update({ status: 'terminated', updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, email, status, updated_at')
      .single();

    if (error || !user) throw new Error('Failed to terminate account');

    logger.warn('Admin terminated user account', { adminId, userId, previousStatus: current, reason: reason ?? 'No reason provided' });
    return user;
  }

  static async getPlatformStats() {
    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: totalDrivers },
      { count: approvedDrivers },
      { count: totalVendors },
      { count: approvedVendors },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('drivers').select('*', { count: 'exact', head: true }),
      supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('vendors').select('*', { count: 'exact', head: true }),
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('verification_status', 'approved'),
    ]);

    return {
      users: { total: totalUsers || 0, active: activeUsers || 0 },
      drivers: { total: totalDrivers || 0, approved: approvedDrivers || 0 },
      vendors: { total: totalVendors || 0, approved: approvedVendors || 0 },
    };
  }
}
