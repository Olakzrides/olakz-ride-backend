import { supabase } from '../config/database';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ServiceType = 'rides' | 'deliveries' | 'food_orders' | 'marketplace' | 'airtime_data';
export type RideType = 'car' | 'bus' | 'minibus' | 'bicycle' | 'motorcycle' | 'truck';

export interface CreateTransactionInput {
  serviceType:          ServiceType;
  rideType?:            RideType;       // required only when serviceType === 'rides'
  chargePrice:          number;         // CP
  amountPaid:           number;         // AP — Actual Payout to rider/vendor
  pickupTime?:          string;         // HH:MM
  dropoffTime?:         string;         // HH:MM
  senderPhone?:         string;
  receiverPhone?:       string;
  riderPhone?:          string;
  pickupAddress?:       string;
  destination?:         string;
  location?:            string;         // free-text location, e.g. "Ikeja, Lagos"
  item?:                string;         // free-text description of what was transported/serviced
  auditDate?:           string;         // YYYY-MM-DD — optional, defaults to today if not provided
  // NOTE: staffOnDuty is intentionally removed — auto-set from authenticated admin's profile
  transactionExpenses?: number;
}

export interface CreateExpenditureInput {
  expenditureAmount:       number;
  expenditureReason:       string;
  expenditureDescription?: string;
  auditDate?:              string;      // YYYY-MM-DD — optional, defaults to today if not provided
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculateProfitLoss(cp: number, ap: number): { profit: number; loss: number } {
  const result = cp - ap;
  if (result > 0) return { profit: result,        loss: 0 };
  if (result < 0) return { profit: 0,             loss: Math.abs(result) };
  return { profit: 0, loss: 0 };
}

async function getNextSerialNumber(date: string): Promise<number> {
  // Use MAX(serial_number) + 1 instead of COUNT + 1.
  // COUNT fails when records have been deleted (gaps in sequence),
  // producing duplicate serial numbers that violate the unique constraint.
  const { data } = await supabase
    .from('audit_transactions')
    .select('serial_number')
    .eq('audit_date', date)
    .order('serial_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  return ((data as any)?.serial_number ?? 0) + 1;
}

/**
 * Fetch the admin's display name from the users table.
 *
 * Resolution order:
 *   1. full_name (if populated)
 *   2. first_name + last_name
 *   3. first_name alone
 *   4. email prefix (part before @)
 *
 * Never returns null — always returns a non-empty string so staff_on_duty
 * is never stored as null for a successfully authenticated admin.
 */
export async function resolveAdminDisplayName(
  adminId: string
): Promise<{ name: string; source: 'full_name' | 'first_last' | 'first_only' | 'last_only' | 'email_prefix' | 'id_fallback' }> {
  try {
    // Select only columns that actually exist in the users table.
    // full_name does NOT exist — selecting a non-existent column by name
    // causes PostgREST to return null for ALL selected columns.
    const { data, error } = await supabase
      .from('users')
      .select('first_name, last_name, email')
      .eq('id', adminId)
      .single();

    if (error) {
      logger.warn(`resolveAdminDisplayName: DB error for adminId=${adminId} — ${error.message}`);
    }

    if (data) {
      // 1. first + last
      const first = (data.first_name ?? '').trim();
      const last  = (data.last_name  ?? '').trim();
      if (first && last) {
        return { name: `${first} ${last}`, source: 'first_last' };
      }

      // 2. first name alone
      if (first) {
        return { name: first, source: 'first_only' };
      }

      // 3. last name alone
      if (last) {
        return { name: last, source: 'last_only' };
      }

      // 4. email prefix
      if (data.email?.trim()) {
        return { name: data.email.trim().split('@')[0], source: 'email_prefix' };
      }
    }

    logger.warn(`resolveAdminDisplayName: no name fields found for adminId=${adminId}, using ID prefix`);
    return { name: `Admin-${adminId.slice(0, 8)}`, source: 'id_fallback' };
  } catch (err: any) {
    logger.error(`resolveAdminDisplayName: unexpected error for adminId=${adminId} — ${err?.message}`);
    return { name: `Admin-${adminId.slice(0, 8)}`, source: 'id_fallback' };
  }
}

/** Internal convenience wrapper used by createTransaction */
async function fetchAdminDisplayName(adminId: string): Promise<string> {
  const { name } = await resolveAdminDisplayName(adminId);
  return name;
}

/**
 * Check ownership and return the record's created_by.
 * Throws 'NOT_FOUND' if the record does not exist.
 * Throws 'FORBIDDEN' if the requesting admin is not the owner and not a super_admin.
 */
async function assertOwnership(
  table: 'audit_transactions' | 'audit_expenditures',
  id: string,
  adminId: string,
  adminRoles: string[]
): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('created_by')
    .eq('id', id)
    .single();

  if (error || !data) throw new Error('Record not found');

  const isSuperAdmin = adminRoles.includes('super_admin');
  if (!isSuperAdmin && data.created_by !== adminId) {
    throw new Error('FORBIDDEN');
  }
}

// ── Service ────────────────────────────────────────────────────────────────────

export class AuditService {

