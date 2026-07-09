import { supabase } from '../config/database';
import { logger } from '../config/logger';

const REMITTANCE_BLOCK_THRESHOLD = 10000; // block driver after 3 consecutive failures

export class RemittanceService {
  /**
   * Called after a cash hire completes and driver confirms cash received.
   * Identical logic to handleCashRideRemittance — reuses same blocked counter.
   * Platform remittance = service_fee + rounding_fee on the hire.
   */
  static async handleCashHireRemittance(params: {
    driverId: string;
    hireId:   string;
    platformRemittance: number;
  }): Promise<{
    status:       'auto_deducted' | 'pending' | 'settled';
    blocked:      boolean;
    pendingCount: number;
    pendingAmount: number;
  }> {
    // Delegate to the same logic — just substitute hireId for rideId in logs
    const { driverId, hireId, platformRemittance } = params;
    return this.handleCashRideRemittance({
      driverId,
      rideId: hireId,
      platformRemittance,
    });
  }

  /**
   * Called after a cash ride completes.
   * Tries to auto-deduct platform_remittance from the driver's wallet.
   * If wallet is insufficient, marks as pending and increments the failure counter.
   * If counter reaches 3, sets remittance_blocked = true.
   */
  static async handleCashRideRemittance(params: {
    driverId: string;
    rideId: string;
    platformRemittance: number;
  }): Promise<{
    status: 'auto_deducted' | 'pending' | 'settled';
    blocked: boolean;
    pendingCount: number;
    pendingAmount: number;
  }> {
    const { driverId, rideId, platformRemittance } = params;

    if (platformRemittance <= 0) {
      return { status: 'auto_deducted', blocked: false, pendingCount: 0, pendingAmount: 0 };
    }

    try {
      const walletBalance = await this.getDriverWalletBalance(driverId);

      if (walletBalance >= platformRemittance) {
        await this.deductFromWallet(driverId, rideId, platformRemittance);

        await supabase
          .from('drivers')
          .update({
            pending_remittance_amount: 0,
            pending_remittance_count: 0,
            remittance_blocked: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', driverId);

        await this.logRemittance(driverId, rideId, platformRemittance, 'auto_deducted');

        logger.info(`Remittance auto-deducted for driver ${driverId}: ₦${platformRemittance}`);

        return { status: 'auto_deducted', blocked: false, pendingCount: 0, pendingAmount: 0 };
      } else {
        // ── Insufficient wallet balance — mark as pending ────────────────────
        const { data: driver } = await supabase
          .from('drivers')
          .select('pending_remittance_amount, pending_remittance_count, remittance_blocked')
          .eq('id', driverId)
          .single();

        const currentAmount = Number(driver?.pending_remittance_amount ?? 0);
        const currentCount  = Number(driver?.pending_remittance_count  ?? 0);
        const newAmount     = currentAmount + platformRemittance;
        const newCount      = currentCount + 1;
        const shouldBlock   = newCount >= REMITTANCE_BLOCK_THRESHOLD;

        await supabase
          .from('drivers')
          .update({
            pending_remittance_amount: newAmount,
            pending_remittance_count: newCount,
            remittance_blocked: shouldBlock,
            updated_at: new Date().toISOString(),
          })
          .eq('id', driverId);

        await this.logRemittance(driverId, rideId, platformRemittance, 'pending');

        if (shouldBlock) {
          logger.warn(
            `Driver ${driverId} remittance_blocked after ${newCount} consecutive failures. ` +
            `Outstanding: ₦${newAmount}`
          );
        } else {
          logger.info(
            `Remittance pending for driver ${driverId}: ₦${platformRemittance} ` +
            `(count: ${newCount}, total outstanding: ₦${newAmount})`
          );
        }

        return { status: 'pending', blocked: shouldBlock, pendingCount: newCount, pendingAmount: newAmount };
      }
    } catch (error: any) {
      logger.error('handleCashRideRemittance error:', error);
      return { status: 'pending', blocked: false, pendingCount: 0, pendingAmount: 0 };
    }
  }

  /**
   * Called when a driver tops up their wallet.
   * Auto-settles any outstanding remittance and unblocks the driver if needed.
   */
  static async settleOnWalletTopUp(driverId: string): Promise<{
    settled: boolean;
    settledAmount: number;
    unblocked: boolean;
  }> {
    try {
      const { data: driver } = await supabase
        .from('drivers')
        .select('pending_remittance_amount, pending_remittance_count, remittance_blocked')
        .eq('id', driverId)
        .single();

      const pendingAmount = Number(driver?.pending_remittance_amount ?? 0);

      if (pendingAmount <= 0) {
        return { settled: false, settledAmount: 0, unblocked: false };
      }

      const walletBalance = await this.getDriverWalletBalance(driverId);

      if (walletBalance < pendingAmount) {
        logger.info(
          `Driver ${driverId} topped up but still insufficient for remittance. ` +
          `Balance: ₦${walletBalance}, Outstanding: ₦${pendingAmount}`
        );
        return { settled: false, settledAmount: 0, unblocked: false };
      }

      await this.deductFromWallet(driverId, null, pendingAmount, 'Remittance settlement');

      const wasBlocked = driver?.remittance_blocked ?? false;

      await supabase
        .from('drivers')
        .update({
          pending_remittance_amount: 0,
          pending_remittance_count: 0,
          remittance_blocked: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', driverId);

      await supabase
        .from('driver_remittance_log')
        .update({ status: 'settled', settled_at: new Date().toISOString() })
        .eq('driver_id', driverId)
        .eq('status', 'pending');

      logger.info(
        `Driver ${driverId} settled ₦${pendingAmount} outstanding remittance on wallet top-up. ` +
        `Unblocked: ${wasBlocked}`
      );

      return { settled: true, settledAmount: pendingAmount, unblocked: wasBlocked };
    } catch (error: any) {
      logger.error('settleOnWalletTopUp error:', error);
      return { settled: false, settledAmount: 0, unblocked: false };
    }
  }

  /**
   * Check if a driver is remittance-blocked and return details.
   */
  static async getRemittanceStatus(driverId: string): Promise<{
    blocked: boolean;
    pendingAmount: number;
    pendingCount: number;
  }> {
    const { data: driver, error } = await supabase
      .from('drivers')
      .select('pending_remittance_amount, pending_remittance_count, remittance_blocked')
      .eq('id', driverId)
      .single();

    if (error) {
      logger.error(`getRemittanceStatus DB error for driver ${driverId}:`, error);
    }


    return {
      blocked: driver?.remittance_blocked ?? false,
      pendingAmount: Number(driver?.pending_remittance_amount ?? 0),
      pendingCount: Number(driver?.pending_remittance_count ?? 0),
    };
  }

  /**
   * Called by admin when a driver pays their outstanding remittance in cash at the office.
   * Clears the pending balance, resets the counter, and unblocks the driver.
   */
  static async recordCashPayment(params: {
    driverId: string;
    amountPaid: number;
    adminId: string;
    notes?: string;
  }): Promise<{
    success: boolean;
    settledAmount: number;
    unblocked: boolean;
    error?: string;
  }> {
    const { driverId, amountPaid, adminId, notes } = params;

    try {
      const { data: driver, error: fetchError } = await supabase
        .from('drivers')
        .select('pending_remittance_amount, pending_remittance_count, remittance_blocked')
        .eq('id', driverId)
        .single();

      if (fetchError || !driver) {
        return { success: false, settledAmount: 0, unblocked: false, error: 'Driver not found' };
      }

      const pendingAmount = Number(driver.pending_remittance_amount ?? 0);

      if (pendingAmount <= 0) {
        return { success: false, settledAmount: 0, unblocked: false, error: 'Driver has no outstanding remittance' };
      }

      if (amountPaid < pendingAmount) {
        return {
          success: false,
          settledAmount: 0,
          unblocked: false,
          error: `Amount paid (₦${amountPaid.toLocaleString()}) is less than outstanding balance (₦${pendingAmount.toLocaleString()})`,
        };
      }

      const wasBlocked = driver.remittance_blocked ?? false;

      // Clear the pending balance and unblock the driver
      await supabase
        .from('drivers')
        .update({
          pending_remittance_amount: 0,
          pending_remittance_count: 0,
          remittance_blocked: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', driverId);

      // Mark all pending remittance log entries as settled
      await supabase
        .from('driver_remittance_log')
        .update({ status: 'settled', settled_at: new Date().toISOString() })
        .eq('driver_id', driverId)
        .eq('status', 'pending');

      // Record the cash payment in the log
      await supabase.from('driver_remittance_log').insert({
        driver_id: driverId,
        ride_id: null,
        amount: amountPaid,
        status: 'settled',
        settled_at: new Date().toISOString(),
        metadata: {
          payment_method: 'cash_at_office',
          recorded_by_admin: adminId,
          notes: notes ?? null,
        },
      });

      logger.info(
        `Admin ${adminId} recorded cash remittance payment for driver ${driverId}: ` +
        `₦${amountPaid.toLocaleString()}. Unblocked: ${wasBlocked}`
      );

      return { success: true, settledAmount: amountPaid, unblocked: wasBlocked };
    } catch (error: any) {
      logger.error('recordCashPayment error:', error);
      return { success: false, settledAmount: 0, unblocked: false, error: 'Internal error recording cash payment' };
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private static async getDriverWalletBalance(driverId: string): Promise<number> {
    const { data: driver } = await supabase
      .from('drivers')
      .select('user_id')
      .eq('id', driverId)
      .single();

    if (!driver) return 0;

    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount')
      .eq('user_id', driver.user_id)
      .eq('status', 'completed');

    const CREDIT_TYPES = new Set(['credit', 'topup', 'refund', 'tip_received', 'earning', 'tip_payment']);
    const DEBIT_TYPES  = new Set(['debit', 'hold', 'withdrawal', 'payment']);

    let balance = 0;
    for (const tx of txns ?? []) {
      const amt  = parseFloat(String(tx.amount ?? 0));
      const type = String(tx.transaction_type ?? '');
      if (CREDIT_TYPES.has(type))     balance += amt;
      else if (DEBIT_TYPES.has(type)) balance -= amt;
    }
    return Math.max(0, balance);
  }

  private static async deductFromWallet(
    driverId: string,
    rideId: string | null,
    amount: number,
    description = 'Platform remittance deduction'
  ): Promise<void> {
    const { data: driver } = await supabase
      .from('drivers')
      .select('user_id')
      .eq('id', driverId)
      .single();

    if (!driver) return;

    await supabase.from('wallet_transactions').insert({
      user_id: driver.user_id,
      ride_id: rideId,
      transaction_type: 'debit',
      amount,
      currency_code: 'NGN',
      status: 'completed',
      description,
      metadata: { driver_id: driverId, type: 'platform_remittance' },
    });
  }

  private static async logRemittance(
    driverId: string,
    rideId: string,
    amount: number,
    status: 'auto_deducted' | 'pending' | 'settled'
  ): Promise<void> {
    await supabase.from('driver_remittance_log').insert({
      driver_id: driverId,
      ride_id: rideId,
      amount,
      status,
      settled_at: status === 'auto_deducted' ? new Date().toISOString() : null,
    });
  }
}
