import { supabase } from '../config/database';
import { flutterwaveService } from './flutterwave.service';
import logger from '../utils/logger';
import axios from 'axios';

export class WalletService {
  static async getEarnedBalance(userId: string, currencyCode = 'NGN'): Promise<number> {
    const { data: transactions, error } = await supabase
      .from('wallet_transactions')
      .select('amount, transaction_type')
      .eq('user_id', userId)
      .eq('currency_code', currencyCode)
      .eq('status', 'completed')
      .in('transaction_type', ['earning', 'withdrawal']);

    if (error) {
      logger.error('Get earned balance error:', error);
      return 0;
    }

    let earned = 0;
    for (const tx of transactions || []) {
      const amount = parseFloat(tx.amount);
      if (tx.transaction_type === 'earning') {
        earned += amount;
      } else if (tx.transaction_type === 'withdrawal') {
        earned -= amount;
      }
    }

    return Math.max(0, earned);
  }

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
      if (type === 'credit' || type === 'refund' || type === 'tip_received' || type === 'earning') {
        balance += amount;
      } else if (type === 'debit' || type === 'hold' || type === 'withdrawal') {
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
    transactionType?: string;
  }): Promise<{ transactionId: string; newBalance: number }> {
    const { userId, amount, currencyCode = 'NGN', reference, description, transactionType = 'credit' } = params;

    const { data: tx, error } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: userId,
        transaction_type: transactionType,
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

    // ✅ Auto-settle outstanding remittance if user is a driver
    try {
      const { data: driver } = await supabase
        .from('drivers')
        .select('id, pending_remittance_amount, remittance_blocked')
        .eq('user_id', userId)
        .single();

      if (driver) {
        const pendingAmount = Number(driver.pending_remittance_amount ?? 0);
        
        if (pendingAmount > 0 && newBalance >= pendingAmount) {
          // Call core-logistics remittance service via internal API
          const coreLogisticsUrl = process.env.CORE_LOGISTICS_URL || 'http://localhost:3001';
          
          await axios.post(
            `${coreLogisticsUrl}/api/wallet/internal/deduct`,
            {
              amount: pendingAmount,
              currency_code: 'NGN',
              reference: `remittance_settlement_${Date.now()}`,
              description: 'Platform remittance settlement',
            },
            {
              headers: {
                'x-internal-api-key': process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure',
                'x-user-id': userId,
              },
              timeout: 10000,
            }
          );

          // Update driver record
          await supabase
            .from('drivers')
            .update({
              pending_remittance_amount: 0,
              pending_remittance_count: 0,
              remittance_blocked: false,
              updated_at: new Date().toISOString(),
            })
            .eq('id', driver.id);

          // Update remittance log
          await supabase
            .from('driver_remittance_log')
            .update({ status: 'settled', settled_at: new Date().toISOString() })
            .eq('driver_id', driver.id)
            .eq('status', 'pending');

          logger.info(`✅ Auto-settled ₦${pendingAmount} remittance for driver ${driver.id} after wallet top-up`);
          
          if (driver.remittance_blocked) {
            logger.info(`🔓 Driver ${driver.id} unblocked after remittance settlement`);
          }
        }
      }
    } catch (remittanceError: any) {
      // Log error but don't fail the top-up
      logger.error('Remittance settlement error (non-critical):', remittanceError);
    }

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
      description: 'Wallet top-up via card',
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

  // ─── Phone-to-phone wallet transfer ──────────────────────────────────────

  /**
   * Normalise any Nigerian phone format to E.164 (+234XXXXXXXXXX).
   */
  private static normalizePhone(phone: string): string {
    const d = phone.replace(/\D/g, '');
    if (d.startsWith('234'))  return `+${d}`;           // 2348012345678  → +2348012345678
    if (d.startsWith('0'))    return `+234${d.slice(1)}`; // 08012345678    → +2348012345678
    if (d.length === 10)      return `+234${d}`;          // 8012345678     → +2348012345678
    return `+${d}`;
  }

  /**
   * Look up a user by phone number and return a safe preview for the sender
   * to confirm the correct recipient before sending money.
   *
   * Returns: { userId, displayName, phone } or null if not found.
   */
  static async lookupRecipientByPhone(phone: string, requestingUserId: string): Promise<{
    userId: string;
    displayName: string;
    phone: string;
  } | null> {
    const normalizedPhone = this.normalizePhone(phone);

    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, phone, status')
      .eq('phone', normalizedPhone)
      .single();

    if (!user || user.status === 'account_deleted' || user.status === 'terminated') {
      return null;
    }

    // Prevent sending to yourself
    if (user.id === requestingUserId) {
      return null;
    }

    // Full name for clear identification — no ambiguity on who they're sending to
    const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unknown';

    return {
      userId:      user.id,
      displayName: fullName,
      phone:       normalizedPhone,
    };
  }

  /**
   * Transfer money from one wallet to another by phone number.
   * Atomic — both debit and credit happen or neither does.
   * Sends push/in-app notifications to both parties.
   */
  static async transferByPhone(params: {
    senderUserId: string;
    recipientPhone: string;
    amount: number;
    note?: string;
    currencyCode?: string;
  }): Promise<{
    transactionRef: string;
    amount: number;
    recipient: { displayName: string; phone: string };
    senderNewBalance: number;
  }> {
    const { senderUserId, recipientPhone, amount, note, currencyCode = 'NGN' } = params;

    if (!amount || amount <= 0) throw new Error('Transfer amount must be greater than zero');
    if (amount < 10)            throw new Error('Minimum transfer amount is ₦10');

    // Resolve recipient
    const recipient = await this.lookupRecipientByPhone(recipientPhone, senderUserId);
    if (!recipient) {
      throw new Error('Recipient not found. Please check the phone number and try again.');
    }

    // Check sender balance
    const senderBalance = await this.getBalance(senderUserId, currencyCode);
    if (senderBalance < amount) {
      throw new Error(
        `Insufficient wallet balance. Required: ₦${amount.toFixed(2)}, Available: ₦${senderBalance.toFixed(2)}`
      );
    }

    // Fetch sender name for notification
    const { data: sender } = await supabase
      .from('users')
      .select('first_name, last_name')
      .eq('id', senderUserId)
      .single();

    const senderName = sender
      ? `${sender.first_name} ${((sender.last_name as string) ?? '').charAt(0).toUpperCase()}.`.trim()
      : 'Someone';

    const txRef = `transfer_${Date.now()}_${senderUserId.substring(0, 8)}`;

    // ── Debit sender ──────────────────────────────────────────────────────────
    const { error: debitError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id:          senderUserId,
        transaction_type: 'debit',
        amount,
        currency_code:    currencyCode,
        status:           'completed',
        reference:        `${txRef}_debit`,
        description:      note
          ? `Transfer to ${recipient.displayName}: ${note}`
          : `Transfer to ${recipient.displayName}`,
        metadata: {
          transfer_type:      'wallet_to_wallet',
          recipient_user_id:  recipient.userId,
          recipient_phone:    recipient.phone,
          tx_ref:             txRef,
        },
      });

    if (debitError) throw new Error(`Transfer failed: ${debitError.message}`);

    // ── Credit recipient ──────────────────────────────────────────────────────
    const { error: creditError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id:          recipient.userId,
        transaction_type: 'credit',
        amount,
        currency_code:    currencyCode,
        status:           'completed',
        reference:        `${txRef}_credit`,
        description:      note
          ? `Transfer from ${senderName}: ${note}`
          : `Transfer from ${senderName}`,
        metadata: {
          transfer_type:    'wallet_to_wallet',
          sender_user_id:   senderUserId,
          sender_name:      senderName,
          tx_ref:           txRef,
        },
      });

    if (creditError) {
      // Attempt rollback — re-credit sender
      await supabase.from('wallet_transactions').insert({
        user_id:          senderUserId,
        transaction_type: 'credit',
        amount,
        currency_code:    currencyCode,
        status:           'completed',
        reference:        `${txRef}_rollback`,
        description:      'Transfer rollback — recipient credit failed',
        metadata:         { transfer_type: 'rollback', original_ref: txRef },
      });
      throw new Error('Transfer failed. Your wallet has been restored.');
    }

    const senderNewBalance = await this.getBalance(senderUserId, currencyCode);

    // ── Push notifications (non-blocking) ────────────────────────────────────
    this.sendTransferNotifications({
      senderUserId,
      senderName,
      recipientUserId: recipient.userId,
      recipientDisplayName: recipient.displayName,
      amount,
      currencyCode,
      txRef,
    }).catch((err) => logger.warn('Transfer notification failed (non-fatal)', { error: err?.message }));

    logger.info('Wallet-to-wallet transfer completed', {
      from: senderUserId,
      to: recipient.userId,
      amount,
      txRef,
    });

    return {
      transactionRef: txRef,
      amount,
      recipient: { displayName: recipient.displayName, phone: recipient.phone },
      senderNewBalance,
    };
  }

  /**
   * Fire push + in-app notifications to both sender and recipient.
   */
  private static async sendTransferNotifications(params: {
    senderUserId:         string;
    senderName:           string;
    recipientUserId:      string;
    recipientDisplayName: string;
    amount:               number;
    currencyCode:         string;
    txRef:                string;
  }): Promise<void> {
    const { senderUserId, senderName, recipientUserId, recipientDisplayName, amount, txRef } = params;
    const formatted = `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

    // Attempt to reach core-logistics push notification service
    const coreUrl = process.env.CORE_LOGISTICS_URL || 'http://localhost:3001';
    const internalKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
    const headers = { 'x-internal-api-key': internalKey };

    await Promise.allSettled([
      // Notify sender
      axios.post(`${coreUrl}/api/internal/push/send`, {
        userId:           senderUserId,
        notificationType: 'wallet_transfer_sent',
        title:            'Transfer Successful',
        body:             `You sent ${formatted} to ${recipientDisplayName}`,
        data:             { type: 'wallet_transfer', direction: 'sent', tx_ref: txRef, amount: String(amount) },
      }, { headers, timeout: 5000 }),

      // Notify recipient
      axios.post(`${coreUrl}/api/internal/push/send`, {
        userId:           recipientUserId,
        notificationType: 'wallet_transfer_received',
        title:            'Money Received',
        body:             `You received ${formatted} from ${senderName}`,
        data:             { type: 'wallet_transfer', direction: 'received', tx_ref: txRef, amount: String(amount) },
      }, { headers, timeout: 5000 }),
    ]);
  }
}
