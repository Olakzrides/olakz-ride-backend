import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { PaymentService } from '../../../services/payment.service';
import { FlutterwaveService } from '../../../services/flutterwave.service';

export interface DeliveryPaymentResult {
  success: boolean;
  message: string;
  paymentId?: string;
  holdId?: string;
  requiresAuthorization?: boolean;
  authorization?: any;
  flw_ref?: string;
  tx_ref?: string;
}

/**
 * DeliveryPaymentService
 * Handles payment processing for deliveries
 * Supports: Wallet, Card, Cash
 */
export class DeliveryPaymentService {
  private paymentService: PaymentService;
  private flutterwaveService: FlutterwaveService;

  constructor() {
    this.paymentService = new PaymentService();
    this.flutterwaveService = new FlutterwaveService();
  }

  /**
   * Process delivery payment based on payment method
   */
  async processDeliveryPayment(params: {
    deliveryId: string;
    customerId: string;
    customerEmail: string;
    amount: number;
    currencyCode: string;
    paymentMethod: 'wallet' | 'card' | 'cash';
    cardId?: string;
    cardDetails?: {
      cardNumber: string;
      cvv: string;
      expiryMonth: string;
      expiryYear: string;
      cardholderName?: string;
      pin?: string;
    };
  }): Promise<DeliveryPaymentResult> {
    const { deliveryId, customerId, customerEmail, amount, currencyCode, paymentMethod, cardId, cardDetails } = params;

    try {
      switch (paymentMethod) {
        case 'wallet':
          return await this.processWalletPayment({
            deliveryId,
            customerId,
            amount,
            currencyCode,
          });

        case 'card':
          return await this.processCardPayment({
            deliveryId,
            customerId,
            customerEmail,
            amount,
            currencyCode,
            cardId,
            cardDetails,
          });

        case 'cash':
          return await this.processCashPayment({
            deliveryId,
            customerId,
            amount,
            currencyCode,
          });

        default:
          return {
            success: false,
            message: 'Invalid payment method',
          };
      }
    } catch (error: any) {
      logger.error('Process delivery payment error:', error);
      return {
        success: false,
        message: error.message || 'Payment processing failed',
      };
    }
  }

