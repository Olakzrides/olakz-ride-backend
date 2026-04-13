import { supabase } from '../config/database';
import { flutterwaveService } from './flutterwave.service';
import logger from '../utils/logger';

export class WalletService {
  static async getBalance(userId: string, currencyCode = 'NGN'): Promise<number> {
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
    for (const tx of transactions || []) {
      const amount = parseFloat(tx.amount);
      const type = tx.transaction_type;
      if (type === 'credit' || type === 'refund' || type === 'tip_received') {
        balance += amount;
      } else if (type === 'debit' || type === 'hold') {
        balance -= amount;
      } else if (type === 'tip_payment') {
        balance += amount;
      }
    }

    return Math.max(0, balance);
  }

  static async deduct(params: {
    userId: string;
    amount: number;
    currencyCode?: string;
    reference: string;
    description: string;
  }): Promise<{ transactionId: string; newBalance: number }> {
    const { userId, amount, currencyCode = 'NGN', reference, description } = params;

    const currentBalance = await this.getBalance(userId, currencyCode);
    if (currentBalance < amount) {
      throw new Error(`Insufficient wallet balance. Required: ₦${amount.toFixed(2)}, Available: ₦${currentBalance.toFixed(2)}`);
    }

    const { data: tx, error } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        transaction_type: 'debit',
        amount,
        currency_code: currencyCode,
        status: 'completed',
        description,
        reference,
        metadata: { deducted_by: 'payment-service', deducted_at: new Date().toISOString() },
      })
      .select()
      .single();

    if (error) throw new Error('Failed to deduct from wallet');

    const newBalance = await this.getBalance(userId, currencyCode);
    logger.info('Wallet deducted', { userId, amount, reference, newBalance });

    return { transactionId: tx.id, newBalance };
  }

  static async credit(params: {
    userId: string;
    amount: number;
    currencyCode?: string;
    reference: string;
    description: string;
  }): Promise<{ transactionId: string; newBalance: number }> {
    const { userId, amount, currencyCode = 'NGN', reference, description } = params;

    const { data: tx, error } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        transaction_type: 'credit',
        amount,
        currency_code: currencyCode,
        status: 'completed',
        description,
        reference,
        metadata: { credited_by: 'payment-service', credited_at: new Date().toISOString() },
      })
      .select()
      .single();

    if (error) throw new Error('Failed to credit wallet');

    const newBalance = await this.getBalance(userId, currencyCode);
    logger.info('Wallet credited', { userId, amount, reference, newBalance });

    return { transactionId: tx.id, newBalance };
  }

  static async topupViaCard(params: {
    userId: string;
    userEmail: string;
    amount: number;
    currencyCode?: string;
    cardId?: string;
    cardDetails?: {
      cardNumber: string;
      cvv: string;
      expiryMonth: string;
      expiryYear: string;
      cardholderName?: string;
      pin?: string;
    };
  }) {
    const { userId, userEmail, amount, currencyCode = 'NGN', cardId, cardDetails } = params;

    if (!cardId && !cardDetails) {
      return { success: false, message: 'Payment method required' };
    }

    const txRef = `topup_${userId}_${Date.now()}`;
    let chargeResult: any;

    if (cardId) {
      const { data: card } = await supabase
        .from('payment_cards')
        .select('*')
        .eq('id', cardId)
        .eq('user_id', userId)
        .single();

      if (!card) return { success: false, message: 'Card not found' };

      chargeResult = await flutterwaveService.chargeTokenizedCard({
        token: card.card_token,
        currency: currencyCode,
        amount,
        email: card.metadata?.customer_email || userEmail,
        tx_ref: txRef,
        country: card.country_code || 'NG',
      });
    } else if (cardDetails) {
      chargeResult = await flutterwaveService.tokenizeCard({
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
    }

    if (chargeResult.status !== 'success') {
      return { success: false, message: chargeResult.message || 'Payment failed' };
    }

    if (chargeResult.data?.status === 'pending') {
      return {
        success: true,
        requiresAuthorization: true,
        authorization: chargeResult.data.authorization,
        flw_ref: chargeResult.data.flw_ref,
        tx_ref: chargeResult.data.tx_ref,
        message: 'Charge initiated. Please validate with OTP.',
      };
    }

    if (chargeResult.data?.status !== 'successful') {
      return { success: false, message: chargeResult.message || 'Payment not completed' };
    }

    const reference = `topup_${Date.now()}_${userId}`;
    const { transactionId, newBalance } = await this.credit({
      userId,
      amount,
      currencyCode,
      reference,
      description: 'Wallet top-up via card',
    });

    return {
      success: true,
      transaction: { id: transactionId, amount, currency_code: currencyCode, reference },
      newBalance,
    };
  }

  static async validateTopup(params: {
    userId: string;
    flwRef: string;
    otp: string;
    amount: number;
    currencyCode?: string;
  }) {
    const { userId, flwRef, otp, amount, currencyCode = 'NGN' } = params;

    const validationResult = await flutterwaveService.validateCharge(flwRef, otp);

    if (validationResult.status !== 'success' || validationResult.data?.status !== 'successful') {
      return { success: false, message: validationResult.message || 'Validation failed' };
    }

    const reference = `topup_${Date.now()}_${userId}`;
    const { transactionId, newBalance } = await this.credit({
      userId,
      amount,
      currencyCode,
      reference,
      description: 'Wallet top-up via card (OTP validated)',
    });

    return {
      success: true,
      transaction: { id: transactionId, amount, currency_code: currencyCode, reference },
      newBalance,
    };
  }

  static async getTransactionHistory(userId: string, page = 1, limit = 10) {
    const offset = (page - 1) * limit;

    const { count } = await supabase
      .from('wallet_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return { transactions: data || [], total: count || 0 };
  }
}
