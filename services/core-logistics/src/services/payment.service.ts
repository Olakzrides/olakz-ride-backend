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
      // Support both old shape { balance } and new split shape { total_balance }
      const wallet = response.data?.data?.wallet;
      return wallet?.total_balance ?? wallet?.balance ?? 0;
    } catch (error: any) {
      logger.error('Get wallet balance (via payment-service) error:', error.response?.data || error.message);
      return 0;
    }
  }

  /**
   * Get the split wallet balance (cash vs promo).
   * Used to tag hold transactions so refunds go back to the right bucket.
   */
  async getWalletBalances(userId: string, currencyCode: string = 'NGN'): Promise<{
    cashBalance: number;
    promoBalance: number;
    totalBalance: number;
  }> {
    try {
      const response = await this.client.get('/api/internal/payment/wallet/balance', {
        params: { currency: currencyCode },
        headers: { 'x-user-id': userId },
      });
      const wallet = response.data?.data?.wallet;
      const total = wallet?.total_balance ?? wallet?.balance ?? 0;
      const cash  = wallet?.cash_balance  ?? total;
      const promo = wallet?.promo_balance ?? 0;
      return { cashBalance: cash, promoBalance: promo, totalBalance: total };
    } catch (error: any) {
      logger.error('Get wallet balances (via payment-service) error:', error.response?.data || error.message);
      return { cashBalance: 0, promoBalance: 0, totalBalance: 0 };
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
    authToken?: string;
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
          currency_code: params.currencyCode,
          card_id: params.cardId,
          card_details: params.cardDetails ? {
            card_number: params.cardDetails.cardNumber,
            cvv: params.cardDetails.cvv,
            expiry_month: params.cardDetails.expiryMonth,
            expiry_year: params.cardDetails.expiryYear,
            fullname: params.cardDetails.cardholderName,
            pin: params.cardDetails.pin,
          } : undefined,
        },
        {
          headers: {
            'Authorization': params.authToken ? `Bearer ${params.authToken}` : '',
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
    authToken?: string;
  }): Promise<{ success: boolean; message?: string; transaction?: any; newBalance?: number }> {
    try {
      const response = await this.client.post(
        '/api/payment/wallet/topup/validate',
        {
          flw_ref: params.flwRef,
          otp: params.otp,
          amount: params.amount,
          currency_code: params.currencyCode,
        },
        { headers: { 'Authorization': params.authToken ? `Bearer ${params.authToken}` : '', 'x-user-id': params.userId } }
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

  async creditWallet(params: {
    userId: string;
    amount: number;
    currencyCode: string;
    reference: string;
    description: string;
    transactionType?: string;
  }): Promise<void> {
    try {
      await this.client.post(
        '/api/internal/payment/wallet/credit',
        {
          amount: params.amount,
          currency_code: params.currencyCode,
          reference: params.reference,
          description: params.description,
          transaction_type: params.transactionType || 'credit',
        },
        { headers: { 'x-user-id': params.userId } }
      );
    } catch (error: any) {
      logger.error('Credit wallet (via payment-service) error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to credit wallet');
    }
  }

  async deductWallet(params: {
    userId: string;
    amount: number;
    currencyCode: string;
    reference: string;
    description: string;
  }): Promise<void> {
    try {
      await this.client.post(
        '/api/internal/payment/wallet/deduct',
        {
          amount: params.amount,
          currency_code: params.currencyCode,
          reference: params.reference,
          description: params.description,
        },
        { headers: { 'x-user-id': params.userId } }
      );
    } catch (error: any) {
      logger.error('Deduct wallet (via payment-service) error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to deduct wallet');
    }
  }

  async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 10,
    authToken?: string
  ): Promise<{ transactions: any[]; total: number }> {
    try {
      const response = await this.client.get('/api/payment/wallet/transactions', {
        params: { page, limit },
        headers: { 'Authorization': authToken ? `Bearer ${authToken}` : '', 'x-user-id': userId },
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

      // Get split balance — need to know promo vs cash for correct refund routing later
      const { cashBalance, totalBalance } = await this.getWalletBalances(userId, currencyCode);

      if (totalBalance < amount) {
        logger.warn('Insufficient wallet balance for hold:', {
          userId, required: amount, available: totalBalance,
        });
        return {
          status: 'failed',
          message: 'Insufficient wallet balance',
          errorCode: 'INSUFFICIENT_BALANCE',
          details: { required: amount, available: totalBalance, shortfall: amount - totalBalance },
        };
      }

      // Calculate how much of this hold is funded by promo vs cash.
      // Cash is spent first; promo covers the remainder.
      const promoPortion = Math.max(0, amount - cashBalance);
      const cashPortion  = amount - promoPortion;

      const reference = `hold_${Date.now()}_${userId}`;

      const { data: holdTransaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id:          userId,
          transaction_type: 'hold',
          amount,
          currency_code:    currencyCode,
          status:           'pending',
          description,
          reference,
          metadata: {
            hold_type:      'ride_payment',
            balance_before: totalBalance,
            cash_portion:   cashPortion,    // used by releasePaymentHold to refund correctly
            promo_portion:  promoPortion,   // used by releasePaymentHold to refund correctly
            created_at:     new Date().toISOString(),
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

      logger.info('Payment hold created:', { userId, amount, reference, cashPortion, promoPortion });

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

      const heldAmount   = parseFloat(holdTransaction.amount);
      const userId       = holdTransaction.user_id;
      const currencyCode = holdTransaction.currency_code;
      const meta         = (holdTransaction.metadata ?? {}) as Record<string, number>;

      // The 'hold' transaction already reduced the balance when it was created.
      // We do NOT insert another debit here — we only handle the difference:
      //   • If finalAmount < heldAmount → refund the overage back to the right bucket
      //   • If finalAmount > heldAmount → charge the extra (edge case: toll/surge added)
      //   • If equal → nothing extra needed

      const diff = heldAmount - finalAmount;

      if (diff > 0) {
        // Overheld — refund the difference.
        // Route back to the correct bucket using the portions stored at hold time.
        const promoPortion = meta.promo_portion ?? 0;

        // Proportion of the overage that came from promo vs cash
        const promoOverage = Math.min(promoPortion, diff);
        const cashOverage  = diff - promoOverage;

        if (promoOverage > 0) {
          await supabase.from('wallet_transactions').insert({
            user_id:          userId,
            ride_id:          rideId,
            transaction_type: 'promo_credit',   // returns to promo bucket
            amount:           promoOverage,
            currency_code:    currencyCode,
            status:           'completed',
            description:      `Ride overpayment refund (promo) - ${rideId}`,
            reference:        `refund_promo_${rideId}_${Date.now()}`,
            metadata:         { hold_transaction_id: holdId, refund_type: 'overpayment_promo' },
          });
        }

        if (cashOverage > 0) {
          await supabase.from('wallet_transactions').insert({
            user_id:          userId,
            ride_id:          rideId,
            transaction_type: 'refund',         // returns to cash bucket
            amount:           cashOverage,
            currency_code:    currencyCode,
            status:           'completed',
            description:      `Ride overpayment refund (cash) - ${rideId}`,
            reference:        `refund_cash_${rideId}_${Date.now()}`,
            metadata:         { hold_transaction_id: holdId, refund_type: 'overpayment_cash' },
          });
        }
      } else if (diff < 0) {
        // Underheld — final fare exceeded the hold (e.g. surge, tolls).
        // Deduct the extra from the wallet now.
        const extra = Math.abs(diff);
        const { error: extraErr } = await supabase
          .from('wallet_transactions')
          .insert({
            user_id:          userId,
            ride_id:          rideId,
            transaction_type: 'debit',          // recognised by getWalletBalances
            amount:           extra,
            currency_code:    currencyCode,
            status:           'completed',
            description:      `Ride fare adjustment - ${rideId}`,
            reference:        `fare_adj_${rideId}_${Date.now()}`,
            metadata:         { hold_transaction_id: holdId, adjustment_type: 'underhold' },
          })
          .select('id')
          .single();

        if (extraErr) {
          logger.error('Ride fare adjustment debit error:', extraErr);
          // Non-fatal — hold already covered the base amount
        }
      }

      // Record the final settled payment amount for reporting/audit
      const { data: paymentRecord, error: paymentErr } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id:          userId,
          ride_id:          rideId,
          transaction_type: 'payment',          // audit/reporting record — amount is informational
          amount:           finalAmount,
          currency_code:    currencyCode,
          status:           'completed',
          description:      `Ride payment settled - ${rideId}`,
          reference:        `ride_payment_${rideId}_${Date.now()}`,
          metadata:         {
            hold_transaction_id: holdId,
            held_amount:         heldAmount,
            final_amount:        finalAmount,
            promo_portion:       meta.promo_portion ?? 0,
            cash_portion:        meta.cash_portion  ?? heldAmount,
          },
        })
        .select('id')
        .single();

      if (paymentErr) {
        logger.error('Ride payment record error:', paymentErr);
        // Non-fatal — balance was already settled above
      }

      logger.info('Ride payment processed', { rideId, holdId, heldAmount, finalAmount });

      return {
        success:      true,
        paymentId:    paymentRecord?.id,
        refundAmount: diff > 0 ? diff : undefined,
        message:      'Payment processed successfully',
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
        .select('user_id, amount, currency_code, status, reference, metadata')
        .eq('id', holdId)
        .eq('transaction_type', 'hold')
        .single();

      if (fetchError || !holdTransaction) {
        return { success: false, message: 'Hold transaction not found' };
      }

      if (holdTransaction.status !== 'completed') {
        return { success: false, message: 'Hold transaction is not in completed status' };
      }

      const holdMeta     = (holdTransaction.metadata ?? {}) as Record<string, number>;
      const totalAmount  = parseFloat(holdTransaction.amount);
      const promoPortion = holdMeta.promo_portion ?? 0;
      const cashPortion  = holdMeta.cash_portion  ?? totalAmount;

      const baseMetadata = {
        refund_type:       'hold_release',
        original_hold_id:  holdId,
        original_reference: holdTransaction.reference,
        reason,
        ...metadata,
        created_at: new Date().toISOString(),
      };

      let lastRefundId: string | undefined;

      // ── Refund cash portion back to cash bucket ──────────────────────────
      if (cashPortion > 0) {
        const { data: cashRefund, error: cashErr } = await supabase
          .from('wallet_transactions')
          .insert({
            user_id:          holdTransaction.user_id,
            transaction_type: 'refund',          // → CASH_CREDIT_TYPES
            amount:           cashPortion,
            currency_code:    holdTransaction.currency_code,
            status:           'completed',
            description:      `Hold released (cash): ${reason}`,
            reference:        `refund_cash_${Date.now()}_${holdTransaction.user_id}`,
            metadata:         { ...baseMetadata, bucket: 'cash' },
          })
          .select('id')
          .single();

        if (cashErr) {
          logger.error('Cash hold release refund error:', cashErr);
          return { success: false, message: 'Failed to release hold (cash portion)' };
        }
        lastRefundId = cashRefund.id;
      }

      // ── Refund promo portion back to promo bucket ────────────────────────
      if (promoPortion > 0) {
        const { data: promoRefund, error: promoErr } = await supabase
          .from('wallet_transactions')
          .insert({
            user_id:          holdTransaction.user_id,
            transaction_type: 'promo_credit',    // → PROMO_CREDIT_TYPES
            amount:           promoPortion,
            currency_code:    holdTransaction.currency_code,
            status:           'completed',
            description:      `Hold released (promo): ${reason}`,
            reference:        `refund_promo_${Date.now()}_${holdTransaction.user_id}`,
            metadata:         { ...baseMetadata, bucket: 'promo' },
          })
          .select('id')
          .single();

        if (promoErr) {
          logger.error('Promo hold release refund error:', promoErr);
          // Non-fatal if cash refund already succeeded — log and continue
        } else {
          lastRefundId = lastRefundId ?? promoRefund.id;
        }
      }

      logger.info('Payment hold released:', { holdId, refundId: lastRefundId, reason, cashPortion, promoPortion });

      return { success: true, message: 'Payment hold released successfully', refundId: lastRefundId };
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
