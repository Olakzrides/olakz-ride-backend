import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { PaymentHoldResult, PaymentProcessResult } from '../types';

export class PaymentService {
  /**
   * Create payment hold for ride booking
   * Phase 1: Simplified wallet hold (no actual wallet balance check)
   * Phase 4: Will integrate with actual wallet system
   */
  async createRidePaymentHold(params: {
    userId: string;
    amount: number;
    currencyCode: string;
    description: string;
  }): Promise<PaymentHoldResult> {
    try {
      const { userId, amount, currencyCode, description } = params;

      // Phase 1: Create hold transaction without balance check
      // In Phase 4, we'll check actual wallet balance
      const reference = `hold_${Date.now()}_${userId}`;

      const { data: holdTransaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'hold',
          amount: amount,
          currency_code: currencyCode,
          status: 'completed',
          description: description,
          reference: reference,
          metadata: {
            hold_type: 'ride_payment',
            created_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create payment hold error:', error);
        return {
          status: 'failed',
          message: 'Failed to create payment hold',
        };
      }

      return {
        status: 'hold_created',
        holdId: holdTransaction.id,
        message: 'Payment hold created successfully',
      };
    } catch (error) {
      logger.error('Create ride payment hold error:', error);
      return {
        status: 'failed',
        message: 'Failed to create payment hold',
      };
    }
  }

  /**
   * Process ride payment (deduct from hold)
   */
  async processRidePayment(params: {
    holdId: string;
    rideId: string;
    finalAmount: number;
  }): Promise<PaymentProcessResult> {
    try {
      const { holdId, rideId, finalAmount } = params;

      // Get hold transaction
      const { data: holdTransaction, error: holdError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', holdId)
        .single();

      if (holdError || !holdTransaction) {
        return {
          success: false,
          message: 'Invalid hold transaction',
        };
      }

      const heldAmount = parseFloat(holdTransaction.amount);
      const userId = holdTransaction.user_id;
      const currencyCode = holdTransaction.currency_code;

      // Create deduct transaction
      const { data: deductTransaction, error: deductError } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          ride_id: rideId,
          transaction_type: 'deduct',
          amount: finalAmount,
          currency_code: currencyCode,
          status: 'completed',
          description: `Ride payment - ${rideId}`,
          reference: `ride_${rideId}_${Date.now()}`,
          metadata: {
            hold_transaction_id: holdId,
            original_hold_amount: heldAmount,
          },
        })
        .select()
        .single();

      if (deductError) {
        logger.error('Deduct transaction error:', deductError);
        return {
          success: false,
          message: 'Failed to process payment',
        };
      }

      // Calculate refund if final amount is less than held amount
      const refundAmount = heldAmount - finalAmount;

      if (refundAmount > 0) {
        // Create refund transaction
        await supabase.from('wallet_transactions').insert({
          user_id: userId,
          ride_id: rideId,
          transaction_type: 'refund',
          amount: refundAmount,
          currency_code: currencyCode,
          status: 'completed',
          description: `Ride payment refund - ${rideId}`,
          reference: `refund_${rideId}_${Date.now()}`,
          metadata: {
            hold_transaction_id: holdId,
            deduct_transaction_id: deductTransaction.id,
          },
        });
      }

      return {
        success: true,
        paymentId: deductTransaction.id,
        refundAmount: refundAmount > 0 ? refundAmount : undefined,
        message: 'Payment processed successfully',
      };
    } catch (error) {
      logger.error('Process ride payment error:', error);
      return {
        success: false,
        message: 'Failed to process payment',
      };
    }
  }

  /**
   * Release payment hold (for cancelled rides)
   */
  async releasePaymentHold(holdId: string): Promise<PaymentProcessResult> {
    try {
      // Get hold transaction
      const { data: holdTransaction, error: holdError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', holdId)
        .single();

      if (holdError || !holdTransaction) {
        return {
          success: false,
          message: 'Invalid hold transaction',
        };
      }

      const heldAmount = parseFloat(holdTransaction.amount);
      const userId = holdTransaction.user_id;
      const currencyCode = holdTransaction.currency_code;

      // Create refund transaction
      const { error: refundError } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'refund',
          amount: heldAmount,
          currency_code: currencyCode,
          status: 'completed',
          description: 'Ride cancellation refund',
          reference: `cancel_refund_${Date.now()}_${userId}`,
          metadata: {
            hold_transaction_id: holdId,
            refund_reason: 'ride_cancelled',
          },
        })
        .select()
        .single();

      if (refundError) {
        logger.error('Refund transaction error:', refundError);
        return {
          success: false,
          message: 'Failed to release payment hold',
        };
      }

      return {
        success: true,
        refundAmount: heldAmount,
        message: 'Payment hold released successfully',
      };
    } catch (error) {
      logger.error('Release payment hold error:', error);
      return {
        success: false,
        message: 'Failed to release payment hold',
      };
    }
  }

  /**
   * Get user's transaction history
   */
  async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ transactions: any[]; total: number }> {
    try {
      const offset = (page - 1) * limit;

      // Get total count
      const { count } = await supabase
        .from('wallet_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Get transactions
      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        transactions: data || [],
        total: count || 0,
      };
    } catch (error) {
      logger.error('Get user transactions error:', error);
      throw error;
    }
  }
}
