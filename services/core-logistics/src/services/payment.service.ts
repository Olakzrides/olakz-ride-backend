import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { PaymentHoldResult, PaymentProcessResult } from '../types';
import { FlutterwaveService } from './flutterwave.service';
import { PaymentCardsService } from './payment-cards.service';

export class PaymentService {
  private flutterwaveService: FlutterwaveService;
  private paymentCardsService: PaymentCardsService;

  constructor() {
    this.flutterwaveService = new FlutterwaveService();
    this.paymentCardsService = new PaymentCardsService();
  }

  /**
   * Top up wallet using saved card or new card
   */
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
      const { userId, userEmail, amount, currencyCode, cardId, cardDetails } = params;

      let chargeResult: any;

      if (cardId) {
        // Charge saved card
        const txRef = `topup_${userId}_${Date.now()}`;
        
        chargeResult = await this.paymentCardsService.chargeCard({
          cardId,
          userId,
          amount,
          currency: currencyCode,
          email: userEmail,
          txRef,
        });
      } else if (cardDetails) {
        // Charge new card (one-time payment, not saved)
        const txRef = `topup_${userId}_${Date.now()}`;
        
        chargeResult = await this.flutterwaveService.tokenizeCard({
          card_number: cardDetails.cardNumber,
          cvv: cardDetails.cvv,
          expiry_month: cardDetails.expiryMonth,
          expiry_year: cardDetails.expiryYear,
          currency: currencyCode,
          amount,
          email: userEmail,
          fullname: cardDetails.cardholderName,
          tx_ref: txRef,
          authorization: cardDetails.pin ? { mode: 'pin', pin: cardDetails.pin } : { mode: 'pin' },
        });
      } else {
        return {
          success: false,
          message: 'Payment method required',
        };
      }

      // Check charge status
      if (chargeResult.status !== 'success') {
        return {
          success: false,
          message: chargeResult.message || 'Payment failed',
        };
      }

      // Check if charge requires authorization (OTP, 3D Secure, etc.)
      if (chargeResult.data?.status === 'pending') {
        logger.info('Charge requires authorization:', {
          status: chargeResult.data.status,
          flw_ref: chargeResult.data.flw_ref,
        });
        
        return {
          success: true,
          requiresAuthorization: true,
          authorization: chargeResult.data.authorization,
          flw_ref: chargeResult.data.flw_ref,
          tx_ref: chargeResult.data.tx_ref,
          message: 'Charge initiated. Please validate with OTP.',
        };
      }

      // Only proceed if charge is successful
      if (chargeResult.data?.status !== 'successful') {
        return {
          success: false,
          message: chargeResult.message || 'Payment not completed',
        };
      }

      // Create credit transaction in wallet
      const reference = `topup_${Date.now()}_${userId}`;

