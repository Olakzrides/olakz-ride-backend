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

/**
 * Normalise any Nigerian phone format to E.164 (+234XXXXXXXXXX).
 * Handles: 080XXXXXXXX, 234XXXXXXXXXX, +234XXXXXXXXXX
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('234')) return `+${digits}`;
  if (digits.startsWith('0'))   return `+234${digits.slice(1)}`;
  if (digits.length === 10)     return `+234${digits}`;  // 8012345678 → +2348012345678
  return `+${digits}`;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
}

interface LoginData {
  email: string;
  password: string;
}

class AuthService {
  /**
   * Register new user — stores in pending_registrations until email is verified
   */
  async register(data: RegisterData): Promise<{ email: string }> {
    const { firstName, lastName, email, password, phone } = data;
    const normalizedEmail = email.toLowerCase();
    const normalizedPhone  = normalizePhone(phone);

    // Check if a verified account already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (existingUser) {
      throw new ConflictError('An account with this email already exists. Please login instead.');
    }

    // Check if phone is already taken by an active account
    const { data: existingPhone } = await supabase
      .from('users')
      .select('id')
      .eq('phone', normalizedPhone)
      .neq('status', 'account_deleted')
      .single();

    if (existingPhone) {
      throw new ConflictError('An account with this phone number already exists.');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);
    console.log("This is the password that is hashed", passwordHash)

    // Generate OTP
    const otpCode = otpService.generateOTP();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + config.otp.expiryMinutes);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    // Upsert into pending_registrations — allows re-registration if previous attempt expired or was abandoned
    const { error: upsertError } = await supabase
      .from('pending_registrations')
      .upsert({
        email: normalizedEmail,
        first_name: firstName,
        last_name: lastName,
        phone: normalizedPhone,
        password_hash: passwordHash,
        otp_code: otpCode,
        otp_expires_at: otpExpiresAt.toISOString(),
        otp_attempts: 0,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      }, { onConflict: 'email' });

    if (upsertError) {
      logger.error('Error creating pending registration:', upsertError);
      throw new Error('Failed to initiate registration');
    }

    // Send OTP email
    await emailService.sendOTPEmail(normalizedEmail, firstName, otpCode, 'verification');

    logger.info(`Pending registration created: ${normalizedEmail}`);
    return { email: normalizedEmail };
  }

  /**
   * Verify email with OTP — moves pending registration into users table
   */
  async verifyEmail(email: string, otp: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Look up pending registration — explicit columns bypass PostgREST schema cache
    const { data: pending, error: pendingError } = await supabase
      .from('pending_registrations')
      .select('email, first_name, last_name, phone, password_hash, otp_code, otp_expires_at, otp_attempts, expires_at')
      .eq('email', normalizedEmail)
      .single();

    if (pendingError || !pending) {
      // Fallback: check if already a verified user (handles edge cases)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, email_verified')
        .eq('email', normalizedEmail)
        .single();

      if (existingUser?.email_verified) {
        throw new ValidationError('Email is already verified');
      }

      throw new NotFoundError('No pending registration found for this email. Please register first.');
    }

    // Check if pending registration expired
    if (new Date(pending.expires_at) < new Date()) {
      await supabase.from('pending_registrations').delete().eq('email', normalizedEmail);
      throw new ValidationError('Registration has expired. Please register again.');
    }

    // Check if OTP expired
    if (new Date(pending.otp_expires_at) < new Date()) {
      throw new ValidationError('OTP has expired. Please request a new one.');
    }

    // Check max attempts
    if (pending.otp_attempts >= config.otp.maxAttempts) {
      throw new ValidationError('Maximum OTP attempts exceeded. Please request a new OTP.');
    }

    // Verify OTP
    if (pending.otp_code !== otp) {
      const newAttempts = pending.otp_attempts + 1;
      await supabase
        .from('pending_registrations')
        .update({ otp_attempts: newAttempts })
        .eq('email', normalizedEmail);

      const remaining = config.otp.maxAttempts - newAttempts;
      if (remaining <= 0) {
        throw new ValidationError('Invalid OTP. Maximum attempts exceeded. Please request a new OTP.');
      }
      throw new ValidationError(`Invalid OTP. ${remaining} attempt${remaining > 1 ? 's' : ''} remaining.`);
    }

    // OTP valid — create the real user
    const userId = uuidv4();
    const { error: createError } = await supabase.from('users').insert({
      id: userId,
      email: normalizedEmail,
      password_hash: pending.password_hash,
      first_name: pending.first_name,
      last_name: pending.last_name,
      phone: pending.phone ?? null,
      roles: ['customer'],
      active_role: 'customer',
      provider: 'emailpass',
      email_verified: true,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (createError) {
      logger.error('Error creating user from pending registration:', createError);
      throw new Error('Failed to complete registration');
    }

     // Patch phone via update — bypasses PostgREST schema cache insert issue
    if (pending.phone) {
      await supabase
        .from('users')
        .update({ phone: pending.phone, updated_at: new Date().toISOString() })
        .eq('email', normalizedEmail);
      logger.info('Phone saved for new user', { email: normalizedEmail, phone: pending.phone });
    }


    // Remove pending registration
    await supabase.from('pending_registrations').delete().eq('email', normalizedEmail);

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(normalizedEmail, pending.first_name);
    } catch (err) {
      logger.warn('Failed to send welcome email:', err);
    }

    logger.info(`Email verified and user created: ${normalizedEmail}`);
  }

  /**
   * Resend OTP — works for both pending registrations and legacy unverified users
   */
  async resendOTP(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Check pending_registrations first
    const { data: pending } = await supabase
      .from('pending_registrations')
      .select('first_name, expires_at')
      .eq('email', normalizedEmail)
      .single();

    if (pending) {
      if (new Date(pending.expires_at) < new Date()) {
        await supabase.from('pending_registrations').delete().eq('email', normalizedEmail);
        throw new ValidationError('Registration has expired. Please register again.');
      }

      const otpCode = otpService.generateOTP();
      const otpExpiresAt = new Date();
      otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + config.otp.expiryMinutes);

      await supabase
        .from('pending_registrations')
        .update({
          otp_code: otpCode,
          otp_expires_at: otpExpiresAt.toISOString(),
          otp_attempts: 0,
        })
        .eq('email', normalizedEmail);

      await emailService.sendOTPEmail(normalizedEmail, pending.first_name, otpCode, 'verification');
      logger.info(`OTP resent (pending registration): ${normalizedEmail}`);
      return;
    }

    // Fallback: legacy unverified user in users table
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, email_verified')
      .eq('email', normalizedEmail)
      .single();

    if (error || !user) {
      throw new NotFoundError('No registration found for this email. Please register first.');
    }

    if (user.email_verified) {
      throw new ValidationError('Email is already verified');
    }

    const otp = await otpService.createOTP(user.id, 'email_verification');
    await emailService.sendOTPEmail(normalizedEmail, user.first_name, otp, 'verification');
    logger.info(`OTP resent (legacy user): ${normalizedEmail}`);
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