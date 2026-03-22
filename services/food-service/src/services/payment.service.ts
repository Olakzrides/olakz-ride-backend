import { supabase } from '../config/database';
import { foodFlutterwaveService } from './flutterwave.service';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import logger from '../utils/logger';

/**
 * FoodPaymentService — Phase 3
 * Handles card payment processing, OTP validation, and manual refunds.
 */
export class FoodPaymentService {
  /**
   * POST /api/food/payment/process
   *
   * Processes payment for an existing order (payment_method: card).
   * - If card requires OTP → returns { status: 'pending_authorization', flw_ref, ... }
   * - If charge succeeds immediately → marks order as paid
   */
  static async processPayment(params: {
    orderId: string;
    customerId: string;
    paymentMethod: 'card' | 'wallet';
    paymentDetails?: {
      card_number?: string;
      cvv?: string;
      expiry_month?: string;
      expiry_year?: string;
      fullname?: string;
      email?: string;
      token?: string; // tokenized card
      pin?: string;
    };
  }) {
    const { orderId, customerId, paymentMethod, paymentDetails } = params;

    // Fetch order
    const { data: order, error } = await supabase
      .from('food_orders')
      .select('id, customer_id, total_amount, payment_status, payment_method, status, restaurant_id')
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Order not found');
    if (order.customer_id !== customerId) throw new Error('Unauthorized');
    if (order.payment_status === 'paid') throw new Error('Order is already paid');
    if (order.status === 'cancelled') throw new Error('Cannot pay for a cancelled order');

    const amount = parseFloat(order.total_amount);
    const txRef = `food_pay_${orderId}_${Date.now()}`;

    if (paymentMethod === 'wallet') {
      // Wallet payment path
      const balanceBefore = await WalletService.getBalance(customerId);
      if (balanceBefore < amount) {
        throw new Error(`Insufficient wallet balance. Required: ₦${amount.toFixed(2)}, Available: ₦${balanceBefore.toFixed(2)}`);
      }

      const { transactionId: walletTxId, newBalance: balanceAfter } = await WalletService.deduct({
        userId: customerId,
        amount,
        reference: txRef,
        description: `Food order payment`,
      });

      await supabase
        .from('food_orders')
        .update({
          payment_status: 'paid',
          payment_method: 'wallet',
          wallet_transaction_id: walletTxId,
          wallet_balance_before: balanceBefore,
          wallet_balance_after: balanceAfter,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      logger.info('Food order paid via wallet', { orderId, customerId, amount });
      return { status: 'successful', payment_method: 'wallet', amount };
    }

    // Card payment path
    if (!paymentDetails) throw new Error('paymentDetails are required for card payment');

    // Tokenized card (saved card)
    if (paymentDetails.token) {
      const chargeRes = await foodFlutterwaveService.chargeTokenizedCard({
        token: paymentDetails.token,
        currency: 'NGN',
        amount,
        email: paymentDetails.email || '',
        tx_ref: txRef,
      });

      if (chargeRes.status === 'success' && chargeRes.data?.status === 'successful') {
        await this.markOrderPaid(orderId, chargeRes.data.id, txRef, amount);
        return { status: 'successful', payment_method: 'card', amount, transaction_id: chargeRes.data.id };
      }

      throw new Error(chargeRes.message || 'Card charge failed');
    }

    // New card charge
    const chargePayload: any = {
      card_number: paymentDetails.card_number,
      cvv: paymentDetails.cvv,
      expiry_month: paymentDetails.expiry_month,
      expiry_year: paymentDetails.expiry_year,
      amount,
      currency: 'NGN',
      email: paymentDetails.email || '',
      fullname: paymentDetails.fullname,
      tx_ref: txRef,
    };

    if (paymentDetails.pin) {
      chargePayload.authorization = { mode: 'pin', pin: paymentDetails.pin };
    }

    const chargeRes = await foodFlutterwaveService.chargeCard(chargePayload);

    // OTP / PIN required
    if (chargeRes.meta?.authorization?.mode === 'otp' || chargeRes.data?.status === 'pending') {
      // Store pending payment reference on order
      await supabase
        .from('food_orders')
        .update({
          flw_ref: chargeRes.data?.flw_ref || chargeRes.meta?.flw_ref,
          flw_tx_ref: txRef,
          updated_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      return {
        status: 'pending_authorization',
        message: 'OTP required to complete payment',
        flw_ref: chargeRes.data?.flw_ref || chargeRes.meta?.flw_ref,
        tx_ref: txRef,
        authorization_mode: chargeRes.meta?.authorization?.mode || 'otp',
      };
    }

    // Immediate success
    if (chargeRes.status === 'success' && chargeRes.data?.status === 'successful') {
      await this.markOrderPaid(orderId, chargeRes.data.id, txRef, amount);
      return { status: 'successful', payment_method: 'card', amount, transaction_id: chargeRes.data.id };
    }

    throw new Error(chargeRes.message || 'Card charge failed');
  }

  /**
   * POST /api/food/payment/validate-otp
   *
   * Validates OTP for a pending card charge.
   * On success → marks order as paid.
   */
  static async validateOtp(params: {
    orderId: string;
    customerId: string;
    flwRef: string;
    otp: string;
  }) {
    const { orderId, customerId, flwRef, otp } = params;

    // Verify order ownership
    const { data: order, error } = await supabase
      .from('food_orders')
      .select('id, customer_id, total_amount, payment_status, flw_ref')
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Order not found');
    if (order.customer_id !== customerId) throw new Error('Unauthorized');
    if (order.payment_status === 'paid') throw new Error('Order is already paid');

    const validateRes = await foodFlutterwaveService.validateCharge(flwRef, otp);

    if (validateRes.status === 'success' && validateRes.data?.status === 'successful') {
      const amount = parseFloat(order.total_amount);
      await this.markOrderPaid(orderId, validateRes.data.id, validateRes.data.tx_ref, amount);

      logger.info('OTP validated, order paid', { orderId, customerId });
      return {
        status: 'successful',
        message: 'Payment completed successfully',
        transaction_id: validateRes.data.id,
        amount,
      };
    }

    throw new Error(validateRes.message || 'OTP validation failed');
  }

  /**
   * POST /api/food/payment/refund
   *
   * Manual refund for an order (admin or system-triggered).
   * - Wallet orders → credit wallet
   * - Card orders → Flutterwave refund
   */
  static async refundOrder(params: {
    orderId: string;
    requesterId: string;
    refundReason: string;
  }) {
    const { orderId, requesterId, refundReason } = params;

    const { data: order, error } = await supabase
      .from('food_orders')
      .select('id, customer_id, total_amount, payment_status, payment_method, flw_transaction_id, status')
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Order not found');
    if (order.payment_status !== 'paid') throw new Error('Order is not in a paid state');
    if (order.payment_status === 'refunded') throw new Error('Order has already been refunded');

    const amount = parseFloat(order.total_amount);

    if (order.payment_method === 'wallet') {
      const refundRef = `refund_${orderId}_${Date.now()}`;
      await WalletService.credit({
        userId: order.customer_id,
        amount,
        reference: refundRef,
        description: `Refund for food order: ${refundReason}`,
      });
    } else if (order.payment_method === 'card') {
      if (!order.flw_transaction_id) throw new Error('No Flutterwave transaction ID found for this order');
      await foodFlutterwaveService.refundTransaction(order.flw_transaction_id, amount);
    }

    // Update order
    await supabase
      .from('food_orders')
      .update({
        payment_status: 'refunded',
        status: order.status !== 'cancelled' ? 'cancelled' : order.status,
        cancellation_reason: refundReason,
        cancelled_by: 'system',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    await OrderService.recordStatusChange(orderId, 'cancelled', order.status, requesterId, 'system', refundReason);

    logger.info('Order refunded', { orderId, amount, method: order.payment_method });
    return { success: true, refunded_amount: amount, payment_method: order.payment_method };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private static async markOrderPaid(
    orderId: string,
    flwTransactionId: number | string,
    txRef: string,
    amount: number
  ) {
    await supabase
      .from('food_orders')
      .update({
        payment_status: 'paid',
        flw_transaction_id: String(flwTransactionId),
        flw_tx_ref: txRef,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    logger.info('Order marked as paid', { orderId, flwTransactionId, amount });
  }
}