      const { data: transaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'credit',
          amount,
          currency_code: currencyCode,
          status: 'completed',
          description: 'Wallet top-up via card',
          reference,
          metadata: {
            funding_type: 'card_payment',
            flw_ref: chargeResult.data.flw_ref,
            payment_method: cardId ? 'saved_card' : 'new_card',
            card_last4: chargeResult.data.card?.last_4digits,
            charged_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create wallet transaction error:', error);
        return {
          success: false,
          message: 'Failed to credit wallet',
        };
      }

      // Get updated balance
      const newBalance = await this.getUserWalletBalance(userId, currencyCode);

      logger.info('Wallet top-up successful:', {
        userId,
        amount,
        newBalance,
        reference,
      });

      return {
        success: true,
        transaction: {
          id: transaction.id,
          amount,
          currency_code: currencyCode,
          reference,
          created_at: transaction.created_at,
        },
        newBalance,
      };
    } catch (error: any) {
      logger.error('Wallet top-up error:', error);
      return {
        success: false,
        message: error.message || 'Top-up failed',
      };
    }
  }

  /**
   * Validate wallet top-up with OTP
   */
  async validateTopup(params: {
    userId: string;
    flwRef: string;
    otp: string;
    amount: number;
    currencyCode: string;
  }): Promise<{
    success: boolean;
    message?: string;
    transaction?: any;
    newBalance?: number;
  }> {
    try {
      const { userId, flwRef, otp, amount, currencyCode } = params;

      // Validate the charge with Flutterwave
      const validationResult = await this.flutterwaveService.validateCharge(flwRef, otp);

      if (validationResult.status !== 'success') {
        return {
          success: false,
          message: validationResult.message || 'Validation failed',
        };
      }

      // Check if charge is now successful
      if (validationResult.data?.status !== 'successful') {
        return {
          success: false,
          message: 'Charge validation incomplete',
        };
      }

      // Create credit transaction in wallet
      const reference = `topup_${Date.now()}_${userId}`;

      const { data: transaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: userId,
          transaction_type: 'credit',
          amount,
          currency_code: currencyCode,
          status: 'completed',
          description: 'Wallet top-up via card',
          reference,
          metadata: {
            funding_type: 'card_payment',
            flw_ref: flwRef,
            payment_method: 'card_with_otp',
            card_last4: validationResult.data.card?.last_4digits,
            charged_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create wallet transaction error:', error);
        return {
          success: false,
          message: 'Failed to credit wallet',
        };
      }

      // Get updated balance
      const newBalance = await this.getUserWalletBalance(userId, currencyCode);

      logger.info('Wallet top-up validated and completed:', {
        userId,
        amount,
        newBalance,
        reference,
        flwRef,
      });

      return {
        success: true,
        transaction: {
          id: transaction.id,
          amount,
          currency_code: currencyCode,
          reference,
          created_at: transaction.created_at,
        },
        newBalance,
      };
    } catch (error: any) {
      logger.error('Validate top-up error:', error);
      return {
        success: false,
        message: error.message || 'Validation failed',
      };
    }
  }

  /**
   * Get user's current wallet balance
   */
  async getUserWalletBalance(userId: string, currencyCode: string): Promise<number> {
    try {
      // Calculate balance from all transactions
      const { data: transactions, error } = await supabase
        .from('wallet_transactions')
        .select('amount, transaction_type')
        .eq('user_id', userId)
        .eq('currency_code', currencyCode)
        .eq('status', 'completed');

      if (error) {
        logger.error('Get wallet balance error:', error);
        return 0;
      }

      let balance = 0;
      transactions?.forEach(transaction => {
        if (transaction.transaction_type === 'credit' || transaction.transaction_type === 'refund') {
          balance += parseFloat(transaction.amount);
        } else if (transaction.transaction_type === 'debit' || transaction.transaction_type === 'hold') {
          balance -= parseFloat(transaction.amount);
        }
      });

      return Math.max(0, balance); // Never return negative balance
    } catch (error) {
      logger.error('Get wallet balance error:', error);
      return 0;
    }
  }

  /**
   * Check if user has sufficient balance for hold
   */
  async checkSufficientBalance(userId: string, amount: number, currencyCode: string): Promise<{
    sufficient: boolean;
    currentBalance: number;
    required: number;
  }> {
    const currentBalance = await this.getUserWalletBalance(userId, currencyCode);
    
    return {
      sufficient: currentBalance >= amount,
      currentBalance,
      required: amount,
    };
  }

  /**
   * Create payment hold for ride booking with balance verification
   */
  async createRidePaymentHold(params: {
    userId: string;
    amount: number;
    currencyCode: string;
    description: string;
  }): Promise<PaymentHoldResult> {
    try {
      const { userId, amount, currencyCode, description } = params;

      // Check wallet balance first
      const balanceCheck = await this.checkSufficientBalance(userId, amount, currencyCode);
      
      if (!balanceCheck.sufficient) {
        logger.warn('Insufficient wallet balance:', {
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
          amount: amount,
          currency_code: currencyCode,
          status: 'pending', // Changed from 'completed' to 'pending'
          description: description,
          reference: reference,
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
        return {
          status: 'failed',
          message: 'Failed to create payment hold',
          errorCode: 'PAYMENT_HOLD_FAILED',
        };
      }

      // Update hold status to completed after successful creation
      await supabase
        .from('wallet_transactions')
        .update({ status: 'completed' })
        .eq('id', holdTransaction.id);

      logger.info('Payment hold created successfully:', {
        userId,
        amount,
        reference,
        balanceBefore: balanceCheck.currentBalance,
        balanceAfter: balanceCheck.currentBalance - amount,
      });

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
   * Release payment hold (for cancelled rides) - Updated version
   */
  async releasePaymentHold(params: {
    holdId: string;
    reason: string;
    metadata?: any;
  }): Promise<{ success: boolean; message: string; refundId?: string }> {
    try {
      const { holdId, reason, metadata } = params;

      // Get hold transaction details
      const { data: holdTransaction, error: fetchError } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount, currency_code, status, reference')
        .eq('id', holdId)
        .eq('transaction_type', 'hold')
        .single();

      if (fetchError || !holdTransaction) {
        return {
          success: false,
          message: 'Hold transaction not found',
        };
      }

      if (holdTransaction.status !== 'completed') {
        return {
          success: false,
          message: 'Hold transaction is not in completed status',
        };
      }

      // Create refund transaction
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
        return {
          success: false,
          message: 'Failed to create refund transaction',
        };
      }

      logger.info('Payment hold released successfully:', {
        holdId,
        refundId: refundTransaction.id,
        amount: holdTransaction.amount,
        reason,
      });

      return {
        success: true,
        message: 'Payment hold released successfully',
        refundId: refundTransaction.id,
      };
    } catch (error: any) {
      logger.error('Release payment hold error:', error);
      return {
        success: false,
        message: 'Failed to release payment hold',
      };
    }
  }

  /**
   * Convert hold to actual payment (when ride completes)
   */
  async convertHoldToPayment(params: {
    holdId: string;
    actualAmount?: number;
    description: string;
    metadata?: any;
  }): Promise<{ success: boolean; message: string; paymentId?: string }> {
    try {
      const { holdId, actualAmount, description, metadata } = params;

      // Get hold transaction details
      const { data: holdTransaction, error: fetchError } = await supabase
        .from('wallet_transactions')
        .select('user_id, amount, currency_code, status')
        .eq('id', holdId)
        .eq('transaction_type', 'hold')
        .single();

      if (fetchError || !holdTransaction) {
        return {
          success: false,
          message: 'Hold transaction not found',
        };
      }

      const paymentAmount = actualAmount || holdTransaction.amount;
      const refundAmount = holdTransaction.amount - paymentAmount;

      // Create payment transaction
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
        return {
          success: false,
          message: 'Failed to create payment transaction',
        };
      }

      // Create refund for difference if any
      if (refundAmount > 0) {
        const refundReference = `refund_${Date.now()}_${holdTransaction.user_id}`;

        await supabase
          .from('wallet_transactions')
          .insert({
            user_id: holdTransaction.user_id,
            transaction_type: 'refund',
            amount: refundAmount,
            currency_code: holdTransaction.currency_code,
            status: 'completed',
            description: `Refund for overpayment on ride`,
            reference: refundReference,
            metadata: {
              refund_type: 'overpayment',
              original_hold_id: holdId,
              payment_id: paymentTransaction.id,
              created_at: new Date().toISOString(),
            },
          });
      }

      logger.info('Hold converted to payment successfully:', {
        holdId,
        paymentId: paymentTransaction.id,
        holdAmount: holdTransaction.amount,
        paymentAmount,
        refundAmount,
      });

      return {
        success: true,
        message: 'Hold converted to payment successfully',
        paymentId: paymentTransaction.id,
      };
    } catch (error: any) {
      logger.error('Convert hold to payment error:', error);
      return {
        success: false,
        message: 'Failed to convert hold to payment',
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
