import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { PushNotificationService } from './push-notification.service';
import { PaymentService } from './payment.service';

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

export interface AddTipRequest {
  rideId: string;
  userId: string;
  tipAmount: number;
}

export class TipService {
  private readonly MIN_TIP_AMOUNT = 50; // ₦50
  private readonly MAX_TIP_AMOUNT = 50000; // ₦50,000
  private paymentService: PaymentService;

  constructor() {
    this.paymentService = new PaymentService();
  }

  /**
   * Add tip to completed ride
   */
  async addTip(request: AddTipRequest): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    const { rideId, userId, tipAmount } = request;

    try {
      logger.info('💰 Processing tip request:', { rideId, userId, tipAmount });

      // Validate tip amount
      if (tipAmount < this.MIN_TIP_AMOUNT) {
        return {
          success: false,
          error: `Minimum tip amount is ₦${this.MIN_TIP_AMOUNT}`,
        };
      }

      if (tipAmount > this.MAX_TIP_AMOUNT) {
        return {
          success: false,
          error: `Maximum tip amount is ₦${this.MAX_TIP_AMOUNT}`,
        };
      }

      // Fetch ride details
      const { data: ride, error: rideError } = await supabase
        .from('rides')
        .select('id, user_id, driver_id, status, tip_amount, tip_payment_status, final_fare')
        .eq('id', rideId)
        .eq('user_id', userId)
        .single();

      if (rideError || !ride) {
        logger.error('❌ Ride not found:', { rideId, userId, error: rideError });
        return { success: false, error: 'Ride not found or unauthorized' };
      }

      // Validate ride status (only completed rides)
      if (ride.status !== 'completed') {
        return {
          success: false,
          error: 'Tips can only be added to completed rides',
        };
      }

      // Check if driver exists
      if (!ride.driver_id) {
        return {
          success: false,
          error: 'No driver assigned to this ride',
        };
      }

      // Resolve driver's auth user_id from drivers table
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('user_id')
        .eq('id', ride.driver_id)
        .single();

      if (driverError || !driver?.user_id) {
        logger.error('❌ Could not resolve driver user_id:', { driverId: ride.driver_id, error: driverError });
        return { success: false, error: 'Could not resolve driver account' };
      }

      const driverUserId = driver.user_id;

      // Check if tip already exists
      if (ride.tip_amount && ride.tip_amount > 0) {
        return {
          success: false,
          error: 'Tip has already been added to this ride',
        };
      }

      // Check user wallet balance
      const walletBalance = await this.paymentService.getUserWalletBalance(userId, 'NGN');

      if (walletBalance < tipAmount) {
        return {
          success: false,
          error: 'Insufficient wallet balance',
        };
      }

      // Process tip payment
      const tipResult = await this.processTipPayment({
        rideId,
        userId,
        driverId: ride.driver_id,
        driverUserId,
        tipAmount,
      });

      if (!tipResult.success) {
        return tipResult;
      }

      logger.info('✅ Tip processed successfully:', {
        rideId,
        userId,
        driverId: ride.driver_id,
        driverUserId,
        tipAmount,
      });

      // Send notification to driver
      await this.notifyDriverOfTip(ride.driver_id, tipAmount, rideId);

      return {
        success: true,
        message: `Tip of ₦${tipAmount.toLocaleString()} sent to driver successfully`,
      };
    } catch (error: any) {
      logger.error('❌ Add tip error:', error);
      return { success: false, error: 'Failed to process tip' };
    }
  }

  /**
   * Process tip payment (deduct from passenger, add to driver)
   */
  private async processTipPayment(params: {
    rideId: string;
    userId: string;
    driverId: string;
    driverUserId: string;
    tipAmount: number;
  }): Promise<{ success: boolean; error?: string }> {
    const { rideId, userId, driverId, driverUserId, tipAmount } = params;

    try {
      const now = new Date().toISOString();
      const tipRef = `tip_${rideId}_${Date.now()}`;

      // 1. Deduct from passenger wallet via payment-service
      await this.paymentService.deductWallet({
        userId,
        amount: tipAmount,
        currencyCode: 'NGN',
        reference: `${tipRef}_passenger`,
        description: `Tip for ride ${rideId}`,
      });

      // 2. Credit driver wallet via payment-service (using auth user_id, not driver table id)
      try {
        await this.paymentService.creditWallet({
          userId: driverUserId,
          amount: tipAmount,
          currencyCode: 'NGN',
          reference: `${tipRef}_driver`,
          description: `Tip received for ride ${rideId}`,
          transactionType: 'earning',
        });
      } catch (creditError: any) {
        // Passenger was deducted but driver credit failed — refund passenger
        logger.error('❌ Driver credit failed, refunding passenger:', creditError);
        try {
          await this.paymentService.creditWallet({
            userId,
            amount: tipAmount,
            currencyCode: 'NGN',
            reference: `${tipRef}_refund`,
            description: `Refund: tip credit to driver failed for ride ${rideId}`,
          });
        } catch (refundError: any) {
          logger.error('❌ CRITICAL: Tip refund to passenger also failed:', refundError);
        }
        return { success: false, error: 'Failed to credit tip to driver' };
      }

      // 3. Update ride with tip info
      const { error: updateRideError } = await supabase
        .from('rides')
        .update({
          tip_amount: tipAmount,
          tip_payment_status: 'completed',
          tip_paid_at: now,
          updated_at: now,
        })
        .eq('id', rideId);

      if (updateRideError) {
        logger.error('❌ Error updating ride with tip:', updateRideError);
        // Non-critical — payments already processed
      }

      // 4. Update driver total earnings (non-critical)
      const { error: updateDriverError } = await supabase.rpc('increment_driver_earnings', {
        p_driver_id: driverId,
        p_amount: tipAmount,
      });

      if (updateDriverError) {
        logger.warn('⚠️ Error updating driver earnings (non-critical):', updateDriverError);
      }

      logger.info('✅ Tip payment processed:', { rideId, userId, driverId, tipAmount });

      return { success: true };
    } catch (error: any) {
      logger.error('❌ Process tip payment error:', error);
      return { success: false, error: error.message || 'Failed to process tip payment' };
    }
  }

  /**
   * Send push notification to driver about tip
   */
  private async notifyDriverOfTip(
    driverId: string,
    tipAmount: number,
    rideId: string
  ): Promise<void> {
    try {
      const pushNotificationService = PushNotificationService.getInstance();
      
      await pushNotificationService.sendToUser({
        userId: driverId,
        rideId,
        notificationType: 'tip_received',
        payload: {
          title: '💰 You received a tip!',
          body: `You received a ₦${tipAmount.toLocaleString()} tip from your passenger`,
          data: {
            type: 'tip_received',
            ride_id: rideId,
            tip_amount: tipAmount.toString(),
          },
        },
        priority: 'high',
      });

      logger.info('✅ Tip notification sent to driver:', { driverId, tipAmount });
    } catch (error: any) {
      logger.error('❌ Error sending tip notification:', error);
      // Non-critical, don't fail the tip process
    }
  }

  /**
   * Get tip suggestions based on fare
   */
  getTipSuggestions(finalFare: number): number[] {
    // Default suggestions
    const defaultSuggestions = [100, 200, 500, 1000, 2000];

    // If fare is high, suggest percentage-based tips
    if (finalFare > 5000) {
      const percentageTips = [
        Math.round(finalFare * 0.05), // 5%
        Math.round(finalFare * 0.10), // 10%
        Math.round(finalFare * 0.15), // 15%
      ];
      return [...new Set([...percentageTips, ...defaultSuggestions])].sort((a, b) => a - b);
    }

    return defaultSuggestions;
  }
}
