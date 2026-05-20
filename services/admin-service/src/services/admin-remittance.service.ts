import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export class AdminRemittanceService {
  /**
   * Get a driver's current remittance status + last 20 log entries.
   */
  async getDriverRemittanceStatus(driverId: string): Promise<{
    driver_id: string;
    blocked: boolean;
    pending_amount: number;
    pending_count: number;
    recent_log: unknown[];
  } | null> {
    const { data: driver, error } = await supabase
      .from('drivers')
      .select('id, pending_remittance_amount, pending_remittance_count, remittance_blocked')
      .eq('id', driverId)
      .single();

    if (error || !driver) {
      logger.warn('getDriverRemittanceStatus: driver not found', { driverId, error: error?.message });
      return null;
    }

    const { data: log } = await supabase
      .from('driver_remittance_log')
      .select('ride_id, amount, status, settled_at, created_at, metadata')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(20);

    return {
      driver_id: driverId,
      blocked: (driver as any).remittance_blocked ?? false,
      pending_amount: Number((driver as any).pending_remittance_amount ?? 0),
      pending_count: Number((driver as any).pending_remittance_count ?? 0),
      recent_log: log ?? [],
    };
  }

  /**
   * Record a cash payment made by the driver at the office.
   * Clears the debt, resets the counter, and unblocks the driver.
   */
  async recordCashPayment(params: {
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

    const { data: driver, error: fetchError } = await supabase
      .from('drivers')
      .select('pending_remittance_amount, pending_remittance_count, remittance_blocked')
      .eq('id', driverId)
      .single();

    if (fetchError || !driver) {
      return { success: false, settledAmount: 0, unblocked: false, error: 'Driver not found' };
    }

    const pendingAmount = Number((driver as any).pending_remittance_amount ?? 0);

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

    const wasBlocked = (driver as any).remittance_blocked ?? false;

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

    // Mark all pending log entries as settled
    await supabase
      .from('driver_remittance_log')
      .update({ status: 'settled', settled_at: new Date().toISOString() })
      .eq('driver_id', driverId)
      .eq('status', 'pending');

    // Insert a new log entry for the cash payment
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

    logger.info('Cash remittance payment recorded', {
      adminId,
      driverId,
      amountPaid,
      wasBlocked,
    });

    return { success: true, settledAmount: amountPaid, unblocked: wasBlocked };
  }
}
