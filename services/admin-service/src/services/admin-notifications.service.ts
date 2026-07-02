import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export type NotificationType =
  | 'new_user'
  | 'new_driver'
  | 'new_vendor'
  | 'password_reset'
  | 'wallet_topup'
  | 'wallet_withdrawal'
  | 'new_ride'
  | 'new_food_order'
  | 'new_marketplace_order'
  | 'new_delivery'
  | 'new_transport_hire'
  | 'airtime_data_purchase'
  | 'driver_application';

export interface AdminNotification {
  id: string;
  type: NotificationType;
  message: string;
  actor_name: string;
  actor_id: string;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  transaction_type?: string | null;
  created_at: string;
  time_ago: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function fullName(row: Record<string, unknown>): string {
  return (
    `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() ||
    (row.first_name as string | undefined)?.trim() ||
    (row.email ? (row.email as string).split('@')[0] : null) ||
    'Customer'
  );
}

async function getUserMap(userIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (!userIds.length) return map;
  const { data } = await supabase
    .from('users')
    .select('id, first_name, last_name, email')
    .in('id', userIds);
  for (const u of data ?? []) {
    const r = u as Record<string, unknown>;
    map.set(r.id as string, r);
  }
  return map;
}

// ─── Per-event fetchers ───────────────────────────────────────────────────────

async function fetchNewUsers(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, last_name, email, created_at, roles')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchNewUsers', { error: error.message }); return []; }

  return (data ?? [])
    .filter((u) => {
      const roles = ((u as Record<string, unknown>).roles as string[]) ?? [];
      return roles.includes('customer') && !roles.includes('driver') && !roles.includes('vendor');
    })
    .map((u) => {
      const r = u as Record<string, unknown>;
      return {
        id: `user_${r.id}`,
        type: 'new_user' as NotificationType,
        message: `${fullName(r)} just registered as a user`,
        actor_name: fullName(r),
        actor_id: r.id as string,
        created_at: r.created_at as string,
        time_ago: timeAgo(r.created_at as string),
      };
    });
}

async function fetchNewDrivers(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('drivers')
    .select('id, user_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchNewDrivers', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(data.map((d) => (d as Record<string, unknown>).user_id as string));

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const user = userMap.get(r.user_id as string) ?? {} as Record<string, unknown>;
    const name = fullName(user) || 'Unknown Driver';
    return {
      id: `driver_${r.id}`,
      type: 'new_driver' as NotificationType,
      message: `${name} submitted a driver application`,
      actor_name: name,
      actor_id: r.user_id as string,
      status: r.status as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

async function fetchNewVendors(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select('id, user_id, business_name, verification_status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchNewVendors', { error: error.message }); return []; }

  return (data ?? []).map((v) => {
    const r = v as Record<string, unknown>;
    return {
      id: `vendor_${r.id}`,
      type: 'new_vendor' as NotificationType,
      message: `${r.business_name} registered as a vendor`,
      actor_name: r.business_name as string,
      actor_id: r.user_id as string,
      status: r.verification_status as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

async function fetchPasswordResets(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('otp_verifications')
    .select('id, user_id, created_at')
    .eq('type', 'password_reset')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchPasswordResets', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(data.map((d) => (d as Record<string, unknown>).user_id as string));

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const user = userMap.get(r.user_id as string) ?? {} as Record<string, unknown>;
    const name = fullName(user) || 'Unknown User';
    return {
      id: `otp_${r.id}`,
      type: 'password_reset' as NotificationType,
      message: `${name} requested a password reset`,
      actor_name: name,
      actor_id: r.user_id as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

async function fetchWalletTransactions(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, user_id, transaction_type, amount, currency_code, status, created_at')
    .in('transaction_type', ['topup', 'credit', 'debit', 'withdrawal'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchWalletTransactions', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(data.map((d) => (d as Record<string, unknown>).user_id as string));

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const user = userMap.get(r.user_id as string) ?? {} as Record<string, unknown>;
    const name = fullName(user) || 'Unknown User';
    const txType = r.transaction_type as string;
    const isTopup = txType === 'topup' || txType === 'credit';
    const type: NotificationType = isTopup ? 'wallet_topup' : 'wallet_withdrawal';
    const amount = Number(r.amount ?? 0);
    const currency = (r.currency_code as string) ?? 'NGN';

    return {
      id: `wallet_${r.id}`,
      type,
      message: `${name} ${isTopup ? 'topped up' : 'withdrew'} ${currency} ${amount.toLocaleString()} from wallet`,
      actor_name: name,
      actor_id: r.user_id as string,
      amount,
      currency,
      status: r.status as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

async function fetchRides(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('rides')
    .select('id, user_id, status, estimated_fare, currency_code, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchRides', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(data.map((d) => (d as Record<string, unknown>).user_id as string));

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const user = userMap.get(r.user_id as string) ?? {} as Record<string, unknown>;

    // Fallback chain: full name → first name → email prefix → 'Customer'
    const name =
      `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() ||
      (user.first_name as string | undefined)?.trim() ||
      (user.email ? (user.email as string).split('@')[0] : null) ||
      'Customer';

    return {
      id: `ride_${r.id}`,
      type: 'new_ride' as NotificationType,
      message: `${name} booked a ride`,
      actor_name: name,
      actor_id: r.user_id as string,
      amount: r.estimated_fare ? Number(r.estimated_fare) : null,
      currency: (r.currency_code as string) ?? 'NGN',
      status: r.status as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

async function fetchFoodOrders(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('food_orders')
    .select('id, customer_id, status, total_amount, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchFoodOrders', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(data.map((d) => (d as Record<string, unknown>).customer_id as string));

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const user = userMap.get(r.customer_id as string) ?? {} as Record<string, unknown>;
    const name = fullName(user) || 'Unknown User';
    return {
      id: `food_${r.id}`,
      actor_id: r.customer_id as string,
      type: 'new_food_order' as NotificationType,
      message: `${name} placed a food order`,
      actor_name: name,
      amount: r.total_amount ? Number(r.total_amount) : null,
      currency: 'NGN',
      status: r.status as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

async function fetchMarketplaceOrders(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('marketplace_orders')
    .select('id, customer_id, status, total_amount, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchMarketplaceOrders', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(data.map((d) => (d as Record<string, unknown>).customer_id as string));

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const user = userMap.get(r.customer_id as string) ?? {} as Record<string, unknown>;
    const name = fullName(user) || 'Unknown User';
    return {
      id: `marketplace_${r.id}`,
      type: 'new_marketplace_order' as NotificationType,
      message: `${name} placed a marketplace order`,
      actor_name: name,
      actor_id: r.customer_id as string,
      amount: r.total_amount ? Number(r.total_amount) : null,
      currency: 'NGN',
      status: r.status as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

async function fetchDeliveries(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('id, customer_id, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchDeliveries', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(
    data.map((d) => (d as Record<string, unknown>).customer_id as string).filter(Boolean)
  );

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const userId = r.customer_id as string;
    const user = userMap.get(userId) ?? {} as Record<string, unknown>;
    const name = fullName(user) || 'Unknown User';
    return {
      id: `delivery_${r.id}`,
      type: 'new_delivery' as NotificationType,
      message: `${name} placed a delivery request`,
      actor_name: name,
      actor_id: userId,
      status: r.status as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

async function fetchAirtimeData(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('bill_transactions')
    .select('id, user_id, transaction_type, amount, payment_status, network, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchAirtimeData', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(data.map((d) => (d as Record<string, unknown>).user_id as string));

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const user = userMap.get(r.user_id as string) ?? {} as Record<string, unknown>;
    const name = fullName(user) || 'Unknown User';

    // Use transaction_type directly from DB: 'airtime' | 'data'
    const txType = (r.transaction_type as string) ?? 'airtime';
    const txLabel = txType === 'data' ? 'Data Bundle' : 'Airtime';
    const network = (r.network as string) ?? '';
    const networkLabel = network ? ` (${network.toUpperCase()})` : '';

    return {
      id: `bill_${r.id}`,
      type: 'airtime_data_purchase' as NotificationType,
      message: `${name} purchased ${txLabel.toLowerCase()}${networkLabel}`,
      transaction_type: txType,
      actor_name: name,
      actor_id: r.user_id as string,
      amount: r.amount ? Number(r.amount) : null,
      currency: 'NGN',
      status: (r.payment_status as string) ?? null,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

// ─── All fetchers registry ────────────────────────────────────────────────────

async function fetchTransportHires(limit: number): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('transport_hires')
    .select('id, hire_number, customer_id, vehicle_category, vehicle_sub_type, amount, currency_code, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) { logger.warn('fetchTransportHires', { error: error.message }); return []; }
  if (!data?.length) return [];

  const userMap = await getUserMap(data.map((d) => (d as Record<string, unknown>).customer_id as string));

  return data.map((d) => {
    const r = d as Record<string, unknown>;
    const user = userMap.get(r.customer_id as string) ?? {} as Record<string, unknown>;
    const name = fullName(user) || 'Customer';
    const vehicle = `${String(r.vehicle_category ?? '').replace('_', ' ')} (${String(r.vehicle_sub_type ?? '').replace('_', ' ')})`;
    return {
      id: `hire_${r.id}`,
      type: 'new_transport_hire' as NotificationType,
      message: `${name} booked a transport hire — ${vehicle}`,
      actor_name: name,
      actor_id: r.customer_id as string,
      amount: r.amount ? Number(r.amount) : null,
      currency: (r.currency_code as string) ?? 'NGN',
      status: r.status as string,
      created_at: r.created_at as string,
      time_ago: timeAgo(r.created_at as string),
    };
  });
}

const ALL_FETCHERS: Record<NotificationType, (limit: number) => Promise<AdminNotification[]>> = {
  new_user: fetchNewUsers,
  new_driver: fetchNewDrivers,
  driver_application: fetchNewDrivers,
  new_vendor: fetchNewVendors,
  password_reset: fetchPasswordResets,
  wallet_topup: (l) => fetchWalletTransactions(l).then((r) => r.filter((n) => n.type === 'wallet_topup')),
  wallet_withdrawal: (l) => fetchWalletTransactions(l).then((r) => r.filter((n) => n.type === 'wallet_withdrawal')),
  new_ride: fetchRides,
  new_food_order: fetchFoodOrders,
  new_marketplace_order: fetchMarketplaceOrders,
  new_delivery: fetchDeliveries,
  new_transport_hire: fetchTransportHires,
  airtime_data_purchase: fetchAirtimeData,
};

// ─── Main service ─────────────────────────────────────────────────────────────

export class AdminNotificationsService {
  /**
   * GET /api/admin/notifications/preview
   * Latest 5–10 notifications for the dashboard bell icon.
   * Queries all 9 sources and returns the most recent N.
   */
  static async getPreview(limit = 10): Promise<AdminNotification[]> {
    const perSource = 5; // fetch 5 from each source, trim after merge

    const results = await Promise.allSettled([
      fetchNewUsers(perSource),
      fetchNewDrivers(perSource),
      fetchNewVendors(perSource),
      fetchPasswordResets(perSource),
      fetchWalletTransactions(perSource),
      fetchRides(perSource),
      fetchFoodOrders(perSource),
      fetchMarketplaceOrders(perSource),
      fetchDeliveries(perSource),
      fetchTransportHires(perSource),
      fetchAirtimeData(perSource),
    ]);

    let all: AdminNotification[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') all = all.concat(r.value);
    }

    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return all.slice(0, limit);
  }

  /**
   * GET /api/admin/notifications
   * All notifications paginated (max 20 per page).
   * Supports filtering by type.
   *
   * type values: new_user | new_driver | new_vendor | password_reset |
   *              wallet_topup | wallet_withdrawal | new_ride |
   *              new_food_order | new_marketplace_order | new_delivery |
   *              airtime_data_purchase | all
   */
  static async getAll(filters: {
    type?: string;
    page?: number;
    limit?: number;
  }): Promise<{ notifications: AdminNotification[]; pagination: object }> {
    const { type, page = 1, limit = 20 } = filters;
    const fetchSize = 50; // per source

    let all: AdminNotification[] = [];

    if (type && type.toLowerCase() !== 'all' && ALL_FETCHERS[type as NotificationType]) {
      // Fetch only the requested type
      all = await ALL_FETCHERS[type as NotificationType](fetchSize * 2);
    } else {
      // Fetch all sources in parallel
      const results = await Promise.allSettled([
        fetchNewUsers(fetchSize),
        fetchNewDrivers(fetchSize),
        fetchNewVendors(fetchSize),
        fetchPasswordResets(fetchSize),
        fetchWalletTransactions(fetchSize),
        fetchRides(fetchSize),
        fetchFoodOrders(fetchSize),
        fetchMarketplaceOrders(fetchSize),
        fetchDeliveries(fetchSize),
        fetchTransportHires(fetchSize),
        fetchAirtimeData(fetchSize),
      ]);

      for (const r of results) {
        if (r.status === 'fulfilled') all = all.concat(r.value);
      }
    }

    // Sort newest first
    all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = all.length;
    const offset = (page - 1) * limit;
    const paginated = all.slice(offset, offset + limit);

    return {
      notifications: paginated,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }
}