  // ── Transactions ─────────────────────────────────────────────────────────────

  async createTransaction(adminId: string, input: CreateTransactionInput) {
    // Validate service type
    const validServiceTypes: ServiceType[] = ['rides', 'deliveries', 'food_orders', 'marketplace', 'airtime_data'];
    if (!validServiceTypes.includes(input.serviceType)) {
      throw new Error(`Invalid service_type. Must be one of: ${validServiceTypes.join(', ')}`);
    }

    // Ride type required for rides, null for everything else
    if (input.serviceType === 'rides' && !input.rideType) {
      throw new Error('ride_type is required when service_type is rides');
    }
    if (input.serviceType !== 'rides' && input.rideType) {
      throw new Error('ride_type must only be set when service_type is rides');
    }

    // Validate ride type values
    if (input.rideType) {
      const validRideTypes: RideType[] = ['car', 'bus', 'minibus', 'bicycle', 'motorcycle', 'truck'];
      if (!validRideTypes.includes(input.rideType)) {
        throw new Error(`Invalid ride_type. Must be one of: ${validRideTypes.join(', ')}`);
      }
    }

    // Validate CP and AP
    if (!input.chargePrice || input.chargePrice <= 0) {
      throw new Error('charge_price must be greater than 0');
    }
    if (input.amountPaid === undefined || input.amountPaid === null || input.amountPaid < 0) {
      throw new Error('amount_paid (Actual Payout) must be 0 or greater');
    }
    // AP can exceed CP — that results in a loss (company paid rider more than it charged customer)

    // Use provided audit_date or default to today.
    // Allows admins to enter transactions for past dates (e.g. backdating missed records).
    const today = new Date().toISOString().split('T')[0];
    const auditDate = input.auditDate?.trim() || today;

    // Validate date format YYYY-MM-DD and ensure it's not a future date
    if (!/^\d{4}-\d{2}-\d{2}$/.test(auditDate)) {
      throw new Error('audit_date must be in YYYY-MM-DD format');
    }
    if (auditDate > today) {
      throw new Error('audit_date cannot be in the future');
    }

    // Auto-fill staff_on_duty from the logged-in admin's name — never from client input
    const adminDisplayName = await fetchAdminDisplayName(adminId);

    const { profit, loss } = calculateProfitLoss(input.chargePrice, input.amountPaid);
    const serialNumber = await getNextSerialNumber(auditDate);

    const { data, error } = await supabase
      .from('audit_transactions')
      .insert({
        audit_date:           auditDate,
        serial_number:        serialNumber,
        service_type:         input.serviceType,
        ride_type:            input.rideType ?? null,
        charge_price:         input.chargePrice,
        amount_paid:          input.amountPaid,
        profit,
        loss,
        pickup_time:          input.pickupTime ?? null,
        dropoff_time:         input.dropoffTime ?? null,
        sender_phone:         input.senderPhone ?? null,
        receiver_phone:       input.receiverPhone ?? null,
        rider_phone:          input.riderPhone ?? null,
        pickup_address:       input.pickupAddress ?? null,
        destination:          input.destination ?? null,
        location:             input.location ?? null,
        item:                 input.item?.trim() ?? null,
        staff_on_duty:        adminDisplayName,   // auto-set from authenticated admin's name
        transaction_expenses: input.transactionExpenses ?? 0,
        is_locked:            false,
        created_by:           adminId,
      })
      .select()
      .single();

    if (error) {
      logger.error('audit createTransaction DB error', { error: error.message, code: error.code, details: error.details, hint: error.hint });
      throw new Error(`Failed to create transaction: ${error.message}`);
    }
    return data;
  }

