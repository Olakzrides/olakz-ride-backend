import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export interface PaymentTransactionFilters {
  status?: string;          // completed | pending | hold | refunded | failed
  paymentMethod?: string;   // wallet | cash | card | topup | earning | withdrawal
  from?: string;            // ISO date string
  to?: string;              // ISO date string
  search?: string;          // search by reference, amount, or user name
  page?: number;
  limit?: number;
}

// Map transaction_type + metadata + description to a human-readable payment method label
function resolvePaymentMethod(transactionType: string, metadata?: Record<string, unknown>, description?: string | null): string {
  // Description is the most reliable signal
  if (description) {
    const d = description.toLowerCase();
    if (d.includes('bank transfer')) return 'Bank Transfer';
    if (d.includes('via card') || d.includes('card payment')) return 'Card';
  }

  // Fall back to metadata signals
  if (metadata) {
    const fundingType = metadata.funding_type as string | undefined;
    const paymentMethod = metadata.payment_method as string | undefined;

    if (
      fundingType === 'card_payment' ||
      paymentMethod?.includes('card') ||
      metadata.card_last4
    ) {
      return 'Card';
    }

    if (
      fundingType === 'bank_transfer' ||
      paymentMethod === 'bank_transfer'
    ) {
      return 'Bank Transfer';
    }
  }

  const map: Record<string, string> = {
    credit:       'Wallet Top-up',
    topup:        'Wallet Top-up',
    debit:        'Wallet Debit',
    hold:         'Payment Hold',
    earning:      'Driver Earning',
    withdrawal:   'Withdrawal',
    refund:       'Refund',
    tip_received: 'Tip Received',
    tip_payment:  'Tip Payment',
    payment:      'Payment',
  };
  return map[transactionType] ?? transactionType;
}

// Map status to dashboard-friendly label
// transaction_type + status combination determines the correct display
function resolveStatus(status: string, transactionType?: string): string {
  // Hold transaction_type: use actual status to determine display
  // hold+hold = pending/reserved, hold+completed = succeeded, hold+refunded = refunded
  if (transactionType === 'hold') {
    if (status === 'hold' || status === 'pending') return 'Hold';
    // completed or any other status falls through to normal map below
  }

  const map: Record<string, string> = {
    completed: 'Succeeded',
    pending:   'Pending',
    hold:      'Hold',
    refunded:  'Refunded',
    failed:    'Failed',
  };
  return map[status] ?? status;
}

export class PaymentAdminService {

