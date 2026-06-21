import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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
  deviceId?: string;   // ANDROID_ID / IOS identifierForVendor from X-Device-ID header
  ipAddress?: string;  // captured at controller layer from req.ip
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
    const { firstName, lastName, email, password, phone, deviceId, ipAddress } = data;
    const normalizedEmail = email.toLowerCase();
    const normalizedPhone  = normalizePhone(phone);

    // Check if a verified account already exists (exclude deleted accounts — they can re-register)
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, status')
      .eq('email', normalizedEmail)
      .single();

    if (existingUser && existingUser.status !== 'account_deleted') {
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
        device_id: deviceId ?? null,
        ip_address: ipAddress ?? null,
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
      .select('email, first_name, last_name, phone, password_hash, otp_code, otp_expires_at, otp_attempts, expires_at, device_id, ip_address')
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

    // OTP valid — create or reactivate the user
    // If the email belongs to a deleted account, reactivate it instead of inserting a duplicate.
    const { data: deletedAccount } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .eq('status', 'account_deleted')
      .single();

    let userId: string;

    if (deletedAccount) {
      // Reactivate the existing deleted account with fresh details
      userId = deletedAccount.id;
      const { error: reactivateError } = await supabase
        .from('users')
        .update({
          password_hash:  pending.password_hash,
          first_name:     pending.first_name,
          last_name:      pending.last_name,
          phone:          pending.phone ?? null,
          roles:          ['customer'],
          active_role:    'customer',
          email_verified: true,
          status:         'active',
          updated_at:     new Date().toISOString(),
        })
        .eq('id', userId);

      if (reactivateError) {
        logger.error('Error reactivating deleted account:', reactivateError);
        throw new Error('Failed to complete registration');
      }

      logger.info('Deleted account reactivated on re-registration', { email: normalizedEmail, userId });
    } else {
      // Fresh registration — insert new row
      userId = uuidv4();
      const { error: createError } = await supabase.from('users').insert({
        id:             userId,
        email:          normalizedEmail,
        password_hash:  pending.password_hash,
        first_name:     pending.first_name,
        last_name:      pending.last_name,
        phone:          pending.phone ?? null,
        roles:          ['customer'],
        active_role:    'customer',
        provider:       'emailpass',
        email_verified: true,
        status:         'active',
        created_at:     new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      });

      if (createError) {
        logger.error('Error creating user from pending registration:', createError);
        throw new Error('Failed to complete registration');
      }
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

    // ── Signup promo credit (non-blocking) ────────────────────────────────────
    // Check if there is an active promo campaign and award the credit if so.
    // Uses a crypto hash of the E.164 phone for fraud fingerprinting.
    // pending.phone is already normalized to E.164 from the registration step.
    if (pending.phone) {
      this.awardSignupPromoIfActive(userId, normalizePhone(pending.phone), {
        deviceId:  pending.device_id  ?? undefined,
        ipAddress: pending.ip_address ?? undefined,
      }).catch((err) =>
        logger.warn('Signup promo award failed (non-fatal)', {
          email: normalizedEmail,
          error: err instanceof Error ? err.message : String(err),
        })
      );
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
    if (user.status === 'account_deleted') {
      throw new UnauthorizedError('This account has been deleted. Please register again to create a new account.');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedError('Your account has been suspended. Please contact support.');
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
  /**
   * Award a signup promo credit to a newly verified user if:
   *  1. There is an active promo with remaining budget
   *  2. This phone hash has not claimed the promo before       (primary gate)
   *  3. This device ID has not claimed the promo before        (secondary gate — soft block)
   *  4. This user hasn't already claimed it                    (belt-and-suspenders)
   *
   * IP address is stored as a soft signal for forensics — NOT used as a hard block
   * because many users share IPs (mobile carriers, NAT, VPNs).
   *
   * Phone + Device together form the production fraud fingerprint.
   * Non-blocking — called with .catch() so failures never break signup.
   */
  private async awardSignupPromoIfActive(
    userId: string,
    normalizedPhone: string,
    context: { deviceId?: string; ipAddress?: string } = {}
  ): Promise<void> {
    const { deviceId, ipAddress } = context;

    // ── 1. Find active promo ────────────────────────────────────────────────
    const now = new Date().toISOString();
    const { data: promo, error: promoError } = await supabase
      .from('signup_promos')
      .select('id, promo_amount, total_budget_cap, claims_count')
      .eq('is_active', true)
      .lte('starts_at', now)
      .gt('ends_at', now)
      .maybeSingle();

    if (promoError || !promo) return; // No active promo — nothing to do

    const promoAmount     = parseFloat(promo.promo_amount);
    const totalBudget     = parseFloat(promo.total_budget_cap);
    const disbursed       = promoAmount * (promo.claims_count ?? 0);
    const remainingBudget = totalBudget - disbursed;

    if (remainingBudget < promoAmount) {
      logger.info('Signup promo budget exhausted — no credit awarded', { promoId: promo.id, userId });
      return;
    }

    // ── 2. Phone hash fraud gate (primary — hard block) ─────────────────────
    const phoneHash = crypto.createHash('sha256').update(normalizedPhone).digest('hex');

    const { data: phoneClash } = await supabase
      .from('promo_signup_claims')
      .select('id')
      .eq('promo_id', promo.id)
      .eq('phone_hash', phoneHash)
      .maybeSingle();

    if (phoneClash) {
      logger.warn('Promo fraud gate — phone hash already claimed', {
        promoId: promo.id,
        userId,
      });
      return;
    }

    // ── 3. Device ID fraud gate (secondary — hard block if device known) ────
    // ANDROID_ID / IOS identifierForVendor sent as X-Device-ID header by the app.
    // If the device has already claimed this promo under any account, block it.
    if (deviceId) {
      const { data: deviceClash } = await supabase
        .from('promo_signup_claims')
        .select('id')
        .eq('promo_id', promo.id)
        .eq('device_id', deviceId)
        .maybeSingle();

      if (deviceClash) {
        logger.warn('Promo fraud gate — device ID already claimed', {
          promoId: promo.id,
          userId,
          deviceId,
        });
        return;
      }
    }

    // ── 4. User dedup gate (belt-and-suspenders) ────────────────────────────
    const { data: userClash } = await supabase
      .from('promo_signup_claims')
      .select('id')
      .eq('promo_id', promo.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (userClash) {
      logger.info('User already claimed this promo — skipping', { promoId: promo.id, userId });
      return;
    }

    // ── 5. Credit wallet as promo_credit ────────────────────────────────────
    const reference = `promo_signup_${promo.id}_${userId}`;
    const { error: txError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id:          userId,
        transaction_type: 'promo_credit',
        amount:           promoAmount,
        currency_code:    'NGN',
        status:           'completed',
        reference,
        description:      'Welcome bonus — signup promo credit',
        metadata: {
          promo_id:    promo.id,
          credited_by: 'auth-service',
          credited_at: new Date().toISOString(),
        },
      });

    if (txError) {
      logger.error('Failed to credit signup promo to wallet', {
        userId, promoId: promo.id, error: txError.message,
      });
      return;
    }

    // ── 6. Record claim fingerprint (phone + device + ip) ───────────────────
    await supabase.from('promo_signup_claims').insert({
      promo_id:   promo.id,
      user_id:    userId,
      phone_hash: phoneHash,
      device_id:  deviceId  ?? null,   // hard fraud gate on next signup from same device
      ip_address: ipAddress ?? null,   // soft signal — stored for forensics, not a hard block
      amount:     promoAmount,
      claimed_at: new Date().toISOString(),
    });

    // ── 7. Increment claims_count on the promo ──────────────────────────────
    await supabase
      .from('signup_promos')
      .update({
        claims_count: (promo.claims_count ?? 0) + 1,
        updated_at:   new Date().toISOString(),
      })
      .eq('id', promo.id);

    logger.info(`✅ Signup promo credit of ₦${promoAmount} awarded`, {
      userId,
      promoId:  promo.id,
      reference,
      hasDevice: !!deviceId,
    });
  }

}

export default new AuthService();