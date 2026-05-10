import { supabase } from '../config/database';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}


export interface OrderFilters {
  search?: string;    
  status?: string;    
  service?: string;   
  from?: string;      // ISO date string  e.g. "2022-08-01"
  to?: string;        // ISO date string  e.g. "2022-12-31"
  date_preset?: string; // this_week | last_week | this_month | last_month | this_year | last_year
  page?: number;
  limit?: number;
}

export interface UserRegistrationFilters {
  role?: string;        
  date_preset?: string; 
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

interface NormalisedOrder {
  sn: number;
  id: string;
  user_name: string;
  email: string;
  service: string;
  status: string;
  date: string;       // date only: "12 Aug 2022"
}

// Helpers

function normaliseStatus(raw: string): string {
  const map: Record<string, string> = {
    delivered: 'Completed',
    completed: 'Completed',
    cancelled: 'Cancelled',
    pending: 'Pending',
    accepted: 'In Progress',
    preparing: 'In Progress',
    ready: 'In Progress',
    picked_up: 'In Progress',
    shipped: 'In Progress',
    in_progress: 'In Progress',
    confirmed: 'In Progress',
    arrived: 'In Progress',
  };
  return map[raw?.toLowerCase()] ?? raw;
}

/** Format ISO timestamp to "12 Aug 2022" */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}


function resolveDateRange(
  preset?: string,
  from?: string,
  to?: string
): { from?: string; to?: string } {
  if (from || to) {
    // Extend `to` to end of that day so the full day is included
    let resolvedTo = to;
    if (to) {
      const toDate = new Date(to);
      // If only a date was passed (no time component), push to end of day
      if (!isNaN(toDate.getTime())) {
        resolvedTo = new Date(
          toDate.getFullYear(),
          toDate.getMonth(),
          toDate.getDate(),
          23, 59, 59, 999
        ).toISOString();
      }
    }
    return { from, to: resolvedTo };
  }
  if (!preset) return {};

  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();

  switch (preset) {
    case 'this_week': {
      const day = now.getDay(); // 0 = Sun
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((day + 6) % 7));
      return { from: startOfDay(mon), to: endOfDay(now) };
    }
    case 'last_week': {
      const day = now.getDay();
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((day + 6) % 7) - 7);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: startOfDay(mon), to: endOfDay(sun) };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(start), to: endOfDay(end) };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { from: startOfDay(start), to: endOfDay(now) };
    }
    case 'last_year': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31);
      return { from: startOfDay(start), to: endOfDay(end) };
    }
    default:
      return {};
  }
}

const STATUS_MAP_FOOD: Record<string, string[]> = {
  completed: ['delivered', 'completed'],
  cancelled: ['cancelled'],
  pending: ['pending'],
  'in progress': ['accepted', 'preparing', 'ready', 'picked_up'],
};

const STATUS_MAP_MARKETPLACE: Record<string, string[]> = {
  completed: ['delivered', 'completed'],
  cancelled: ['cancelled'],
  pending: ['pending'],
  'in progress': ['accepted', 'shipped', 'arrived'],
};

const STATUS_MAP_RIDE: Record<string, string[]> = {
  completed: ['completed'],
  cancelled: ['cancelled'],
  pending: ['pending'],
  'in progress': ['accepted', 'in_progress', 'confirmed'],
};

const STATUS_MAP_DELIVERY: Record<string, string[]> = {
  completed: ['delivered', 'completed'],
  cancelled: ['cancelled'],
  pending: ['pending'],
  'in progress': ['in_progress', 'picked_up'],
};

function rawStatuses(displayStatus: string, map: Record<string, string[]>): string[] | null {
  return map[displayStatus.toLowerCase()] ?? null;
}

/** Fetch user details (name + email) from the users table */
async function fetchUsers(
  userIds: string[]
): Promise<Map<string, { name: string; email: string }>> {
  const result = new Map<string, { name: string; email: string }>();
  if (!userIds.length) return result;

  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, last_name, email')
    .in('id', userIds);

  if (error) {
    logger.warn('fetchUsers: could not load user details', { error: error.message });
    return result;
  }

  for (const allUsers of data ?? []) {
    const row = allUsers as Record<string, unknown>;
    result.set(row.id as string, {
      name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Unknown',
      email: (row.email as string) ?? '',
    });
  }
  return result;
}

