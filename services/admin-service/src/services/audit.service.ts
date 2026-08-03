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
  // NOTE: staffOnDuty is intentionally removed — auto-set from authenticated admin's profile
  transactionExpenses?: number;
}

export interface CreateExpenditureInput {
  expenditureAmount:      number;
  expenditureReason:      string;
  expenditureDescription?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculateProfitLoss(cp: number, ap: number): { profit: number; loss: number } {
  const result = cp - ap;
  if (result > 0) return { profit: result,        loss: 0 };
  if (result < 0) return { profit: 0,             loss: Math.abs(result) };
  return { profit: 0, loss: 0 };
}

async function getNextSerialNumber(date: string): Promise<number> {
  const { count } = await supabase
    .from('audit_transactions')
    .select('*', { count: 'exact', head: true })
    .eq('audit_date', date);

  return (count ?? 0) + 1;
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

    // Backend-controlled date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Auto-fill staff_on_duty from the logged-in admin's name — never from client input
    const adminDisplayName = await fetchAdminDisplayName(adminId);

    const { profit, loss } = calculateProfitLoss(input.chargePrice, input.amountPaid);
    const serialNumber = await getNextSerialNumber(today);

    const { data, error } = await supabase
      .from('audit_transactions')
      .insert({
        audit_date:           today,
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
        staff_on_duty:        adminDisplayName,   // auto-set from authenticated admin's name
        transaction_expenses: input.transactionExpenses ?? 0,
        is_locked:            false,
        created_by:           adminId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create transaction: ${error.message}`);
    return data;
  }

  /** List transactions with optional date, date range, and location filters */
  async listTransactions(params: {
    date?: string;
    from?: string;
    to?: string;
    location?: string;
  }) {
    const today = new Date().toISOString().split('T')[0];

    let query = supabase
      .from('audit_transactions')
      .select('*')
      .order('serial_number', { ascending: true });

    // Date filtering: range takes priority over single date
    if (params.from || params.to) {
      if (params.from) query = query.gte('audit_date', params.from);
      if (params.to)   query = query.lte('audit_date', params.to);
    } else {
      // Default to single date (today if not provided)
      const date = params.date ?? today;
      query = query.eq('audit_date', date);
    }

    // Location filter — partial case-insensitive match
    if (params.location?.trim()) {
      query = query.ilike('location', `%${params.location.trim()}%`);
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

    const { data, error } = await supabase
      .from('audit_expenditures')
      .insert({
        audit_date:              today,
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

  async listExpenditures(date: string) {
    const { data, error } = await supabase
      .from('audit_expenditures')
      .select('*')
      .eq('audit_date', date)
      .order('created_at', { ascending: true });

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

  // ── Daily Summary ─────────────────────────────────────────────────────────────

  async getDailySummary(date: string) {
    const [txData, expData] = await Promise.all([
      supabase
        .from('audit_transactions')
        .select('profit, loss, transaction_expenses')
        .eq('audit_date', date),
      supabase
        .from('audit_expenditures')
        .select('expenditure_amount')
        .eq('audit_date', date),
    ]);

    if (txData.error)  throw new Error(`Failed to get transactions: ${txData.error.message}`);
    if (expData.error) throw new Error(`Failed to get expenditures: ${expData.error.message}`);

    const transactions = txData.data ?? [];
    const expenditures = expData.data ?? [];

    const totalProfit      = transactions.reduce((s, r) => s + parseFloat(r.profit ?? 0), 0);
    const totalLoss        = transactions.reduce((s, r) => s + parseFloat(r.loss ?? 0), 0);
    const totalTxExpenses  = transactions.reduce((s, r) => s + parseFloat(r.transaction_expenses ?? 0), 0);
    const totalOpex        = expenditures.reduce((s, r) => s + parseFloat(r.expenditure_amount ?? 0), 0);
    const dailyTotalBalance = totalProfit - totalLoss - totalTxExpenses - totalOpex;

    return {
      date,
      transaction_count:          transactions.length,
      total_profit:                round2(totalProfit),
      total_loss:                  round2(totalLoss),
      total_transaction_expenses:  round2(totalTxExpenses),
      total_operational_expenditure: round2(totalOpex),
      daily_total_balance:         round2(dailyTotalBalance),
    };
  }

  // ── Monthly Summary ───────────────────────────────────────────────────────────

  async getMonthlySummary(year: number, month: number) {
    // Build date range for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay   = new Date(year, month, 0).getDate();
    const endDate   = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const [txData, expData] = await Promise.all([
      supabase
        .from('audit_transactions')
        .select('audit_date, profit, loss, transaction_expenses')
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

    // Group by date to build daily balances
    const dailyMap: Record<string, { profit: number; loss: number; txExp: number; opex: number }> = {};

    for (const row of txData.data ?? []) {
      if (!dailyMap[row.audit_date]) dailyMap[row.audit_date] = { profit: 0, loss: 0, txExp: 0, opex: 0 };
      dailyMap[row.audit_date].profit += parseFloat(row.profit ?? 0);
      dailyMap[row.audit_date].loss   += parseFloat(row.loss ?? 0);
      dailyMap[row.audit_date].txExp  += parseFloat(row.transaction_expenses ?? 0);
    }

    for (const row of expData.data ?? []) {
      if (!dailyMap[row.audit_date]) dailyMap[row.audit_date] = { profit: 0, loss: 0, txExp: 0, opex: 0 };
      dailyMap[row.audit_date].opex += parseFloat(row.expenditure_amount ?? 0);
    }

    const dailySummaries = Object.entries(dailyMap).map(([date, d]) => ({
      date,
      daily_total_balance: round2(d.profit - d.loss - d.txExp - d.opex),
    })).sort((a, b) => a.date.localeCompare(b.date));

    const monthlyTotalBalance = dailySummaries.reduce((s, d) => s + d.daily_total_balance, 0);

    return {
      year,
      month,
      daily_summaries:        dailySummaries,
      monthly_total_balance:  round2(monthlyTotalBalance),
    };
  }

  // ── Export (CSV) ──────────────────────────────────────────────────────────────

  async exportDailyCSV(date: string): Promise<string> {
    const [transactions, expenditures, summary] = await Promise.all([
      this.listTransactions({ date }),
      this.listExpenditures(date),
      this.getDailySummary(date),
    ]);

    const headers = [
      'S/N', 'Date', 'Service Type', 'Ride Type',
      'Charge Price (CP)', 'Amount Paid (AP)', 'Profit', 'Loss',
      'Pickup Time', 'Dropoff Time',
      'Sender Phone', 'Receiver Phone', 'Rider Phone',
      'Pickup Address', 'Destination', 'Location',
      'Staff on Duty', 'Transaction Expenses',
    ];

    const rows = transactions.map((t: any) => [
      t.serial_number, t.audit_date, t.service_type, t.ride_type ?? '',
      t.charge_price, t.amount_paid, t.profit, t.loss,
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
    csv += '\n\nDaily Summary\n';
    csv += `Total Profit,${summary.total_profit}\n`;
    csv += `Total Loss,${summary.total_loss}\n`;
    csv += `Total Transaction Expenses,${summary.total_transaction_expenses}\n`;
    csv += `Total Operational Expenditure,${summary.total_operational_expenditure}\n`;
    csv += `Daily Total Balance,${summary.daily_total_balance}\n`;

    return csv;
  }

  async exportMonthlyCSV(year: number, month: number): Promise<string> {
    const summary = await this.getMonthlySummary(year, month);

    let csv = `Monthly Audit Summary — ${year}-${String(month).padStart(2, '0')}\n\n`;
    csv += 'Date,Daily Total Balance\n';
    csv += summary.daily_summaries.map(d => `${d.date},${d.daily_total_balance}`).join('\n');
    csv += `\n\nMonthly Total Balance,${summary.monthly_total_balance}\n`;

    return csv;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
