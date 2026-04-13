import axios from 'axios';
import { supabase } from '../config/database';
import { WalletService } from './wallet.service';
import { OrderService } from './order.service';
import config from '../config';
import logger from '../utils/logger';

const PAYMENT_URL = () => config.services.payment;
const INTERNAL_HEADERS = () => ({
  'x-internal-api-key': config.internalApiKey,
  'Content-Type': 'application/json',
});

async function callPaymentService(path: string, body: any): Promise<any> {
  const res = await axios.post(`${PAYMENT_URL()}${path}`, body, {
    headers: INTERNAL_HEADERS(),
    timeout: 30000,
  });
  return res.data?.data;
}

export class FoodPaymentService {
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
      token?: string;
      pin?: string;
    };
  }) {
    const { orderId, customerId, paymentMethod, paymentDetails } = params;

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
      const balanceBefore = await WalletService.getBalance(customerId);
      if (balanceBefore < amount) {
        throw new Error(`Insufficient wallet balance. Required: ₦${amount.toFixed(2)}, Available: ₦${balanceBefore.toFixed(2)}`);
      }

      const { transactionId: walletTxId, newBalance: balanceAfter } = await WalletService.deduct({
        userId: customerId,
        amount,
        reference: txRef,
        description: 'Food order payment',
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

    if (!paymentDetails) throw new Error('paymentDetails are required for card payment');

    // Tokenized card (saved card) — delegate to payment-service
    if (paymentDetails.token) {
      const chargeRes = await callPaymentService('/api/internal/payment/flutterwave/charge-tokenized', {
        token: paymentDetails.token,
        currency: 'NGN',
        amount,
        email: paymentDetails.email || '',
        tx_ref: txRef,
      });

      if (chargeRes?.status === 'success' && chargeRes?.data?.status === 'successful') {
        await this.markOrderPaid(orderId, chargeRes.data.id, txRef, amount);
        return { status: 'successful', payment_method: 'card', amount, transaction_id: chargeRes.data.id };
      }

      throw new Error(chargeRes?.message || 'Card charge failed');
    }

    // New card charge — delegate to payment-service
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

    const chargeRes = await callPaymentService('/api/internal/payment/flutterwave/charge-card', chargePayload);

    if (chargeRes?.meta?.authorization?.mode === 'otp' || chargeRes?.data?.status === 'pending') {
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

    if (chargeRes?.status === 'success' && chargeRes?.data?.status === 'successful') {
      await this.markOrderPaid(orderId, chargeRes.data.id, txRef, amount);
      return { status: 'successful', payment_method: 'card', amount, transaction_id: chargeRes.data.id };
    }

    throw new Error(chargeRes?.message || 'Card charge failed');
  }

  static async validateOtp(params: {
    orderId: string;
    customerId: string;
    flwRef: string;
    otp: string;
  }) {
    const { orderId, customerId, flwRef, otp } = params;

    const { data: order, error } = await supabase
      .from('food_orders')
      .select('id, customer_id, total_amount, payment_status, flw_ref')
      .eq('id', orderId)
      .single();

    if (error || !order) throw new Error('Order not found');
    if (order.customer_id !== customerId) throw new Error('Unauthorized');
    if (order.payment_status === 'paid') throw new Error('Order is already paid');

    const validateRes = await callPaymentService('/api/internal/payment/flutterwave/validate-charge', {
      flw_ref: flwRef,
      otp,
    });

    if (validateRes?.status === 'success' && validateRes?.data?.status === 'successful') {
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

    throw new Error(validateRes?.message || 'OTP validation failed');
  }

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
      await callPaymentService('/api/internal/payment/flutterwave/refund', {
        transaction_id: order.flw_transaction_id,
        amount,
      });
    }

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
