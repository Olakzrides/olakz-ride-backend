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

    const CREDIT_TYPES = new Set(['credit', 'topup', 'refund', 'tip_received', 'earning', 'tip_payment']);
    const DEBIT_TYPES  = new Set(['debit', 'hold', 'withdrawal', 'payment']);

    let walletBalance = 0;
    for (const tx of txns ?? []) {
      const row  = tx as Record<string, unknown>;
      const amt  = parseFloat(String(row.amount ?? 0));
      const type = String(row.transaction_type ?? '');
      if (CREDIT_TYPES.has(type))     walletBalance += amt;
      else if (DEBIT_TYPES.has(type)) walletBalance -= amt;
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
   * GET /api/admin/users/:userId/view-wallet-balance
   * Returns only the wallet balance for a specific user.
   */
  static async getUserWalletBalance(userId: string) {
    // ── 1. Check if user exists ───────────────────────────────────────────────
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, roles, active_role')
      .eq('id', userId)
      .single();

    if (userError || !user) return null;

    // ── 2. Calculate wallet balance ───────────────────────────────────────────
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount, status')
      .eq('user_id', userId)
      .eq('status', 'completed');

    const CREDIT_TYPES = new Set(['credit', 'topup', 'refund', 'tip_received', 'earning', 'tip_payment']);
    const DEBIT_TYPES  = new Set(['debit', 'hold', 'withdrawal', 'payment']);

    let walletBalance = 0;
    for (const tx of txns ?? []) {
      const row  = tx as Record<string, unknown>;
      const amt  = parseFloat(String(row.amount ?? 0));
      const type = String(row.transaction_type ?? '');
      if (CREDIT_TYPES.has(type))     walletBalance += amt;
      else if (DEBIT_TYPES.has(type)) walletBalance -= amt;
    }

    // ── 3. Return wallet balance only ─────────────────────────────────────────
    return {
      user_id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      roles: user.roles,
      active_role: user.active_role,
      wallet_balance: Math.max(0, walletBalance),
      currency_code: 'NGN',
      formatted_balance: `₦${Math.max(0, walletBalance).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
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
        supabase.from('deliveries').select('id, status, created_at').eq('customer_id', userId).order('created_at', { ascending: false }),
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

    // Idempotent — if already terminated, return success instead of throwing
    if (current === 'terminated') {
      logger.info('terminateAccount: account already terminated (idempotent)', { adminId, userId });
      return existing;
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({ status: 'terminated', updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, email, status, updated_at')
      .single();

    if (error || !user) throw new Error('Failed to terminate account');

    const now = new Date().toISOString();

    // Disable driver record (non-fatal)
    await supabase
      .from('drivers')
      .update({ status: 'account_deleted', updated_at: now })
      .eq('user_id', userId);

    // Disable vendor record + deactivate all vendor products (non-fatal)
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (vendor) {
      await supabase
        .from('vendors')
        .update({ verification_status: 'account_deleted', is_active: false, updated_at: now })
        .eq('user_id', userId);

      // Deactivate food restaurant + menu items
      const { data: restaurant } = await supabase
        .from('food_restaurants')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle();

      if (restaurant) {
        await supabase
          .from('food_restaurants')
          .update({ is_active: false, is_open: false, updated_at: now })
          .eq('owner_id', userId);
        await supabase
          .from('food_menu_items')
          .update({ is_active: false, is_available: false, updated_at: now })
          .eq('restaurant_id', restaurant.id);
        logger.info('Food restaurant + menu deactivated on account termination', { userId, adminId, restaurantId: restaurant.id });
      }

      // Deactivate marketplace store + products
      const { data: store } = await supabase
        .from('marketplace_stores')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle();

      if (store) {
        await supabase
          .from('marketplace_stores')
          .update({ is_active: false, is_open: false, updated_at: now })
          .eq('owner_id', userId);
        await supabase
          .from('marketplace_products')
          .update({ is_active: false, is_available: false, updated_at: now })
          .eq('store_id', store.id);
        logger.info('Marketplace store + products deactivated on account termination', { userId, adminId, storeId: store.id });
      }
    }

    logger.warn('Admin terminated user account', { adminId, userId, previousStatus: current, reason: reason ?? 'No reason provided' });
    return user;
  }

  static async getPlatformStats() {
    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: totalDrivers },
      { count: approvedDrivers },
      { count: pendingDrivers },
      { count: totalVendors },
      { count: approvedVendors },
      { count: pendingVendors },
      { count: totalFleetOwners },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('drivers').select('*', { count: 'exact', head: true }),
      supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('vendors').select('*', { count: 'exact', head: true }),
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('verification_status', 'approved'),
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('verification_status', 'pending'),
      supabase.from('users').select('*', { count: 'exact', head: true }).contains('roles', ['fleet_owner']),
    ]);

    return {
      users:    { total: totalUsers    || 0, active: activeUsers || 0 },
      drivers:  { total: totalDrivers  || 0, approved: approvedDrivers || 0, pending: pendingDrivers  || 0 },
      vendors:  { total: totalVendors  || 0, approved: approvedVendors  || 0, pending: pendingVendors  || 0 },
      fleetOwners: { total: totalFleetOwners || 0 },
      // Consolidated pending approvals count — the key number for the admin dashboard badge
      pendingApprovals: {
        drivers:     pendingDrivers  || 0,
        vendors:     pendingVendors  || 0,
        total:       (pendingDrivers || 0) + (pendingVendors || 0),
      },
    };
  }
}