  /** List transactions filtered by date range and/or location.
   *
   *  location only      → returns all transactions matching that location (all dates)
   *  from only          → returns that single day
   *  from + to          → returns full range
   *  from/to + location → returns range filtered by location
   *  neither            → returns today
   */
  async listTransactions(params: {
    from?:     string;
    to?:       string;
    location?: string;
  }) {
    const today = new Date().toISOString().split('T')[0];
    const hasLocation  = !!params.location?.trim();
    const hasDateRange = !!(params.from || params.to);

    let query = supabase
      .from('audit_transactions')
      .select('*')
      .order('audit_date',    { ascending: true })
      .order('serial_number', { ascending: true });

    if (hasDateRange) {
      // Date filter applied — location is an optional additional filter
      const from = params.from ?? today;
      const to   = params.to   ?? from;
      query = query.gte('audit_date', from).lte('audit_date', to);
    } else if (!hasLocation) {
      // No date and no location — default to today
      query = query.eq('audit_date', today);
    }
    // If location only (no dates) → no date filter, search all dates

    if (hasLocation) {
      query = query.ilike('location', `%${params.location!.trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list transactions: ${error.message}`);
    return data ?? [];
  }

  async updateTransaction(id: string, adminId: string, adminRoles: string[], input: Partial<CreateTransactionInput>) {
    // Only the admin who created the transaction (or super_admin) may edit it.
    // Throws 'Record not found' | 'FORBIDDEN'
    await assertOwnership('audit_transactions', id, adminId, adminRoles);

    // Locked transactions can still be edited by the owner or super_admin —
    // locking is a bookkeeping marker, not an immutable seal for the creator.

    const updatePayload: any = { updated_at: new Date().toISOString() };

    // Only allow updating non-calculated fields
    if (input.serviceType !== undefined) {
      const validServiceTypes: ServiceType[] = ['rides', 'deliveries', 'food_orders', 'marketplace', 'airtime_data'];
      if (!validServiceTypes.includes(input.serviceType)) throw new Error('Invalid service_type');
      updatePayload.service_type = input.serviceType;
    }
    if (input.rideType !== undefined)  updatePayload.ride_type    = input.rideType;
    if (input.pickupTime !== undefined) updatePayload.pickup_time  = input.pickupTime;
    if (input.dropoffTime !== undefined) updatePayload.dropoff_time = input.dropoffTime;
    if (input.senderPhone !== undefined) updatePayload.sender_phone = input.senderPhone;
    if (input.receiverPhone !== undefined) updatePayload.receiver_phone = input.receiverPhone;
    if (input.riderPhone !== undefined) updatePayload.rider_phone  = input.riderPhone;
    if (input.pickupAddress !== undefined) updatePayload.pickup_address = input.pickupAddress;
    if (input.destination !== undefined) updatePayload.destination = input.destination;
    if (input.location !== undefined) updatePayload.location = input.location;
    if (input.item      !== undefined) updatePayload.item     = input.item?.trim() ?? null;
    if (input.transactionExpenses !== undefined) updatePayload.transaction_expenses = input.transactionExpenses;
    // staff_on_duty is never updated — it is permanently set at creation time

    // If CP or AP changed, recalculate profit/loss
    if (input.chargePrice !== undefined || input.amountPaid !== undefined) {
      // Fetch current values to fill in missing one
      const { data: current } = await supabase
        .from('audit_transactions')
        .select('charge_price, amount_paid')
        .eq('id', id)
        .single();

      const cp = input.chargePrice ?? parseFloat(current?.charge_price ?? '0');
      const ap = input.amountPaid  ?? parseFloat(current?.amount_paid  ?? '0');

      if (cp <= 0) throw new Error('charge_price must be greater than 0');
      if (ap < 0)  throw new Error('amount_paid (Actual Payout) must be 0 or greater');
      // AP can exceed CP — that is a valid loss scenario

      const { profit, loss } = calculateProfitLoss(cp, ap);
      updatePayload.charge_price = cp;
      updatePayload.amount_paid  = ap;
      updatePayload.profit       = profit;
      updatePayload.loss         = loss;
    }

    const { data, error } = await supabase
      .from('audit_transactions')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update transaction: ${error.message}`);
    return data;
  }

  /**
   * Get a single transaction by ID with full details,
   * including the name of the admin who created it.
   * Any authenticated admin or super_admin may view.
   */
  async getTransactionById(id: string) {
    const { data: tx, error } = await supabase
      .from('audit_transactions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !tx) throw new Error('Transaction not found');

    // Resolve creator name from users table (in case staff_on_duty is stale/missing)
    const createdByName = await fetchAdminDisplayName(tx.created_by);

    // locked_by_name is already stored on the row at lock time — no extra query needed
    // But if the column is missing (old rows), resolve it on the fly
    const lockedByName = tx.locked_by_name
      ?? (tx.locked_by ? await fetchAdminDisplayName(tx.locked_by) : null);

    return {
      ...tx,
      created_by_name: createdByName,     // who entered the transaction
      locked_by_name:  lockedByName,      // who submitted/locked the day (may be different)
    };
  }

  async deleteTransaction(id: string, adminId: string, adminRoles: string[]) {
    // Only the creator or super_admin may delete a transaction
    await assertOwnership('audit_transactions', id, adminId, adminRoles);

    const { error } = await supabase
      .from('audit_transactions')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete transaction: ${error.message}`);
  }

