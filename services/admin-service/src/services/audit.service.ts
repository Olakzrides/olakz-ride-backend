import { supabase } from '../config/database';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ServiceType = 'rides' | 'deliveries' | 'food_orders' | 'marketplace' | 'airtime_data';
export type RideType = 'car' | 'bus' | 'minibus' | 'bicycle' | 'motorcycle' | 'truck';

export interface CreateTransactionInput {
  serviceType:          ServiceType;
  rideType?:            RideType;       // required only when serviceType === 'rides'
  chargePrice:          number;         // CP
  amountPaid:           number;         // AP
  pickupTime?:          string;         // HH:MM
  dropoffTime?:         string;         // HH:MM
  senderPhone?:         string;
  receiverPhone?:       string;
  riderPhone?:          string;
  pickupAddress?:       string;
  destination?:         string;
  staffOnDuty?:         string;
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

async function assertNotLocked(table: 'audit_transactions' | 'audit_expenditures', id: string): Promise<void> {
  const { data, error } = await supabase
    .from(table)
    .select('is_locked')
    .eq('id', id)
    .single();

  if (error || !data) throw new Error('Record not found');
  if (data.is_locked)  throw new Error('LOCKED');
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
        staff_on_duty:        input.staffOnDuty ?? null,
        transaction_expenses: input.transactionExpenses ?? 0,
        is_locked:            false,
        created_by:           adminId,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create transaction: ${error.message}`);
    return data;
  }

  async listTransactions(date: string) {
    const { data, error } = await supabase
      .from('audit_transactions')
      .select('*')
      .eq('audit_date', date)
      .order('serial_number', { ascending: true });

    if (error) throw new Error(`Failed to list transactions: ${error.message}`);
    return data ?? [];
  }

  async updateTransaction(id: string, adminId: string, input: Partial<CreateTransactionInput>) {
    await assertNotLocked('audit_transactions', id);

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
    if (input.staffOnDuty !== undefined) updatePayload.staff_on_duty = input.staffOnDuty;
    if (input.transactionExpenses !== undefined) updatePayload.transaction_expenses = input.transactionExpenses;

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

  async deleteTransaction(id: string) {
    await assertNotLocked('audit_transactions', id);

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

  async updateExpenditure(id: string, input: Partial<CreateExpenditureInput>) {
    await assertNotLocked('audit_expenditures', id);

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

  async deleteExpenditure(id: string) {
    await assertNotLocked('audit_expenditures', id);

    const { error } = await supabase
      .from('audit_expenditures')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete expenditure: ${error.message}`);
  }

  // ── Lock ─────────────────────────────────────────────────────────────────────

  /**
   * Lock all transactions and expenditures for a given date.
   * Called when admin clicks "Submit Today's Transactions".
   */
  async lockDay(date: string) {
    const [txResult, expResult] = await Promise.all([
      supabase
        .from('audit_transactions')
        .update({ is_locked: true, updated_at: new Date().toISOString() })
        .eq('audit_date', date)
        .eq('is_locked', false),
      supabase
        .from('audit_expenditures')
        .update({ is_locked: true, updated_at: new Date().toISOString() })
        .eq('audit_date', date)
        .eq('is_locked', false),
    ]);

    if (txResult.error)  throw new Error(`Failed to lock transactions: ${txResult.error.message}`);
    if (expResult.error) throw new Error(`Failed to lock expenditures: ${expResult.error.message}`);

    logger.info(`Audit day locked: ${date}`);
    return { locked: true, date };
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
      this.listTransactions(date),
      this.listExpenditures(date),
      this.getDailySummary(date),
    ]);

    const headers = [
      'S/N', 'Date', 'Service Type', 'Ride Type',
      'Charge Price (CP)', 'Amount Paid (AP)', 'Profit', 'Loss',
      'Pickup Time', 'Dropoff Time',
      'Sender Phone', 'Receiver Phone', 'Rider Phone',
      'Pickup Address', 'Destination',
      'Staff on Duty', 'Transaction Expenses',
    ];

    const rows = transactions.map((t: any) => [
      t.serial_number, t.audit_date, t.service_type, t.ride_type ?? '',
      t.charge_price, t.amount_paid, t.profit, t.loss,
      t.pickup_time ?? '', t.dropoff_time ?? '',
      t.sender_phone ?? '', t.receiver_phone ?? '', t.rider_phone ?? '',
      `"${(t.pickup_address ?? '').replace(/"/g, '""')}"`,
      `"${(t.destination ?? '').replace(/"/g, '""')}"`,
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
