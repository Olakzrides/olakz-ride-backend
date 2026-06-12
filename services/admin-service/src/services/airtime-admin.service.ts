import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export interface AirtimeFilters {
  status?: string;        // all | pending | completed | failed | airtime | data
  type?: string;          // airtime | data (transaction_type)
  search?: string;        // user name, phone number, network
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

function formatStatus(status: string): string {
  const map: Record<string, string> = {
    pending:    'Pending',
    processing: 'Pending',
    successful: 'Completed',
    failed:     'Failed',
    reversed:   'Failed',
  };
  return map[status] ?? status;
}

function formatNetwork(network: string): string {
  const map: Record<string, string> = {
    mtn:    'MTN',
    glo:    'GLO',
    airtel: 'Airtel',
    '9mobile': '9Mobile',
  };
  return map[network.toLowerCase()] ?? network.toUpperCase();
}

export class AirtimeAdminService {

  /**
   * Status counts for the tab bar.
   * Tabs: All Orders, Pending, Failed, Completed, Airtime (type), Data (type)
   */
  static async getStatusCounts(filters: { from?: string; to?: string } = {}) {
    let query = supabase
      .from('bill_transactions')
      .select('status, transaction_type');

    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) {
      const toEnd = new Date(filters.to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      logger.error('airtime getStatusCounts error', { error: error.message });
      return { all: 0, pending: 0, completed: 0, failed: 0, airtime: 0, data: 0 };
    }

    const rows = data ?? [];
    const counts = { all: rows.length, pending: 0, completed: 0, failed: 0, airtime: 0, data: 0 };

    for (const row of rows) {
      const label = formatStatus(row.status).toLowerCase();
      if (label === 'pending')   counts.pending++;
      else if (label === 'completed') counts.completed++;
      else if (label === 'failed')    counts.failed++;

      if (row.transaction_type === 'airtime') counts.airtime++;
      else if (row.transaction_type === 'data') counts.data++;
    }

    return counts;
  }

  /**
   * Paginated airtime & data transactions.
   */
  static async getTransactions(filters: AirtimeFilters) {
    const { status, type, search, from, to, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('bill_transactions')
      .select(
        `id, user_id, transaction_type, network, phone_number, amount, currency_code,
         bundle_name, bundle_validity, payment_method, payment_status,
         status, created_at, completed_at, failed_at`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Status filter — tab clicks
    if (status && status !== 'all') {
      const statusMap: Record<string, string[]> = {
        pending:   ['pending', 'processing'],
        completed: ['successful'],
        failed:    ['failed', 'reversed'],
      };
      const dbStatuses = statusMap[status.toLowerCase()];
      if (dbStatuses?.length) {
        query = query.in('status', dbStatuses);
      }
    }

    // Type filter (airtime or data tab)
    if (type && type !== 'all') {
      query = query.eq('transaction_type', type.toLowerCase());
    }
    // Also support status=airtime or status=data as combined tab
    if (status === 'airtime' || status === 'data') {
      query = query.eq('transaction_type', status.toLowerCase());
    }

    // Date range
    if (from) query = query.gte('created_at', from);
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    // Search by phone or network
    if (search) {
      query = query.or(
        `phone_number.ilike.%${search}%,network.ilike.%${search}%`
      );
    }

    const { data: txns, count, error } = await query;

    if (error) {
      logger.error('getAirtimeTransactions error', { error: error.message });
      throw new Error(`Failed to fetch airtime/data transactions: ${error.message}`);
    }

    const rows = txns ?? [];

    // Enrich with user names
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const userMap = new Map<string, { first_name: string; last_name: string; email: string }>();
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', userIds);
      for (const u of users ?? []) userMap.set(u.id, u);
    }

    const formatted = rows.map((tx, idx) => {
      const user = userMap.get(tx.user_id);
      return {
        sn: offset + idx + 1,
        id: tx.id,
        user: user
          ? { id: tx.user_id, name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(), email: user.email }
          : { id: tx.user_id, name: 'Unknown', email: null },
        network:     formatNetwork(tx.network),
        rawNetwork:  tx.network,
        type:        tx.transaction_type === 'airtime' ? 'Airtime' : 'Data',
        phoneNumber: tx.phone_number,
        bundle:      tx.bundle_name ?? null,
        bundleValidity: tx.bundle_validity ?? null,
        amount: {
          value:         parseFloat(tx.amount),
          currencyCode:  tx.currency_code,
          paymentMethod: tx.payment_method,
          display:       `₦${parseFloat(tx.amount).toLocaleString('en-NG')} · ${tx.payment_method}`,
        },
        status:    formatStatus(tx.status),
        rawStatus: tx.status,
        createdAt:   tx.created_at,
        completedAt: tx.completed_at ?? null,
        failedAt:    tx.failed_at ?? null,
      };
    });

    return {
      transactions: formatted,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Single transaction detail — the "More" button.
   */
  static async getTransactionById(transactionId: string) {
    const { data: tx, error } = await supabase
      .from('bill_transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (error || !tx) return null;

    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone')
      .eq('id', tx.user_id)
      .single();

    return {
      id:          tx.id,
      user: user
        ? { id: user.id, name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(), email: user.email, phone: user.phone }
        : { id: tx.user_id, name: 'Unknown', email: null, phone: null },
      network:     formatNetwork(tx.network),
      rawNetwork:  tx.network,
      type:        tx.transaction_type === 'airtime' ? 'Airtime' : 'Data',
      phoneNumber: tx.phone_number,
      bundle: tx.bundle_name ? {
        name:     tx.bundle_name,
        code:     tx.bundle_code ?? null,
        validity: tx.bundle_validity ?? null,
      } : null,
      amount: {
        value:               parseFloat(tx.amount),
        currencyCode:        tx.currency_code,
        paymentMethod:       tx.payment_method,
        paymentStatus:       tx.payment_status,
        walletBalanceBefore: tx.wallet_balance_before ? parseFloat(tx.wallet_balance_before) : null,
        walletBalanceAfter:  tx.wallet_balance_after  ? parseFloat(tx.wallet_balance_after)  : null,
      },
      flutterwave: {
        reference: tx.flw_reference ?? null,
        txRef:     tx.flw_tx_ref ?? null,
        billerCode: tx.flw_biller_code ?? null,
        itemCode:   tx.flw_item_code ?? null,
      },
      status:       formatStatus(tx.status),
      rawStatus:    tx.status,
      errorMessage: tx.error_message ?? null,
      retryCount:   tx.retry_count ?? 0,
      createdAt:    tx.created_at,
      completedAt:  tx.completed_at ?? null,
      failedAt:     tx.failed_at ?? null,
    };
  }
}