  // ── Expenditures ─────────────────────────────────────────────────────────────

  async createExpenditure(adminId: string, input: CreateExpenditureInput) {
    if (!input.expenditureAmount || input.expenditureAmount <= 0) {
      throw new Error('expenditure_amount must be greater than 0');
    }
    if (!input.expenditureReason?.trim()) {
      throw new Error('expenditure_reason is required');
    }

    const today = new Date().toISOString().split('T')[0];
    const auditDate = input.auditDate?.trim() || today;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(auditDate)) {
      throw new Error('audit_date must be in YYYY-MM-DD format');
    }
    if (auditDate > today) {
      throw new Error('audit_date cannot be in the future');
    }

    const { data, error } = await supabase
      .from('audit_expenditures')
      .insert({
        audit_date:              auditDate,
        expenditure_amount:      input.expenditureAmount,
        expenditure_reason:      input.expenditureReason.trim(),
        expenditure_description: input.expenditureDescription ?? null,
        is_locked:               false,
        created_by:              adminId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create expenditure: ${error.message}`);
    return data;
  }

  async listExpenditures(params: { from?: string; to?: string }) {
    const today = new Date().toISOString().split('T')[0];
    const from  = params.from ?? today;
    const to    = params.to   ?? from;   // if no to, use from (single day)

    const { data, error } = await supabase
      .from('audit_expenditures')
      .select('*')
      .gte('audit_date', from)
      .lte('audit_date', to)
      .order('audit_date',  { ascending: true })
      .order('created_at',  { ascending: true });

    if (error) throw new Error(`Failed to list expenditures: ${error.message}`);
    return data ?? [];
  }

  async updateExpenditure(id: string, adminId: string, adminRoles: string[], input: Partial<CreateExpenditureInput>) {
    // Only the creator or super_admin may edit an expenditure
    await assertOwnership('audit_expenditures', id, adminId, adminRoles);

    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (input.expenditureAmount !== undefined) {
      if (input.expenditureAmount <= 0) throw new Error('expenditure_amount must be greater than 0');
      updatePayload.expenditure_amount = input.expenditureAmount;
    }
    if (input.expenditureReason !== undefined) updatePayload.expenditure_reason = input.expenditureReason.trim();
    if (input.expenditureDescription !== undefined) updatePayload.expenditure_description = input.expenditureDescription;

    const { data, error } = await supabase
      .from('audit_expenditures')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update expenditure: ${error.message}`);
    return data;
  }