// Per-service order fetchers
type RawOrder = {
  id: string;
  customer_id: string;
  status: string;
  created_at: string;
  service: string;
};

async function getFoodOrders(
  filters: OrderFilters & { from?: string; to?: string }
): Promise<{ orders: RawOrder[]; total: number }> {
  let q = supabase
    .from('food_orders')
    .select('id, customer_id, status, created_at', { count: 'exact' });

  if (filters.status) {
    const raw = rawStatuses(filters.status, STATUS_MAP_FOOD);
    if (!raw) return { orders: [], total: 0 };
    q = q.in('status', raw);
  }
  if (filters.from) q = q.gte('created_at', filters.from);
  if (filters.to) q = q.lte('created_at', filters.to);

  const { data, count, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(`food_orders: ${error.message}`);

  return {
    orders: (data ?? []).map((o) => {
      const row = o as Record<string, unknown>;
      return {
        id: row.id as string,
        customer_id: row.customer_id as string,
        status: row.status as string,
        created_at: row.created_at as string,
        service: 'Olakz Food',
      };
    }),
    total: count ?? 0,
  };
}

async function getMarketplaceOrders(
  filters: OrderFilters & { from?: string; to?: string }
): Promise<{ orders: RawOrder[]; total: number }> {
  let q = supabase
    .from('marketplace_orders')
    .select('id, customer_id, status, created_at', { count: 'exact' });

  if (filters.status) {
    const raw = rawStatuses(filters.status, STATUS_MAP_MARKETPLACE);
    if (!raw) return { orders: [], total: 0 };
    q = q.in('status', raw);
  }
  if (filters.from) q = q.gte('created_at', filters.from);
  if (filters.to) q = q.lte('created_at', filters.to);

  const { data, count, error } = await q.order('created_at', { ascending: false });
  if (error) throw new Error(`marketplace_orders: ${error.message}`);

  return {
    orders: (data ?? []).map((o) => {
      const row = o as Record<string, unknown>;
      return {
        id: row.id as string,
        customer_id: row.customer_id as string,
        status: row.status as string,
        created_at: row.created_at as string,
        service: 'Marketplace',
      };
    }),
    total: count ?? 0,
  };
}

async function getRideOrders(
  filters: OrderFilters & { from?: string; to?: string }
): Promise<{ orders: RawOrder[]; total: number }> {
  let q = supabase
    .from('rides')
    .select('id, passenger_id, status, created_at', { count: 'exact' });

  if (filters.status) {
    const raw = rawStatuses(filters.status, STATUS_MAP_RIDE);
    if (!raw) return { orders: [], total: 0 };
    q = q.in('status', raw);
  }
  if (filters.from) q = q.gte('created_at', filters.from);
  if (filters.to) q = q.lte('created_at', filters.to);

  const { data, count, error } = await q.order('created_at', { ascending: false });
  if (error) {
    logger.warn('getRideOrders: rides table unavailable', { error: error.message });
    return { orders: [], total: 0 };
  }

  return {
    orders: (data ?? []).map((o) => {
      const row = o as Record<string, unknown>;
      return {
        id: row.id as string,
        customer_id: (row.passenger_id ?? row.customer_id) as string,
        status: row.status as string,
        created_at: row.created_at as string,
        service: 'Olakz Ride',
      };
    }),
    total: count ?? 0,
  };
}

async function getDeliveryOrders(
  filters: OrderFilters & { from?: string; to?: string }
): Promise<{ orders: RawOrder[]; total: number }> {
  let q = supabase
    .from('deliveries')
    .select('id, sender_id, status, created_at', { count: 'exact' });

  if (filters.status) {
    const raw = rawStatuses(filters.status, STATUS_MAP_DELIVERY);
    if (!raw) return { orders: [], total: 0 };
    q = q.in('status', raw);
  }
  if (filters.from) q = q.gte('created_at', filters.from);
  if (filters.to) q = q.lte('created_at', filters.to);

  const { data, count, error } = await q.order('created_at', { ascending: false });
  if (error) {
    logger.warn('getDeliveryOrders: deliveries table unavailable', { error: error.message });
    return { orders: [], total: 0 };
  }

  return {
    orders: (data ?? []).map((o) => {
      const row = o as Record<string, unknown>;
      return {
        id: row.id as string,
        customer_id: (row.sender_id ?? row.customer_id) as string,
        status: row.status as string,
        created_at: row.created_at as string,
        service: 'Olakz Delivery',
      };
    }),
    total: count ?? 0,
  };
}

// Core merge + paginate helper

async function mergeAndPaginate(
  fetchers: Promise<{ orders: RawOrder[]; total: number }>[],
  search: string | undefined,
  page: number,
  limit: number
) {
  const results = await Promise.allSettled(fetchers);

  let allOrders: RawOrder[] = [];
  for (const allOrdersResult of results) {
    if (allOrdersResult.status === 'fulfilled') {
      allOrders = allOrders.concat(allOrdersResult.value.orders);
    } else {
      logger.warn('OrdersAdminService: a service fetch failed', { reason: toMessage(allOrdersResult.reason) });
    }
  }

  // Sort merged list newest first
  allOrders.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Enrich with user details
  const customerIds = [...new Set(allOrders.map((o) => o.customer_id).filter(Boolean))];
  const userMap = await fetchUsers(customerIds);

  type Enriched = RawOrder & { user_name: string; email: string };

  let enriched: Enriched[] = allOrders.map((o) => {
    const user = userMap.get(o.customer_id) ?? { name: 'Unknown', email: '' };
    return { ...o, user_name: user.name, email: user.email };
  });

  // Apply search (name or email)
  if (search) {
    const q = search.toLowerCase();
    enriched = enriched.filter(
      (o) => o.user_name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q)
    );
  }

  const total = enriched.length;
  const offset = (page - 1) * limit;
  const paginated = enriched.slice(offset, offset + limit);

  const orders: NormalisedOrder[] = paginated.map((o, idx) => ({
    sn: offset + idx + 1,
    id: o.id,
    user_name: o.user_name,
    email: o.email,
    service: o.service,
    status: normaliseStatus(o.status),
    date: formatDate(o.created_at),
  }));

  return {
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

// Main service

export class OrdersAdminService {
  /**
   * GET /api/admin/orders
   */
  static async getAllOrders(filters: OrderFilters) {
    const { search, page = 1, limit = 20 } = filters;
    const { from, to } = resolveDateRange(filters.date_preset, filters.from, filters.to);

    // Treat "all" the same as omitted — no filter applied
    const serviceKey =
      !filters.service || filters.service.toLowerCase() === 'all'
        ? null
        : filters.service.toLowerCase().replace(/[\s-]+/g, '_');

    const statusKey =
      !filters.status || filters.status.toLowerCase() === 'all'
        ? null
        : filters.status;

    const resolved = { ...filters, from, to, status: statusKey ?? undefined };

    const fetchers: Promise<{ orders: RawOrder[]; total: number }>[] = [];
    if (!serviceKey || serviceKey === 'olakz_food') fetchers.push(getFoodOrders(resolved));
    if (!serviceKey || serviceKey === 'marketplace') fetchers.push(getMarketplaceOrders(resolved));
    if (!serviceKey || serviceKey === 'olakz_ride') fetchers.push(getRideOrders(resolved));
    if (!serviceKey || serviceKey === 'olakz_delivery') fetchers.push(getDeliveryOrders(resolved));

    return mergeAndPaginate(fetchers, search, page, limit);
  }

  /**
   * GET /api/admin/orders/filter/by-status
   *
   * status: all | Completed | In Progress | Pending | Cancelled
   * "all" returns orders of every status.
   */
  static async filterByStatus(filters: {
    status: string;
    service?: string;
    page?: number;
    limit?: number;
  }) {
    return OrdersAdminService.getAllOrders(filters);
  }

  /**
   * GET /api/admin/orders/filter/by-service
   *
   * service: all | olakz_ride | olakz_food | marketplace | olakz_delivery | airtime_data
   * "all" returns orders from every service.
   */
  static async filterByService(filters: {
    service: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    return OrdersAdminService.getAllOrders(filters);
  }

  /**
   * GET /api/admin/orders/filter/by-date
   * Filter orders by date preset or explicit date range.
   */
  static async filterByDate(filters: {
    date_preset?: string;
    from?: string;
    to?: string;
    service?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    return OrdersAdminService.getAllOrders(filters);
  }

  /**
   * GET /api/admin/orders/filter/newly-registered
   * Filter users/drivers/vendors by registration date.
   */
  static async filterNewlyRegistered(filters: UserRegistrationFilters) {
    const { role, page = 1, limit = 20 } = filters;
    const { from, to } = resolveDateRange(filters.date_preset, filters.from, filters.to);
    const offset = (page - 1) * limit;

    // Normalise role — accept both singular and plural, case-insensitive
    const roleAliasMap: Record<string, string> = {
      user: 'user',
      users: 'user',
      customer: 'user',
      customers: 'user',
      driver: 'driver',
      drivers: 'driver',
      vendor: 'vendor',
      vendors: 'vendor',
      fleet_owner: 'fleet_owner',
      fleet_owners: 'fleet_owner',
    };

    const normalisedRole =
      role && role.toLowerCase() !== 'all'
        ? roleAliasMap[role.toLowerCase()] ?? null
        : null;

    // ── Vendor: query the dedicated vendors table ─────────────────────────────
    if (normalisedRole === 'vendor') {
      let q = supabase
        .from('vendors')
        .select('id, user_id, business_name, email, verification_status, is_active, created_at', {
          count: 'exact',
        })
        .order('created_at', { ascending: false });

      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);

      const { data, count, error } = await q.range(offset, offset + limit - 1);
      if (error) throw new Error(`Failed to fetch vendors: ${error.message}`);

      // Fetch user names for each vendor's user_id
      const userIds = (data ?? []).map((v) => (v as Record<string, unknown>).user_id as string);
      const userMap = await fetchUsers(userIds);

      const users = (data ?? []).map((v, idx) => {
        const row = v as Record<string, unknown>;
        const user = userMap.get(row.user_id as string);
        return {
          sn: offset + idx + 1,
          id: row.id as string,
          user_id: row.user_id as string,
          name: user?.name ?? (row.business_name as string),
          email: user?.email ?? (row.email as string),
          roles: ['vendor'],
          active_role: 'vendor',
          status: (row.is_active ? 'active' : 'inactive') as string,
          verification_status: row.verification_status as string,
          business_name: row.business_name as string,
          registered_date: formatDate(row.created_at as string),
        };
      });

      return {
        users,
        pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
      };
    }

    // ── All other roles: query the users table ────────────────────────────────
    let q = supabase
      .from('users')
      .select('id, first_name, last_name, email, roles, active_role, status, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false });

    if (normalisedRole === 'driver') {
      // drivers have 'driver' in their roles array
      q = q.contains('roles', ['driver']);
    } else if (normalisedRole === 'fleet_owner') {
      q = q.contains('roles', ['fleet_owner']);
    } else if (normalisedRole === 'user') {
      // regular users/customers — has customer role but NOT driver or fleet_owner
      q = q.contains('roles', ['customer'])
           .not('roles', 'cs', '{"driver"}')
           .not('roles', 'cs', '{"fleet_owner"}');
    }
    // null = all roles, no filter applied

    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, count, error } = await q.range(offset, offset + limit - 1);
    if (error) throw new Error(`Failed to fetch registered users: ${error.message}`);

    const users = (data ?? []).map((u, idx) => {
      const row = u as Record<string, unknown>;
      return {
        sn: offset + idx + 1,
        id: row.id as string,
        name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Unknown',
        email: row.email as string,
        roles: row.roles as string[],
        active_role: row.active_role as string,
        status: row.status as string,
        registered_date: formatDate(row.created_at as string),
      };
    });

    return {
      users,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    };
  }

  /**
   * GET /api/admin/orders/summary
   * Order counts grouped by status across all services.
   */
  static async getOrderStatusSummary() {
    const [food, marketplace, ride, delivery] = await Promise.allSettled([
      supabase.from('food_orders').select('status'),
      supabase.from('marketplace_orders').select('status'),
      supabase.from('rides').select('status'),
      supabase.from('deliveries').select('status'),
    ]);

    const allStatuses: string[] = [];
    for (const result of [food, marketplace, ride, delivery]) {
      if (result.status === 'fulfilled' && result.value.data) {
        for (const row of result.value.data) {
          allStatuses.push(normaliseStatus((row as Record<string, unknown>).status as string));
        }
      }
    }

    const summary: Record<string, number> = {};
    for (const s of allStatuses) {
      summary[s] = (summary[s] ?? 0) + 1;
    }

    return { total: allStatuses.length, by_status: summary };
  }

}
