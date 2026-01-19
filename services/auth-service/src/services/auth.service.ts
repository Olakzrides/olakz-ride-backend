import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import supabase from '../utils/supabase';
import logger from '../utils/logger';
import {
  ValidationError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
} from '../utils/errors';
import tokenService from './token.service';
import otpService from './otp.service';
import emailService from './email.service';

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

interface LoginData {
  email: string;
  password: string;
}

class AuthService {
  /**
   * Register new user
   */
  async register(data: RegisterData): Promise<{ userId: string; email: string }> {
    const { firstName, lastName, email, password } = data;

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      throw new ConflictError('An account with this email already exists. Please login instead.');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

    // Create user
    const userId = uuidv4();
    const { error: createError } = await supabase.from('users').insert({
      id: userId,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      roles: ['customer'],
      active_role: 'customer',
      provider: 'emailpass',
      email_verified: false,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (createError) {
      logger.error('Error creating user:', createError);
      throw new Error('Failed to create user');
    }

    // Generate and send OTP
    const otp = await otpService.createOTP(userId, 'email_verification');
    await emailService.sendOTPEmail(email, firstName, otp, 'verification');

    logger.info(`User registered successfully: ${email}`);
    return { userId, email };
  }

  /**
   * Verify email with OTP
   */
  async verifyEmail(email: string, otp: string): Promise<void> {
    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, email_verified')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      throw new NotFoundError('User not found');
    }

    if (user.email_verified) {
      throw new ValidationError('Email is already verified');
    }

    // Verify OTP
    await otpService.verifyOTP(user.id, otp, 'email_verification');

    // Update user as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({
        email_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error('Error updating user verification status:', updateError);
      throw new Error('Failed to verify email');
    }

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(email, user.first_name);
    } catch (error) {
      logger.warn('Failed to send welcome email:', error);
      // Don't fail verification if welcome email fails
    }

    logger.info(`Email verified successfully: ${email}`);
  }

  /**
   * Resend OTP
   */
  async resendOTP(email: string): Promise<void> {
    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, email_verified')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      throw new NotFoundError('User not found');
    }

    if (user.email_verified) {
      throw new ValidationError('Email is already verified');
    }

    // Generate and send new OTP
    const otp = await otpService.createOTP(user.id, 'email_verification');
    await emailService.sendOTPEmail(email, user.first_name, otp, 'verification');

    logger.info(`OTP resent to: ${email}`);
  }

  /**
   * Login user
   */
  async login(data: LoginData, ipAddress: string): Promise<any> {
    const { email, password } = data;

    // Check login attempts
    await this.checkLoginAttempts(email, ipAddress);

    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      await this.trackLoginAttempt(email, ipAddress, false);
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if email is verified
    if (!user.email_verified) {
      throw new UnauthorizedError('Please verify your email before logging in');
    }

    // Check account status
    if (user.status !== 'active') {
      throw new UnauthorizedError('Your account has been disabled. Please contact support.');
    }

    // Verify password (only for emailpass provider)
    if (user.provider === 'emailpass') {
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        await this.trackLoginAttempt(email, ipAddress, false);
        throw new UnauthorizedError('Invalid email or password');
      }
    }

    // Track successful login
    await this.trackLoginAttempt(email, ipAddress, true);

    // Update last login
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);

    // Generate tokens
    const tokens = await tokenService.generateTokens(user.id, user.email, user.active_role);

    // Return user data (exclude sensitive fields)
    const userData = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      roles: user.roles,
      activeRole: user.active_role,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      emailVerified: user.email_verified,
    };

    logger.info(`User logged in successfully: ${email}`);
    return { user: userData, ...tokens };
  }

  /**
   * Logout user
   */
  async logout(refreshToken: string): Promise<void> {
    await tokenService.revokeRefreshToken(refreshToken);
    logger.info('User logged out successfully');
  }

  /**
   * Request password reset
   */
  async forgotPassword(email: string): Promise<void> {
    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, provider')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      // Don't reveal if user exists (security best practice)
      // But still return success message
      logger.info(`Password reset requested for non-existent email: ${email}`);
      return;
    }

    // Check if user uses OAuth
    if (user.provider !== 'emailpass') {
      throw new ValidationError('Password reset is not available for OAuth accounts');
    }

    // Generate and send OTP
    const otp = await otpService.createOTP(user.id, 'password_reset');
    await emailService.sendOTPEmail(email, user.first_name, otp, 'password_reset');

    logger.info(`Password reset OTP sent to: ${email}`);
  }

  /**
   * Reset password with OTP
   */
  async resetPassword(email: string, otp: string, newPassword: string): Promise<void> {
    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('id, provider')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      throw new NotFoundError('User not found');
    }

    if (user.provider !== 'emailpass') {
      throw new ValidationError('Password reset is not available for OAuth accounts');
    }

    // Verify OTP
    await otpService.verifyOTP(user.id, otp, 'password_reset');

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error('Error updating password:', updateError);
      throw new Error('Failed to reset password');
    }

    // Revoke all existing tokens (logout from all devices)
    await tokenService.revokeAllUserTokens(user.id);

    logger.info(`Password reset successfully for user: ${email}`);
  }

  /**
   * Check login attempts and rate limiting
   */
  private async checkLoginAttempts(email: string, _ipAddress: string): Promise<void> {
    const blockDuration = config.rateLimit.loginBlockDurationMinutes;
    const blockUntil = new Date();
    blockUntil.setMinutes(blockUntil.getMinutes() - blockDuration);

    // Get recent failed attempts
    const { data: attempts, error } = await supabase
      .from('login_attempts')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('success', false)
      .gte('attempted_at', blockUntil.toISOString())
      .order('attempted_at', { ascending: false });

    if (error) {
      logger.error('Error checking login attempts:', error);
      return; // Don't block on error
    }

    if (attempts && attempts.length >= config.rateLimit.loginFailureLimit) {
      const lastAttempt = new Date(attempts[0].attempted_at);
      const minutesLeft = Math.ceil(
        (blockDuration - (Date.now() - lastAttempt.getTime()) / 60000)
      );
      
      throw new TooManyRequestsError(
        `Too many failed login attempts. Please try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`
      );
    }
  }

  /**
   * Track login attempt
   */
  private async trackLoginAttempt(
    email: string,
    ipAddress: string,
    success: boolean
  ): Promise<void> {
    await supabase.from('login_attempts').insert({
      email: email.toLowerCase(),
      ip_address: ipAddress,
      success,
      attempted_at: new Date().toISOString(),
    });
  }

  /**
   * Cleanup old login attempts
   */
  async cleanupOldLoginAttempts(): Promise<void> {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const { error } = await supabase
      .from('login_attempts')
      .delete()
      .lt('attempted_at', oneDayAgo.toISOString());

    if (error) {
      logger.error('Error cleaning up login attempts:', error);
    } else {
      logger.info('Cleaned up old login attempts');
    }
  }
}

export default new AuthService();