  async deleteExpenditure(id: string, adminId: string, adminRoles: string[]) {
    // Only the creator or super_admin may delete an expenditure
    await assertOwnership('audit_expenditures', id, adminId, adminRoles);

    const { error } = await supabase
      .from('audit_expenditures')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete expenditure: ${error.message}`);
  }

  // ── Lock ─────────────────────────────────────────────────────────────────────

  /**
   * Lock all transactions and expenditures for a given date.
   * Stamps locked_by and locked_by_name on every affected row so the
   * super admin can see exactly who submitted the day's audit —
   * even if a different admin created the individual transactions.
   */
  async lockDay(adminId: string, date: string) {
    const now = new Date().toISOString();

    // Resolve the submitting admin's display name once
    const lockedByName = await fetchAdminDisplayName(adminId);

    const [txResult, expResult] = await Promise.all([
      supabase
        .from('audit_transactions')
        .update({
          is_locked:      true,
          locked_by:      adminId,
          locked_by_name: lockedByName,
          locked_at:      now,
          updated_at:     now,
        })
        .eq('audit_date', date)
        .eq('is_locked', false),
      supabase
        .from('audit_expenditures')
        .update({
          is_locked:      true,
          locked_by:      adminId,
          locked_by_name: lockedByName,
          locked_at:      now,
          updated_at:     now,
        })
        .eq('audit_date', date)
        .eq('is_locked', false),
    ]);

    if (txResult.error)  throw new Error(`Failed to lock transactions: ${txResult.error.message}`);
    if (expResult.error) throw new Error(`Failed to lock expenditures: ${expResult.error.message}`);

    logger.info(`Audit day locked: ${date} by admin ${adminId} (${lockedByName})`);
    return {
      locked:          true,
      date,
      submitted_by:    lockedByName,
      submitted_by_id: adminId,
      submitted_at:    now,
    };
  }

  /**
   * Calculate gross revenue, gross expenses and net revenue for a date range.
   *
   * ?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * Both from and to default to today when not provided.
   * Pass the same from/to as the transactions filter — the summary
   * will always match what the table shows.
   */
  async getDailySummary(params: { from?: string; to?: string; location?: string }) {
    const today       = new Date().toISOString().split('T')[0];
    const hasLocation  = !!params.location?.trim();
    const hasDateRange = !!(params.from || params.to);

    let txQuery = supabase
      .from('audit_transactions')
      .select('charge_price, amount_paid, transaction_expenses, profit, loss');

    let expQuery = supabase
      .from('audit_expenditures')
      .select('expenditure_amount');

    if (hasDateRange) {
      const from = params.from ?? today;
      const to   = params.to   ?? from;
      txQuery  = txQuery.gte('audit_date', from).lte('audit_date', to);
      expQuery = expQuery.gte('audit_date', from).lte('audit_date', to);
    } else if (!hasLocation) {
      // No date and no location — default to today
      txQuery  = txQuery.eq('audit_date', today);
      expQuery = expQuery.eq('audit_date', today);
    }
    // location only → no date filter on transactions (search all dates)
    // expenditures have no location, so always date-filtered or today

    if (hasLocation) {
      txQuery = txQuery.ilike('location', `%${params.location!.trim()}%`);
    }

    const [txData, expData] = await Promise.all([txQuery, expQuery]);

    if (txData.error)  throw new Error(`Failed to get transactions: ${txData.error.message}`);
    if (expData.error) throw new Error(`Failed to get expenditures: ${expData.error.message}`);

    const transactions = txData.data ?? [];
    const expenditures = expData.data ?? [];

    const grossRevenue    = transactions.reduce((s, r) => s + parseFloat(r.charge_price         ?? 0), 0);
    const totalPayouts    = transactions.reduce((s, r) => s + parseFloat(r.amount_paid          ?? 0), 0);
    const totalTxExpenses = transactions.reduce((s, r) => s + parseFloat(r.transaction_expenses ?? 0), 0);
    const totalOpex       = expenditures.reduce((s, r) => s + parseFloat(r.expenditure_amount   ?? 0), 0);
    const grossExpenses   = totalPayouts + totalTxExpenses + totalOpex;
    const netRevenue      = grossRevenue - grossExpenses;

    // Total Profit = SUM of per-transaction profit column (charge_price - amount_paid per row)
    // This shows raw profit from transactions before operational expenses
    const totalProfit = transactions.reduce((s, r) => s + parseFloat(r.profit ?? 0), 0);
    const totalLoss   = transactions.reduce((s, r) => s + parseFloat(r.loss   ?? 0), 0);

    return {
      from:     params.from ?? null,
      to:       params.to   ?? null,
      location: params.location ?? null,
      transaction_count:             transactions.length,
      gross_revenue:                 round2(grossRevenue),
      gross_expenses:                round2(grossExpenses),
      total_transaction_expenses:    round2(totalTxExpenses),
      total_operational_expenditure: round2(totalOpex),
      net_revenue:                   round2(netRevenue),
      total_profit:                  round2(totalProfit),   // SUM of (charge_price - amount_paid) per row
      total_loss:                    round2(totalLoss),     // SUM of loss rows (where payout > charge)
    };
  }

  // ── Monthly Summary ───────────────────────────────────────────────────────────

  async getMonthlySummary(year: number, month: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay   = new Date(year, month, 0).getDate();
    const endDate   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const [txData, expData] = await Promise.all([
      supabase
        .from('audit_transactions')
        .select('audit_date, charge_price, amount_paid, transaction_expenses')
        .gte('audit_date', startDate)
        .lte('audit_date', endDate),
      supabase
        .from('audit_expenditures')
        .select('audit_date, expenditure_amount')
        .gte('audit_date', startDate)
        .lte('audit_date', endDate),
    ]);

    if (txData.error)  throw new Error(`Failed to get transactions: ${txData.error.message}`);
    if (expData.error) throw new Error(`Failed to get expenditures: ${expData.error.message}`);

    // Group by date
    const dailyMap: Record<string, {
      grossRevenue: number;
      totalPayouts: number;
      txExp:        number;
      opex:         number;
    }> = {};

    for (const row of txData.data ?? []) {
      if (!dailyMap[row.audit_date]) {
        dailyMap[row.audit_date] = { grossRevenue: 0, totalPayouts: 0, txExp: 0, opex: 0 };
      }
      dailyMap[row.audit_date].grossRevenue += parseFloat(row.charge_price        ?? 0);
      dailyMap[row.audit_date].totalPayouts += parseFloat(row.amount_paid         ?? 0);
      dailyMap[row.audit_date].txExp        += parseFloat(row.transaction_expenses ?? 0);
    }

    for (const row of expData.data ?? []) {
      if (!dailyMap[row.audit_date]) {
        dailyMap[row.audit_date] = { grossRevenue: 0, totalPayouts: 0, txExp: 0, opex: 0 };
      }
      dailyMap[row.audit_date].opex += parseFloat(row.expenditure_amount ?? 0);
    }

    const dailySummaries = Object.entries(dailyMap).map(([date, d]) => {
      const grossExpenses = d.totalPayouts + d.txExp + d.opex;
      const netRevenue    = d.grossRevenue - grossExpenses;
      return {
        date,
        gross_revenue:  round2(d.grossRevenue),
        gross_expenses: round2(grossExpenses),
        net_revenue:    round2(netRevenue),
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    const monthlyGrossRevenue  = dailySummaries.reduce((s, d) => s + d.gross_revenue,  0);
    const monthlyGrossExpenses = dailySummaries.reduce((s, d) => s + d.gross_expenses, 0);
    const monthlyNetRevenue    = monthlyGrossRevenue - monthlyGrossExpenses;

    return {
      year,
      month,
      daily_summaries:        dailySummaries,
      monthly_gross_revenue:  round2(monthlyGrossRevenue),
      monthly_gross_expenses: round2(monthlyGrossExpenses),
      monthly_net_revenue:    round2(monthlyNetRevenue),
    };
  }

  // ── Yearly Summary ────────────────────────────────────────────────────────────

  async getYearlySummary(year: number) {
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;

    const [txData, expData] = await Promise.all([
      supabase
        .from('audit_transactions')
        .select('audit_date, charge_price, amount_paid, transaction_expenses')
        .gte('audit_date', startDate)
        .lte('audit_date', endDate),
      supabase
        .from('audit_expenditures')
        .select('audit_date, expenditure_amount')
        .gte('audit_date', startDate)
        .lte('audit_date', endDate),
    ]);

    if (txData.error)  throw new Error(`Failed to get transactions: ${txData.error.message}`);
    if (expData.error) throw new Error(`Failed to get expenditures: ${expData.error.message}`);

    // Group by month (YYYY-MM)
    const monthlyMap: Record<string, {
      grossRevenue: number;
      totalPayouts: number;
      txExp:        number;
      opex:         number;
    }> = {};

    for (const row of txData.data ?? []) {
      const monthKey = row.audit_date.slice(0, 7); // "YYYY-MM"
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { grossRevenue: 0, totalPayouts: 0, txExp: 0, opex: 0 };
      }
      monthlyMap[monthKey].grossRevenue += parseFloat(row.charge_price         ?? 0);
      monthlyMap[monthKey].totalPayouts += parseFloat(row.amount_paid          ?? 0);
      monthlyMap[monthKey].txExp        += parseFloat(row.transaction_expenses ?? 0);
    }

    for (const row of expData.data ?? []) {
      const monthKey = row.audit_date.slice(0, 7);
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { grossRevenue: 0, totalPayouts: 0, txExp: 0, opex: 0 };
      }
      monthlyMap[monthKey].opex += parseFloat(row.expenditure_amount ?? 0);
    }

    const monthlySummaries = Object.entries(monthlyMap).map(([month, d]) => {
      const grossExpenses = d.totalPayouts + d.txExp + d.opex;
      const netRevenue    = d.grossRevenue - grossExpenses;
      return {
        month,                                  // "YYYY-MM"
        gross_revenue:  round2(d.grossRevenue),
        gross_expenses: round2(grossExpenses),
        net_revenue:    round2(netRevenue),
      };
    }).sort((a, b) => a.month.localeCompare(b.month));

    const yearlyGrossRevenue  = monthlySummaries.reduce((s, m) => s + m.gross_revenue,  0);
    const yearlyGrossExpenses = monthlySummaries.reduce((s, m) => s + m.gross_expenses, 0);
    const yearlyNetRevenue    = yearlyGrossRevenue - yearlyGrossExpenses;

    return {
      year,
      monthly_summaries:      monthlySummaries,
      yearly_gross_revenue:   round2(yearlyGrossRevenue),
      yearly_gross_expenses:  round2(yearlyGrossExpenses),
      yearly_net_revenue:     round2(yearlyNetRevenue),
    };
  }

  // ── Export (CSV) ──────────────────────────────────────────────────────────────

  async exportDailyCSV(date: string): Promise<string> {
    const [transactions, expenditures, summary] = await Promise.all([
      this.listTransactions({ from: date, to: date }),
      this.listExpenditures({ from: date, to: date }),
      this.getDailySummary({ from: date, to: date }),
    ]);

    const headers = [
      'S/N', 'Date', 'Service Type', 'Ride Type',
      'Charge Price (CP)', 'Amount Paid (AP)', 'Profit', 'Loss',
      'Item',
      'Pickup Time', 'Dropoff Time',
      'Sender Phone', 'Receiver Phone', 'Rider Phone',
      'Pickup Address', 'Destination', 'Location',
      'Staff on Duty', 'Transaction Expenses',
    ];

    const rows = transactions.map((t: any) => [
      t.serial_number, t.audit_date, t.service_type, t.ride_type ?? '',
      t.charge_price, t.amount_paid, t.profit ?? 0, t.loss ?? 0,
      `"${(t.item ?? '').replace(/"/g, '""')}"`,
      t.pickup_time ?? '', t.dropoff_time ?? '',
      t.sender_phone ?? '', t.receiver_phone ?? '', t.rider_phone ?? '',
      `"${(t.pickup_address ?? '').replace(/"/g, '""')}"`,
      `"${(t.destination ?? '').replace(/"/g, '""')}"`,
      `"${(t.location ?? '').replace(/"/g, '""')}"`,
      `"${(t.staff_on_duty ?? '').replace(/"/g, '""')}"`,
      t.transaction_expenses,
    ]);

    const expHeaders = ['Expenditure Amount', 'Reason', 'Description'];
    const expRows = expenditures.map((e: any) => [
      e.expenditure_amount,
      `"${(e.expenditure_reason ?? '').replace(/"/g, '""')}"`,
      `"${(e.expenditure_description ?? '').replace(/"/g, '""')}"`,
    ]);

    let csv = `Daily Transaction Audit Sheet — ${date}\n\n`;
    csv += headers.join(',') + '\n';
    csv += rows.map(r => r.join(',')).join('\n');
    csv += '\n\nDaily Operational Expenditures\n';
    csv += expHeaders.join(',') + '\n';
    csv += expRows.map(r => r.join(',')).join('\n');
    csv += '\n\nDaily Financial Summary\n';
    csv += `Gross Revenue (Total CP Collected),${summary.gross_revenue}\n`;
    csv += `Gross Expenses (Payouts + TX Costs + Opex),${summary.gross_expenses}\n`;
    csv += `  — Transaction Expenses,${summary.total_transaction_expenses}\n`;
    csv += `  — Operational Expenditure,${summary.total_operational_expenditure}\n`;
    csv += `Net Revenue (Gross Revenue − Gross Expenses),${summary.net_revenue}\n`;

    return csv;
  }

  async exportMonthlyCSV(year: number, month: number): Promise<string> {
    const summary = await this.getMonthlySummary(year, month);

    let csv = `Monthly Audit Summary — ${year}-${String(month).padStart(2, '0')}\n\n`;
    csv += 'Date,Gross Revenue,Gross Expenses,Net Revenue\n';
    csv += summary.daily_summaries
      .map(d => `${d.date},${d.gross_revenue},${d.gross_expenses},${d.net_revenue}`)
      .join('\n');
    csv += '\n\nMonthly Totals\n';
    csv += `Monthly Gross Revenue,${summary.monthly_gross_revenue}\n`;
    csv += `Monthly Gross Expenses,${summary.monthly_gross_expenses}\n`;
    csv += `Monthly Net Revenue,${summary.monthly_net_revenue}\n`;

    return csv;
  }

  async exportYearlyCSV(year: number): Promise<string> {
    const summary = await this.getYearlySummary(year);

    let csv = `Yearly Audit Summary — ${year}\n\n`;
    csv += 'Month,Gross Revenue,Gross Expenses,Net Revenue\n';
    csv += summary.monthly_summaries
      .map(m => `${m.month},${m.gross_revenue},${m.gross_expenses},${m.net_revenue}`)
      .join('\n');
    csv += '\n\nYearly Totals\n';
    csv += `Yearly Gross Revenue,${summary.yearly_gross_revenue}\n`;
    csv += `Yearly Gross Expenses,${summary.yearly_gross_expenses}\n`;
    csv += `Yearly Net Revenue,${summary.yearly_net_revenue}\n`;

    return csv;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