  /**
   * Get paginated payment transactions with filters.
   * Aggregates from wallet_transactions table.
   * Enriches each row with user name.
   */
  static async getTransactions(filters: PaymentTransactionFilters) {
    const {
      status,
      paymentMethod,
      from,
      to,
      search,
      page = 1,
      limit = 20,
    } = filters;

    const offset = (page - 1) * limit;

    let query = supabase
      .from('wallet_transactions')
      .select(
        'id, user_id, ride_id, transaction_type, amount, currency_code, status, reference, description, metadata, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Status filter — map dashboard label back to DB value
    if (status && status !== 'all') {
      const statusMap: Record<string, string[]> = {
        succeeded: ['completed'],
        pending:   ['pending', 'hold'],   // pending includes payment holds
        hold:      ['hold'],
        refunded:  [],                    // handled separately below — uses transaction_type=refund
        failed:    ['failed'],
      };
      const dbStatuses = statusMap[status.toLowerCase()];
      if (dbStatuses && dbStatuses.length > 0) {
        if (dbStatuses.length === 1) {
          query = query.eq('status', dbStatuses[0]);
        } else {
          query = query.in('status', dbStatuses);
        }
      } else if (status.toLowerCase() === 'refunded' || status.toLowerCase() === 'refund') {
        // Refunds: transaction_type='refund' (stored with status='completed')
        // OR status='refunded' (legacy)
        query = query.or("transaction_type.eq.refund,status.eq.refunded");
      } else {
        query = query.eq('status', status.toLowerCase());
      }
    }

    // Payment method filter
    // Card and bank_transfer are distinguished by metadata, not transaction_type
    if (paymentMethod && paymentMethod !== 'all') {
      const pm = paymentMethod.toLowerCase();

      if (pm === 'card' || pm === 'card_payment') {
        // Card payments: description contains 'via card' OR metadata has card_last4
        query = query.or('description.ilike.%via card%,metadata->>card_last4.not.is.null');
      } else if (pm === 'bank_transfer' || pm === 'bank') {
        // Bank transfer: description contains 'bank transfer'
        query = query.ilike('description', '%bank transfer%');
      } else if (pm === 'wallet') {
        // Pure wallet ops: no flw_ref in metadata
        query = query
          .in('transaction_type', ['debit', 'hold', 'earning', 'withdrawal', 'refund', 'tip_received', 'tip_payment'])
          .is('metadata->flw_ref', null);
      } else if (pm === 'earning') {
        query = query.eq('transaction_type', 'earning');
      } else if (pm === 'withdrawal') {
        query = query.eq('transaction_type', 'withdrawal');
      } else if (pm === 'refund') {
        query = query.eq('transaction_type', 'refund');
      } else {
        // Fallback: filter by transaction_type directly
        query = query.eq('transaction_type', pm);
      }
    }

    // Date range filter
    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    // Reference search
    if (search) {
      query = query.ilike('reference', `%${search}%`);
    }

    const { data: transactions, count, error } = await query;

    if (error) {
      logger.error('getTransactions error', { error: error.message });
      throw new Error(`Failed to fetch payment transactions: ${error.message}`);
    }

    // Parallel: fetch platform total — sum of ALL transactions regardless of status or type
    // Uses aggregate to avoid row limits and fetch efficiently
    const { data: totalData } = await supabase
      .rpc('sum_all_wallet_transactions');

    // Fallback: if RPC not available, fetch all amounts (works for < 1000 rows)
    let platformTotalAmount = 0;
    if (totalData !== null && totalData !== undefined) {
      platformTotalAmount = parseFloat(totalData) || 0;
    } else {
      const { data: allRows } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .limit(10000);
      platformTotalAmount = (allRows ?? []).reduce(
        (sum, row) => sum + parseFloat(row.amount),
        0
      );
    }

    const rows = transactions ?? [];

    // Collect all user IDs for enrichment
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const userMap = new Map<string, { first_name: string; last_name: string; email: string }>();

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', userIds);

      for (const u of users ?? []) {
        userMap.set(u.id, u);
      }
    }

    // Collect (user_id, card_last4) pairs that need brand lookup from payment_cards
    const cardLookups: Array<{ txId: string; userId: string; last4: string }> = [];
    for (const tx of rows) {
      const meta = (tx.metadata ?? {}) as Record<string, unknown>;
      if (meta.card_last4 && !meta.card_brand) {
        cardLookups.push({ txId: tx.id, userId: tx.user_id, last4: meta.card_last4 as string });
      }
    }

    // Batch lookup card brands from payment_cards
    const cardBrandMap = new Map<string, { brand: string; bankName: string | null }>();
    if (cardLookups.length > 0) {
      const uniqueUserIds = [...new Set(cardLookups.map(c => c.userId))];
      const { data: savedCards } = await supabase
        .from('payment_cards')
        .select('user_id, card_last4, card_brand, bank_name')
        .in('user_id', uniqueUserIds)
        .eq('is_active', true);

      for (const card of savedCards ?? []) {
        // key: userId_last4
        cardBrandMap.set(`${card.user_id}_${card.card_last4}`, {
          brand:    card.card_brand ?? null,
          bankName: card.bank_name ?? null,
        });
      }
    }

    const formatted = rows.map(tx => {
      const user = userMap.get(tx.user_id);
      const meta = (tx.metadata ?? {}) as Record<string, unknown>;

      // Build card info — use metadata first, fallback to payment_cards lookup
      let cardInfo: { last4: string; brand: string | null; bankName: string | null } | null = null;
      if (meta.card_last4) {
        const fromMeta = {
          last4:    meta.card_last4 as string,
          brand:    (meta.card_brand as string) ?? null,
          bankName: (meta.bank_name as string) ?? null,
        };
        const fromLookup = cardBrandMap.get(`${tx.user_id}_${fromMeta.last4}`);
        cardInfo = {
          last4:    fromMeta.last4,
          brand:    fromMeta.brand ?? fromLookup?.brand ?? null,
          bankName: fromMeta.bankName ?? fromLookup?.bankName ?? null,
        };
      }

      return {
        id: tx.id,
        reference: tx.reference ?? null,
        status: resolveStatus(tx.status, tx.transaction_type),
        rawStatus: tx.status,
        amount: parseFloat(tx.amount),
        currencyCode: tx.currency_code,
        paymentMethod: resolvePaymentMethod(tx.transaction_type, meta, tx.description),
        transactionType: tx.transaction_type,
        description: tx.description ?? null,
        rideId: tx.ride_id ?? null,
        card: cardInfo,
        user: user
          ? {
              id: tx.user_id,
              name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unknown',
              email: user.email,
            }
          : { id: tx.user_id, name: 'Unknown', email: null },
        createdAt: tx.created_at,
        metadata: tx.metadata ?? {},
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
      summary: {
        platformTotalAmount: Math.round(platformTotalAmount * 100) / 100,
        currencyCode: 'NGN',
      },
    };
  }

  /**
   * Get payment overview summary stats.
   * Returns total counts and amounts by status.
   */
  static async getOverviewStats(filters: { from?: string; to?: string } = {}) {
    let query = supabase
      .from('wallet_transactions')
      .select('status, amount, transaction_type');

    if (filters.from) query = query.gte('created_at', filters.from);
    if (filters.to) {
      const toEnd = new Date(filters.to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    const { data, error } = await query;

    if (error) {
      logger.error('getOverviewStats error', { error: error.message });
      throw new Error(`Failed to fetch payment stats: ${error.message}`);
    }

    const rows = data ?? [];

    let totalAmount = 0;
    let succeededAmount = 0;
    let succeededCount = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let refundedAmount = 0;
    let refundedCount = 0;
    let failedCount = 0;

    for (const row of rows) {
      const amt = parseFloat(row.amount);
      totalAmount += amt;

      // Refund: transaction_type = 'refund' (status is 'completed' in DB)
      if (row.transaction_type === 'refund') {
        refundedAmount += amt;
        refundedCount++;
      } else if (row.status === 'completed') {
        succeededAmount += amt;
        succeededCount++;
      } else if (row.status === 'pending' || row.status === 'hold') {
        pendingAmount += amt;
        pendingCount++;
      } else if (row.status === 'refunded') {
        // legacy refunded status
        refundedAmount += amt;
        refundedCount++;
      } else if (row.status === 'failed') {
        failedCount++;
      }
    }

    return {
      total:     { count: rows.length, amount: totalAmount },
      succeeded: { count: succeededCount, amount: succeededAmount },
      pending:   { count: pendingCount,   amount: pendingAmount },
      refunded:  { count: refundedCount,  amount: refundedAmount },
      failed:    { count: failedCount },
    };
  }

  /**
   * Get a single transaction by ID.
   */
  static async getTransactionById(transactionId: string) {
    const { data: tx, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('id', transactionId)
      .single();

    if (error || !tx) return null;

    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone')
      .eq('id', tx.user_id)
      .single();

    // Extract card info from metadata
    const meta = (tx.metadata ?? {}) as Record<string, unknown>;
    const cardInfo = meta.card_last4
      ? {
          last4:    meta.card_last4 as string,
          brand:    (meta.card_brand as string) ?? null,
          bankName: (meta.bank_name as string) ?? null,
        }
      : null;

    // If no brand in metadata, try to look it up from payment_cards by user + last4
    let resolvedCard = cardInfo;
    if (cardInfo && !cardInfo.brand) {
      const { data: savedCard } = await supabase
        .from('payment_cards')
        .select('card_brand, bank_name')
        .eq('user_id', tx.user_id)
        .eq('card_last4', cardInfo.last4)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (savedCard) {
        resolvedCard = {
          ...cardInfo,
          brand:    savedCard.card_brand ?? null,
          bankName: savedCard.bank_name ?? null,
        };
      }
    }

    return {
      id: tx.id,
      reference: tx.reference ?? null,
      status: resolveStatus(tx.status, tx.transaction_type),
      rawStatus: tx.status,
      amount: parseFloat(tx.amount),
      currencyCode: tx.currency_code,
      paymentMethod: resolvePaymentMethod(tx.transaction_type, meta, tx.description),
      transactionType: tx.transaction_type,
      description: tx.description ?? null,
      rideId: tx.ride_id ?? null,
      card: resolvedCard,
      user: user
        ? {
            id: user.id,
            name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unknown',
            email: user.email,
            phone: user.phone ?? null,
          }
        : { id: tx.user_id, name: 'Unknown', email: null, phone: null },
      createdAt: tx.created_at,
      updatedAt: tx.updated_at,
      metadata: tx.metadata ?? {},
    };
  }
}
