import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { ValidationError, TooManyRequestsError } from '../utils/errors';

class OTPService {
  /**
   * Generate OTP code
   */
  generateOTP(): string {
    const digits = '0123456789';
    let otp = '';
    
    for (let i = 0; i < config.otp.length; i++) {
      otp += digits[crypto.randomInt(0, digits.length)];
    }
    
    return otp;
  }

  /**
   * Create and store OTP for user
   */
  async createOTP(userId: string, type: 'email_verification' | 'password_reset'): Promise<string> {
    // Check resend rate limit
    await this.checkResendLimit(userId);

    // Invalidate any existing OTPs of same type for this user
    await this.invalidateExistingOTPs(userId, type);

    // Generate new OTP
    const otpCode = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + config.otp.expiryMinutes);

    // Store OTP in database
    const { error } = await supabase.from('otp_verifications').insert({
      id: uuidv4(),
      user_id: userId,
      type,
      code: otpCode,
      expires_at: expiresAt.toISOString(),
      verified: false,
      attempts: 0,
    });

    if (error) {
      logger.error('Error creating OTP:', error);
      throw new Error('Failed to create OTP');
    }

    // Track resend
    await this.trackResend(userId);

    logger.info(`OTP created for user ${userId}, type: ${type}`);
    return otpCode;
  }

  /**
   * Verify OTP
   */
  async verifyOTP(
    userId: string,
    otpCode: string,
    type: 'email_verification' | 'password_reset'
  ): Promise<boolean> {
    // Get OTP from database
    const { data: otp, error } = await supabase
      .from('otp_verifications')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .eq('verified', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !otp) {
      throw new ValidationError('Invalid or expired OTP');
    }

    // Check if OTP expired
    if (new Date(otp.expires_at) < new Date()) {
      throw new ValidationError('OTP has expired. Please request a new one.');
    }

    // Check if max attempts exceeded
    if (otp.attempts >= config.otp.maxAttempts) {
      throw new ValidationError('Maximum OTP attempts exceeded. Please request a new OTP.');
    }

    // Verify OTP code
    if (otp.code !== otpCode) {
      // Increment attempts
      await supabase
        .from('otp_verifications')
        .update({ attempts: otp.attempts + 1 })
        .eq('id', otp.id);

      const remainingAttempts = config.otp.maxAttempts - (otp.attempts + 1);
      
      if (remainingAttempts <= 0) {
        throw new ValidationError('Invalid OTP. Maximum attempts exceeded. Please request a new OTP.');
      }
      
      throw new ValidationError(
        `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`
      );
    }

    // Mark OTP as verified
    await supabase
      .from('otp_verifications')
      .update({ verified: true })
      .eq('id', otp.id);

    logger.info(`OTP verified successfully for user ${userId}`);
    return true;
  }

  /**
   * Check if user has exceeded resend limit
   */
  private async checkResendLimit(userId: string): Promise<void> {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const { data: resends, error } = await supabase
      .from('otp_resend_tracking')
      .select('*')
      .eq('email', userId) // Using email field for user tracking
      .gte('resent_at', oneHourAgo.toISOString());

    if (error) {
      logger.error('Error checking resend limit:', error);
      return; // Don't block on error
    }

    if (resends && resends.length >= config.otp.resendLimitPerHour) {
      throw new TooManyRequestsError(
        `You can only request ${config.otp.resendLimitPerHour} OTPs per hour. Please try again later.`
      );
    }
  }

  /**
   * Track OTP resend
   */
  private async trackResend(userId: string): Promise<void> {
    await supabase.from('otp_resend_tracking').insert({
      email: userId,
      resent_at: new Date().toISOString(),
    });
  }

  /**
   * Invalidate existing OTPs
   */
  private async invalidateExistingOTPs(
    userId: string,
    type: 'email_verification' | 'password_reset'
  ): Promise<void> {
    await supabase
      .from('otp_verifications')
      .update({ verified: true }) // Mark as verified to invalidate
      .eq('user_id', userId)
      .eq('type', type)
      .eq('verified', false);
  }

  /**
   * Get user by email (helper for email-based OTP)
   */
  async getUserByEmail(email: string): Promise<any> {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name')
      .eq('email', email)
      .single();

    if (error || !user) {
      return null;
    }

    return user;
  }

  /**
   * Cleanup expired OTPs
   */
  async cleanupExpiredOTPs(): Promise<void> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { error } = await supabase
      .from('otp_verifications')
      .delete()
      .lt('expires_at', oneDayAgo.toISOString());

    if (error) {
      logger.error('Error cleaning up expired OTPs:', error);
    } else {
      logger.info('Cleaned up expired OTPs');
    }
  }
}

export default new OTPService();