  /**
   * Process wallet payment (immediate charge)
   */
  private async processWalletPayment(params: {
    deliveryId: string;
    customerId: string;
    amount: number;
    currencyCode: string;
  }): Promise<DeliveryPaymentResult> {
    try {
      const { deliveryId, customerId, amount, currencyCode } = params;

      // Check wallet balance
      const balanceCheck = await this.paymentService.checkSufficientBalance(
        customerId,
        amount,
        currencyCode
      );

      if (!balanceCheck.sufficient) {
        logger.warn('Insufficient wallet balance for delivery:', {
          customerId,
          deliveryId,
          required: amount,
          available: balanceCheck.currentBalance,
        });

        return {
          success: false,
          message: `Insufficient wallet balance. Required: ${amount} ${currencyCode}, Available: ${balanceCheck.currentBalance} ${currencyCode}`,
        };
      }

      // Create debit transaction immediately
      const reference = `delivery_${deliveryId}_${Date.now()}`;

      const { data: transaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: customerId,
          transaction_type: 'debit',
          amount: amount,
          currency_code: currencyCode,
          status: 'completed',
          description: `Delivery payment - ${deliveryId}`,
          reference,
          metadata: {
            payment_type: 'delivery',
            delivery_id: deliveryId,
            balance_before: balanceCheck.currentBalance,
            charged_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create wallet debit transaction error:', error);
        return {
          success: false,
          message: 'Failed to process wallet payment',
        };
      }

      // Update delivery payment status
      await supabase
        .from('deliveries')
        .update({
          payment_status: 'paid',
          payment_transaction_id: transaction.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      logger.info('Wallet payment processed successfully:', {
        deliveryId,
        customerId,
        amount,
        transactionId: transaction.id,
        reference,
      });

      return {
        success: true,
        message: 'Wallet payment processed successfully',
        paymentId: transaction.id,
      };
    } catch (error: any) {
      logger.error('Process wallet payment error:', error);
      return {
        success: false,
        message: error.message || 'Wallet payment failed',
      };
    }
  }

  /**
   * Process card payment (immediate charge)
   */
  private async processCardPayment(params: {
    deliveryId: string;
    customerId: string;
    customerEmail: string;
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
  }): Promise<DeliveryPaymentResult> {
    try {
      const { deliveryId, customerId, customerEmail, amount, currencyCode, cardId, cardDetails } = params;

      const txRef = `delivery_${deliveryId}_${Date.now()}`;
      let chargeResult: any;

      if (cardId) {
        // Charge saved card
        const PaymentCardsService = (await import('../../../services/payment-cards.service')).PaymentCardsService;
        const paymentCardsService = new PaymentCardsService();

        chargeResult = await paymentCardsService.chargeCard({
          cardId,
          userId: customerId,
          amount,
          currency: currencyCode,
          email: customerEmail,
          txRef,
        });
      } else if (cardDetails) {
        // Charge new card
        chargeResult = await this.flutterwaveService.tokenizeCard({
          card_number: cardDetails.cardNumber,
          cvv: cardDetails.cvv,
          expiry_month: cardDetails.expiryMonth,
          expiry_year: cardDetails.expiryYear,
          currency: currencyCode,
          amount,
          email: customerEmail,
          fullname: cardDetails.cardholderName,
          tx_ref: txRef,
          authorization: cardDetails.pin ? { mode: 'pin', pin: cardDetails.pin } : { mode: 'pin' },
        });
      } else {
        return {
          success: false,
          message: 'Card details or card ID required',
        };
      }

      // Check charge status
      if (chargeResult.status !== 'success') {
        return {
          success: false,
          message: chargeResult.message || 'Card payment failed',
        };
      }

      // Check if charge requires authorization (OTP, 3D Secure, etc.)
      if (chargeResult.data?.status === 'pending') {
        logger.info('Card charge requires authorization:', {
          deliveryId,
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
          message: chargeResult.message || 'Card payment not completed',
        };
      }

      // Create payment record
      const reference = `delivery_${deliveryId}_${Date.now()}`;

      const { data: transaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: customerId,
          transaction_type: 'debit',
          amount: amount,
          currency_code: currencyCode,
          status: 'completed',
          description: `Delivery payment via card - ${deliveryId}`,
          reference,
          metadata: {
            payment_type: 'delivery_card',
            delivery_id: deliveryId,
            flw_ref: chargeResult.data.flw_ref,
            payment_method: cardId ? 'saved_card' : 'new_card',
            card_last4: chargeResult.data.card?.last_4digits,
            charged_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create card payment transaction error:', error);
        return {
          success: false,
          message: 'Failed to record card payment',
        };
      }

      // Update delivery payment status
      await supabase
        .from('deliveries')
        .update({
          payment_status: 'paid',
          payment_transaction_id: transaction.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      logger.info('Card payment processed successfully:', {
        deliveryId,
        customerId,
        amount,
        transactionId: transaction.id,
        reference,
      });

      return {
        success: true,
        message: 'Card payment processed successfully',
        paymentId: transaction.id,
      };
    } catch (error: any) {
      logger.error('Process card payment error:', error);
      return {
        success: false,
        message: error.message || 'Card payment failed',
      };
    }
  }

  /**
   * Validate card payment with OTP
   */
  async validateCardPayment(params: {
    deliveryId: string;
    customerId: string;
    flwRef: string;
    otp: string;
    amount: number;
    currencyCode: string;
  }): Promise<DeliveryPaymentResult> {
    try {
      const { deliveryId, customerId, flwRef, otp, amount, currencyCode } = params;

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

      // Create payment record
      const reference = `delivery_${deliveryId}_${Date.now()}`;

      const { data: transaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: customerId,
          transaction_type: 'debit',
          amount: amount,
          currency_code: currencyCode,
          status: 'completed',
          description: `Delivery payment via card - ${deliveryId}`,
          reference,
          metadata: {
            payment_type: 'delivery_card_with_otp',
            delivery_id: deliveryId,
            flw_ref: flwRef,
            card_last4: validationResult.data.card?.last_4digits,
            charged_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create validated card payment transaction error:', error);
        return {
          success: false,
          message: 'Failed to record card payment',
        };
      }

      // Update delivery payment status
      await supabase
        .from('deliveries')
        .update({
          payment_status: 'paid',
          payment_transaction_id: transaction.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      logger.info('Card payment validated and completed:', {
        deliveryId,
        customerId,
        amount,
        transactionId: transaction.id,
        reference,
        flwRef,
      });

      return {
        success: true,
        message: 'Card payment validated and completed',
        paymentId: transaction.id,
      };
    } catch (error: any) {
      logger.error('Validate card payment error:', error);
      return {
        success: false,
        message: error.message || 'Validation failed',
      };
    }
  }

  /**
   * Process cash payment (mark as pending, paid on delivery)
   */
  private async processCashPayment(params: {
    deliveryId: string;
    customerId: string;
    amount: number;
    currencyCode: string;
  }): Promise<DeliveryPaymentResult> {
    try {
      const { deliveryId } = params;

      // Update delivery payment status to pending (will be paid on delivery)
      await supabase
        .from('deliveries')
        .update({
          payment_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      logger.info('Cash payment marked as pending:', {
        deliveryId,
      });

      return {
        success: true,
        message: 'Cash payment will be collected on delivery',
      };
    } catch (error: any) {
      logger.error('Process cash payment error:', error);
      return {
        success: false,
        message: error.message || 'Cash payment setup failed',
      };
    }
  }

  /**
   * Complete cash payment (when courier collects cash)
   */
  async completeCashPayment(params: {
    deliveryId: string;
    customerId: string;
    courierId: string;
    amount: number;
    currencyCode: string;
  }): Promise<DeliveryPaymentResult> {
    try {
      const { deliveryId, customerId, courierId, amount, currencyCode } = params;

      const reference = `delivery_cash_${deliveryId}_${Date.now()}`;

      // Create cash payment record
      const { data: transaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: customerId,
          transaction_type: 'debit',
          amount: amount,
          currency_code: currencyCode,
          status: 'completed',
          description: `Delivery cash payment - ${deliveryId}`,
          reference,
          metadata: {
            payment_type: 'delivery_cash',
            delivery_id: deliveryId,
            courier_id: courierId,
            collected_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create cash payment transaction error:', error);
        return {
          success: false,
          message: 'Failed to record cash payment',
        };
      }

      // Update delivery payment status
      await supabase
        .from('deliveries')
        .update({
          payment_status: 'paid',
          payment_transaction_id: transaction.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      logger.info('Cash payment completed:', {
        deliveryId,
        customerId,
        courierId,
        amount,
        transactionId: transaction.id,
      });

      return {
        success: true,
        message: 'Cash payment recorded successfully',
        paymentId: transaction.id,
      };
    } catch (error: any) {
      logger.error('Complete cash payment error:', error);
      return {
        success: false,
        message: error.message || 'Cash payment completion failed',
      };
    }
  }

  /**
   * Refund delivery payment (for cancellations)
   */
  async refundDeliveryPayment(params: {
    deliveryId: string;
    customerId: string;
    amount: number;
    currencyCode: string;
    reason: string;
  }): Promise<DeliveryPaymentResult> {
    try {
      const { deliveryId, customerId, amount, currencyCode, reason } = params;

      const reference = `delivery_refund_${deliveryId}_${Date.now()}`;

      // Create refund transaction
      const { data: transaction, error } = await supabase
        .from('wallet_transactions')
        .insert({
          user_id: customerId,
          transaction_type: 'refund',
          amount: amount,
          currency_code: currencyCode,
          status: 'completed',
          description: `Delivery refund - ${deliveryId}: ${reason}`,
          reference,
          metadata: {
            refund_type: 'delivery_cancellation',
            delivery_id: deliveryId,
            reason,
            refunded_at: new Date().toISOString(),
          },
        })
        .select()
        .single();

      if (error) {
        logger.error('Create refund transaction error:', error);
        return {
          success: false,
          message: 'Failed to process refund',
        };
      }

      // Update delivery payment status
      await supabase
        .from('deliveries')
        .update({
          payment_status: 'refunded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      logger.info('Delivery payment refunded:', {
        deliveryId,
        customerId,
        amount,
        transactionId: transaction.id,
        reason,
      });

      return {
        success: true,
        message: 'Payment refunded successfully',
        paymentId: transaction.id,
      };
    } catch (error: any) {
      logger.error('Refund delivery payment error:', error);
      return {
        success: false,
        message: error.message || 'Refund failed',
      };
    }
  }
}
