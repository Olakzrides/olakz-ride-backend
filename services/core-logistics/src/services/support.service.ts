import { config } from '../config/env';
import { logger } from '../config/logger';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

export interface SupportContactRequest {
  rideId: string;
  userId: string;
  userName: string;
  issueCategory: 'payment' | 'driver' | 'app' | 'safety' | 'other';
  customMessage?: string;
}

export class SupportService {
  /**
   * Generate WhatsApp support link with pre-filled message
   */
  async generateSupportLink(request: SupportContactRequest): Promise<{
    success: boolean;
    whatsappLink?: string;
    error?: string;
  }> {
    try {
      const { rideId, userId, issueCategory, customMessage } = request;

      logger.info('🔍 Generating support link:', { rideId, userId });

      // Verify ride exists and belongs to user
      const { data: ride, error: rideError } = await supabase
        .from('rides')
        .select('id, status, pickup_address, dropoff_address, user_id')
        .eq('id', rideId)
        .eq('user_id', userId)
        .single();

      logger.info('📊 Supabase query result:', {
        rideId,
        userId,
        hasData: !!ride,
        hasError: !!rideError,
        error: rideError ? {
          code: rideError.code,
          message: rideError.message,
          details: rideError.details,
          hint: rideError.hint,
        } : null,
        rideData: ride ? {
          id: ride.id,
          status: ride.status,
        } : null,
      });

      if (rideError) {
        logger.error('❌ Supabase error fetching ride:', rideError);
        return { success: false, error: 'Ride not found or unauthorized' };
      }

      if (!ride) {
        logger.warn('⚠️ No ride found with criteria:', { rideId, userId });
        return { success: false, error: 'Ride not found or unauthorized' };
      }

      // Check if ride is active (not completed or cancelled)
      const activeStatuses = ['searching', 'driver_assigned', 'driver_arrived', 'in_progress'];
      if (!activeStatuses.includes(ride.status)) {
        logger.warn('⚠️ Ride is not active:', {
          rideId,
          status: ride.status,
          activeStatuses,
        });
        return { success: false, error: 'Support contact is only available for active rides' };
      }

      // Fetch user's real name from auth service
      const userName = await this.fetchUserName(userId);

      logger.info('✅ Ride verified, building message:', {
        rideId,
        userName,
        status: ride.status,
      });

      // Build pre-filled message
      const message = this.buildSupportMessage({
        rideId,
        userName,
        issueCategory,
        rideStatus: ride.status,
        pickupAddress: ride.pickup_address,
        dropoffAddress: ride.dropoff_address,
        customMessage,
      });

      // Generate WhatsApp link
      const whatsappLink = this.generateWhatsAppLink(config.support.whatsappNumber, message);

      logger.info('Support link generated', {
        rideId,
        userId,
        userName,
        issueCategory,
      });

      return {
        success: true,
        whatsappLink,
      };
    } catch (error: any) {
      logger.error('Generate support link error:', error);
      return { success: false, error: 'Failed to generate support link' };
    }
  }

  /**
   * Fetch user's real name from auth service
   */
  private async fetchUserName(userId: string): Promise<string> {
    try {
      logger.info('🔍 Fetching user name from auth service:', { userId });

      // Query users table in auth database (same Supabase instance)
      const { data: user, error } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', userId)
        .single();

      if (error) {
        logger.error('❌ Error fetching user name:', {
          userId,
          error: {
            code: error.code,
            message: error.message,
          },
        });
        return 'Customer'; // Fallback
      }

      if (!user) {
        logger.warn('⚠️ User not found:', { userId });
        return 'Customer'; // Fallback
      }

      const fullName = `${user.first_name} ${user.last_name}`.trim();
      logger.info('✅ User name fetched:', { userId, fullName });

      return fullName || 'Customer';
    } catch (error: any) {
      logger.error('❌ Exception fetching user name:', {
        userId,
        error: error.message,
      });
      return 'Customer'; // Fallback on any error
    }
  }

  /**
   * Build formatted support message
   */
  private buildSupportMessage(params: {
    rideId: string;
    userName: string;
    issueCategory: string;
    rideStatus: string;
    pickupAddress: string | null;
    dropoffAddress: string | null;
    customMessage?: string;
  }): string {
    const { rideId, userName, issueCategory, rideStatus, pickupAddress, dropoffAddress, customMessage } = params;

    // Map issue category to readable text
    const issueCategoryMap: Record<string, string> = {
      payment: 'Payment Issue',
      driver: 'Driver Issue',
      app: 'App Problem',
      safety: 'Safety Concern',
      other: 'Other Issue',
    };

    const categoryText = issueCategoryMap[issueCategory] || 'Support Request';

    let message = `🚗 *Olakz Ride Support Request*\n\n`;
    message += `*Name:* ${userName}\n`;
    message += `*Ride ID:* ${rideId}\n`;
    message += `*Issue:* ${categoryText}\n`;
    message += `*Ride Status:* ${rideStatus}\n`;

    if (pickupAddress) {
      message += `*Pickup:* ${pickupAddress}\n`;
    }

    if (dropoffAddress) {
      message += `*Dropoff:* ${dropoffAddress}\n`;
    }

    if (customMessage) {
      message += `\n*Message:*\n${customMessage}`;
    } else {
      message += `\nI need help with my ride.`;
    }

    return message;
  }

  /**
   * Generate WhatsApp deep link
   */
  private generateWhatsAppLink(phoneNumber: string, message: string): string {
    // Remove + and spaces from phone number
    const cleanNumber = phoneNumber.replace(/[\s+]/g, '');

    // URL encode the message
    const encodedMessage = encodeURIComponent(message);

    // Generate WhatsApp link (works on both mobile and web)
    return `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
  }

  /**
   * Get support contact info (for display in app)
   */
  getSupportContactInfo(): {
    whatsappNumber: string;
    formattedNumber: string;
  } {
    return {
      whatsappNumber: config.support.whatsappNumber,
      formattedNumber: this.formatPhoneNumber(config.support.whatsappNumber),
    };
  }

  /**
   * Format phone number for display
   */
  private formatPhoneNumber(phoneNumber: string): string {
    // Remove + and spaces
    const cleaned = phoneNumber.replace(/[\s+]/g, '');

    // Format as +234 806 389 9074
    if (cleaned.startsWith('234') && cleaned.length === 13) {
      return `+234 ${cleaned.substring(3, 6)} ${cleaned.substring(6, 9)} ${cleaned.substring(9)}`;
    }

    return phoneNumber;
  }
}
