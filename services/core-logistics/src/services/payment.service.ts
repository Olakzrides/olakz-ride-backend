import axios, { AxiosInstance } from 'axios';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { PaymentHoldResult, PaymentProcessResult } from '../types';
import { supabase } from '../config/database';

/**
 * PaymentService — Phase 3 migration
 *
 * Wallet balance / deduct / credit operations are now delegated to payment-service.
 * Hold / ride-payment logic (createRidePaymentHold, processRidePayment,
 * releasePaymentHold, convertHoldToPayment) still writes directly to Supabase
 * because these are ride-lifecycle operations that live in core-logistics domain.
 * They call getBalance via payment-service to check funds before creating holds.
 */
export class PaymentService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.paymentServiceUrl,
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure',
      },
      timeout: 30000,
    });
  }

  // ─── Wallet operations (delegated to payment-service) ───────────────────────

  async getUserWalletBalance(userId: string, currencyCode: string = 'NGN'): Promise<number> {
    try {
      const response = await this.client.get('/api/internal/payment/wallet/balance', {
        params: { currency: currencyCode },
        headers: { 'x-user-id': userId },
      });
      return response.data?.data?.wallet?.balance ?? 0;
    } catch (error: any) {
      logger.error('Get wallet balance (via payment-service) error:', error.response?.data || error.message);
      return 0;
    }
  }

  async topupWallet(params: {
    userId: string;
    userEmail: string;
    amount: number;
    currencyCode: string;
    cardId?: string;
    cardDetails?: {
      cardNumber: string;
      cvv: string;
      expiryMonth: string;
      expiryYear: string;
      cardholderName?: string;
      pin?: string;
    };
  }): Promise<{
    success: boolean;
    message?: string;
    transaction?: any;
    newBalance?: number;
    requiresAuthorization?: boolean;
    authorization?: any;
    flw_ref?: string;
    tx_ref?: string;
  }> {
    try {
      const response = await this.client.post(
        '/api/payment/wallet/topup',
        {
          amount: params.amount,
          currencyCode: params.currencyCode,
          cardId: params.cardId,
          cardDetails: params.cardDetails,
        },
        {
          headers: {
            // topup is a user-facing endpoint on payment-service — pass user context
            'x-user-id': params.userId,
            'x-user-email': params.userEmail,
          },
        }
      );

      const data = response.data?.data;
      if (data?.status === 'pending_authorization') {
        return {
          success: true,
          requiresAuthorization: true,
          authorization: data.authorization,
          flw_ref: data.flw_ref,
          tx_ref: data.tx_ref,
          message: data.message,
        };
      }

      return {
        success: true,
        transaction: data?.transaction,
        newBalance: data?.wallet?.balance,
      };
    } catch (error: any) {
      logger.error('Wallet top-up (via payment-service) error:', error.response?.data || error.message);
      return { success: false, message: error.response?.data?.message || 'Top-up failed' };
    }
  }

  async validateTopup(params: {
    userId: string;
    flwRef: string;
    otp: string;
    amount: number;
    currencyCode: string;
  }): Promise<{ success: boolean; message?: string; transaction?: any; newBalance?: number }> {
    try {
      const response = await this.client.post(
        '/api/payment/wallet/topup/validate',
        {
          flwRef: params.flwRef,
          otp: params.otp,
          amount: params.amount,
          currencyCode: params.currencyCode,
        },
        { headers: { 'x-user-id': params.userId } }
      );

      const data = response.data?.data;
      return {
        success: true,
        transaction: data?.transaction,
        newBalance: data?.wallet?.balance,
      };
    } catch (error: any) {
      logger.error('Validate top-up (via payment-service) error:', error.response?.data || error.message);
      return { success: false, message: error.response?.data?.message || 'Validation failed' };
    }
  }

  async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ transactions: any[]; total: number }> {
    try {
      const response = await this.client.get('/api/payment/wallet/transactions', {
        params: { page, limit },
        headers: { 'x-user-id': userId },
      });
      const data = response.data?.data;
      return {
        transactions: data?.transactions || [],
        total: data?.pagination?.total || 0,
      };
    } catch (error: any) {
      logger.error('Get transactions (via payment-service) error:', error.response?.data || error.message);
      return { transactions: [], total: 0 };
    }
  }

  // ─── Balance check helper ────────────────────────────────────────────────────

  async checkSufficientBalance(
    userId: string,
    amount: number,
    currencyCode: string
  ): Promise<{ sufficient: boolean; currentBalance: number; required: number }> {
    const currentBalance = await this.getUserWalletBalance(userId, currencyCode);
    return { sufficient: currentBalance >= amount, currentBalance, required: amount };
  }

  // ─── Ride payment holds (core-logistics domain — writes directly to Supabase) ─

  async createRidePaymentHold(params: {
    userId: string;
    amount: number;
    currencyCode: string;
    description: string;
  }): Promise<PaymentHoldResult> {
    try {
      const { userId, amount, currencyCode, description } = params;

      const balanceCheck = await this.checkSufficientBalance(userId, amount, currencyCode);
      if (!balanceCheck.sufficient) {
        logger.warn('Insufficient wallet balance for hold:', {
          userId,
          required: amount,
          available: balanceCheck.currentBalance,
        });
        return {
          status: 'failed',
          message: 'Insufficient wallet balance',
          errorCode: 'INSUFFICIENT_BALANCE',
          details: {
            required: amount,
            available: balanceCheck.currentBalance,
            shortfall: amount - balanceCheck.currentBalance,
          },
        };
      }

      const reference = `hold_${Date.now()}_${userId}`;

      const { data: holdTransaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'hold',
          amount,
          currency_code: currencyCode,
          status: 'pending',
          description,
          reference,
          metadata: {
            hold_type: 'ride_payment',
            balance_before: balanceCheck.currentBalance,
            created_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create payment hold error:', error);
        return { status: 'failed', message: 'Failed to create payment hold', errorCode: 'PAYMENT_HOLD_FAILED' };
      }

      await supabase
        .from('wallet_transactions')
        .update({ status: 'completed' })
        .eq('id', holdTransaction.id);

      logger.info('Payment hold created:', { userId, amount, reference });

      return { status: 'hold_created', holdId: holdTransaction.id, message: 'Payment hold created successfully' };
    } catch (error) {
      logger.error('Create ride payment hold error:', error);
      return { status: 'failed', message: 'Failed to create payment hold' };
    }
  }

  async processRidePayment(params: {
    holdId: string;
    rideId: string;
    finalAmount: number;
  }): Promise<PaymentProcessResult> {
    try {
      const { holdId, rideId, finalAmount } = params;

      const { data: holdTransaction, error: holdError } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('id', holdId)
        .single();

      if (holdError || !holdTransaction) {
        return { success: false, message: 'Invalid hold transaction' };
      }

      const heldAmount = parseFloat(holdTransaction.amount);
      const userId = holdTransaction.user_id;
      const currencyCode = holdTransaction.currency_code;

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
          metadata: { hold_transaction_id: holdId, original_hold_amount: heldAmount },
        })
        .select()
        .single();

      if (deductError) {
        logger.error('Deduct transaction error:', deductError);
        return { success: false, message: 'Failed to process payment' };
      }

      const refundAmount = heldAmount - finalAmount;
      if (refundAmount > 0) {
        await supabase.from('wallet_transactions').insert({
          user_id: userId,
          ride_id: rideId,
          transaction_type: 'refund',
          amount: refundAmount,
          currency_code: currencyCode,
          status: 'completed',
          description: `Ride payment refund - ${rideId}`,
          reference: `refund_${rideId}_${Date.now()}`,
          metadata: { hold_transaction_id: holdId, deduct_transaction_id: deductTransaction.id },
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
      return { success: false, message: 'Failed to process payment' };
    }
  }

  async releasePaymentHold(params: {
    holdId: string;
    reason: string;
    metadata?: any;
  }): Promise<{ success: boolean; message: string; refundId?: string }> {
    try {
      const { holdId, reason, metadata } = params;

      const { data: holdTransaction, error: fetchError } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount, currency_code, status, reference')
        .eq('id', holdId)
        .eq('transaction_type', 'hold')
        .single();

      if (fetchError || !holdTransaction) {
        return { success: false, message: 'Hold transaction not found' };
      }

      if (holdTransaction.status !== 'completed') {
        return { success: false, message: 'Hold transaction is not in completed status' };
      }

      const refundReference = `refund_${Date.now()}_${holdTransaction.user_id}`;

      const { data: refundTransaction, error: refundError } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: holdTransaction.user_id,
          transaction_type: 'refund',
          amount: holdTransaction.amount,
          currency_code: holdTransaction.currency_code,
          status: 'completed',
          description: `Refund for hold: ${reason}`,
          reference: refundReference,
          metadata: {
            refund_type: 'hold_release',
            original_hold_id: holdId,
            original_reference: holdTransaction.reference,
            reason,
            ...metadata,
            created_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (refundError) {
        logger.error('Create refund transaction error:', refundError);
        return { success: false, message: 'Failed to create refund transaction' };
      }

      logger.info('Payment hold released:', { holdId, refundId: refundTransaction.id, reason });

      return { success: true, message: 'Payment hold released successfully', refundId: refundTransaction.id };
    } catch (error: any) {
      logger.error('Release payment hold error:', error);
      return { success: false, message: 'Failed to release payment hold' };
    }
  }

  async convertHoldToPayment(params: {
    holdId: string;
    actualAmount?: number;
    description: string;
    metadata?: any;
  }): Promise<{ success: boolean; message: string; paymentId?: string }> {
    try {
      const { holdId, actualAmount, description, metadata } = params;

      const { data: holdTransaction, error: fetchError } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount, currency_code, status')
        .eq('id', holdId)
        .eq('transaction_type', 'hold')
        .single();

      if (fetchError || !holdTransaction) {
        return { success: false, message: 'Hold transaction not found' };
      }

      const paymentAmount = actualAmount || holdTransaction.amount;
      const refundAmount = holdTransaction.amount - paymentAmount;
      const paymentReference = `payment_${Date.now()}_${holdTransaction.user_id}`;

      const { data: paymentTransaction, error: paymentError } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: holdTransaction.user_id,
          transaction_type: 'debit',
          amount: paymentAmount,
          currency_code: holdTransaction.currency_code,
          status: 'completed',
          description,
          reference: paymentReference,
          metadata: {
            payment_type: 'hold_conversion',
            original_hold_id: holdId,
            hold_amount: holdTransaction.amount,
            payment_amount: paymentAmount,
            ...metadata,
            created_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (paymentError) {
        logger.error('Create payment transaction error:', paymentError);
        return { success: false, message: 'Failed to create payment transaction' };
      }

      if (refundAmount > 0) {
        await supabase.from('wallet_transactions').insert({
          user_id: holdTransaction.user_id,
          transaction_type: 'refund',
          amount: refundAmount,
          currency_code: holdTransaction.currency_code,
          status: 'completed',
          description: 'Refund for overpayment on ride',
          reference: `refund_${Date.now()}_${holdTransaction.user_id}`,
          metadata: {
            refund_type: 'overpayment',
            original_hold_id: holdId,
            payment_id: paymentTransaction.id,
            created_at: new Date().toISOString(),
          },
        });
      }

      logger.info('Hold converted to payment:', {
        holdId,
        paymentId: paymentTransaction.id,
        holdAmount: holdTransaction.amount,
        paymentAmount,
        refundAmount,
      });

      return { success: true, message: 'Hold converted to payment successfully', paymentId: paymentTransaction.id };
    } catch (error: any) {
      logger.error('Convert hold to payment error:', error);
      return { success: false, message: 'Failed to convert hold to payment' };
    }
  }
}
