import bcrypt from 'bcryptjs';
import supabase from '../utils/supabase';
import logger from '../utils/logger';
import config from '../config';
import { NotFoundError, ValidationError, UnauthorizedError, TooManyRequestsError } from '../utils/errors';
import tokenService from './token.service';

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;

class SecurityService {
  // ─── Password ────────────────────────────────────────────────────────────────

  /**
   * Change password — requires current password verification
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    if (newPassword !== confirmPassword) {
      throw new ValidationError('Passwords do not match');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('New password must be at least 8 characters');
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash, provider')
      .eq('id', userId)
      .single();

    if (error || !user) throw new NotFoundError('User not found');

    if (user.provider !== 'emailpass') {
      throw new ValidationError('Password change is not available for OAuth accounts');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) throw new UnauthorizedError('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) {
      logger.error('Change password error:', updateError);
      throw new Error('Failed to update password');
    }

    // Revoke all refresh tokens — force re-login on other devices
    await tokenService.revokeAllUserTokens(userId);

    logger.info('Password changed', { userId });
  }

  // ─── Biometric ───────────────────────────────────────────────────────────────

  /**
   * Toggle biometric login/confirmation
   */
  async updateBiometric(userId: string, enabled: boolean): Promise<{ biometricEnabled: boolean }> {
    const { error } = await supabase
      .from('users')
      .update({ biometric_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      logger.error('Update biometric error:', error);
      throw new Error('Failed to update biometric setting');
    }

    logger.info('Biometric updated', { userId, enabled });
    return { biometricEnabled: enabled };
  }

  // ─── Wallet PIN ───────────────────────────────────────────────────────────────

  /**
   * Set wallet PIN for the first time
   * Requires account password to confirm identity
   */
  async setWalletPin(userId: string, pin: string, accountPassword: string): Promise<{ walletPinEnabled: boolean }> {
    this.validatePin(pin);

    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash, wallet_pin_enabled, provider')
      .eq('id', userId)
      .single();

    if (error || !user) throw new NotFoundError('User not found');

    if (user.wallet_pin_enabled) {
      throw new ValidationError('Wallet PIN is already set. Use the update endpoint to change it.');
    }

    await this.verifyAccountPassword(user, accountPassword);

    const pinHash = await bcrypt.hash(pin, config.security.bcryptRounds);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        wallet_pin_hash: pinHash,
        wallet_pin_enabled: true,
        wallet_pin_attempts: 0,
        wallet_pin_locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      logger.error('Set wallet PIN error:', updateError);
      throw new Error('Failed to set wallet PIN');
    }

    logger.info('Wallet PIN set', { userId });
    return { walletPinEnabled: true };
  }

  /**
   * Update existing wallet PIN
   * Requires current PIN + account password
   */
  async updateWalletPin(userId: string, currentPin: string, newPin: string, accountPassword: string): Promise<{ walletPinEnabled: boolean }> {
    this.validatePin(newPin);

    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash, wallet_pin_hash, wallet_pin_enabled, wallet_pin_attempts, wallet_pin_locked_until, provider')
      .eq('id', userId)
      .single();

    if (error || !user) throw new NotFoundError('User not found');

    if (!user.wallet_pin_enabled) {
      throw new ValidationError('No wallet PIN set. Use the set endpoint first.');
    }

    await this.checkPinLock(user);
    await this.verifyAccountPassword(user, accountPassword);

    const isPinValid = await bcrypt.compare(currentPin, user.wallet_pin_hash);
    if (!isPinValid) {
      await this.incrementPinAttempts(userId, user.wallet_pin_attempts || 0);
      throw new UnauthorizedError('Current PIN is incorrect');
    }

    const newPinHash = await bcrypt.hash(newPin, config.security.bcryptRounds);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        wallet_pin_hash: newPinHash,
        wallet_pin_attempts: 0,
        wallet_pin_locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      logger.error('Update wallet PIN error:', updateError);
      throw new Error('Failed to update wallet PIN');
    }

    logger.info('Wallet PIN updated', { userId });
    return { walletPinEnabled: true };
  }

  /**
   * Verify wallet PIN — called before authorizing a wallet transaction
   */
  async verifyWalletPin(userId: string, pin: string): Promise<{ valid: boolean }> {
    const { data: user, error } = await supabase
      .from('users')
      .select('wallet_pin_hash, wallet_pin_enabled, wallet_pin_attempts, wallet_pin_locked_until')
      .eq('id', userId)
      .single();

    if (error || !user) throw new NotFoundError('User not found');

    if (!user.wallet_pin_enabled) {
      throw new ValidationError('Wallet PIN is not set');
    }

    await this.checkPinLock(user);

    const isValid = await bcrypt.compare(pin, user.wallet_pin_hash);

    if (!isValid) {
      await this.incrementPinAttempts(userId, user.wallet_pin_attempts || 0);
      return { valid: false };
    }

    // Reset attempts on success
    await supabase
      .from('users')
      .update({ wallet_pin_attempts: 0, wallet_pin_locked_until: null })
      .eq('id', userId);

    return { valid: true };
  }

  /**
   * Remove wallet PIN
   * Requires account password
   */
  async removeWalletPin(userId: string, accountPassword: string): Promise<{ walletPinEnabled: boolean }> {
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash, wallet_pin_enabled, provider')
      .eq('id', userId)
      .single();

    if (error || !user) throw new NotFoundError('User not found');

    if (!user.wallet_pin_enabled) {
      throw new ValidationError('No wallet PIN is set');
    }

    await this.verifyAccountPassword(user, accountPassword);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        wallet_pin_hash: null,
        wallet_pin_enabled: false,
        wallet_pin_attempts: 0,
        wallet_pin_locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      logger.error('Remove wallet PIN error:', updateError);
      throw new Error('Failed to remove wallet PIN');
    }

    logger.info('Wallet PIN removed', { userId });
    return { walletPinEnabled: false };
  }

  /**
   * Get security settings overview
   */
  async getSecuritySettings(userId: string): Promise<any> {
    const { data: user, error } = await supabase
      .from('users')
      .select('biometric_enabled, wallet_pin_enabled, provider')
      .eq('id', userId)
      .single();

    if (error || !user) throw new NotFoundError('User not found');

    return {
      biometricEnabled: user.biometric_enabled ?? false,
      walletPinEnabled: user.wallet_pin_enabled ?? false,
      canChangePassword: user.provider === 'emailpass',
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private validatePin(pin: string): void {
    if (!/^\d{4}$/.test(pin)) {
      throw new ValidationError('PIN must be exactly 4 digits');
    }
  }

  private async verifyAccountPassword(user: any, password: string): Promise<void> {
    if (user.provider !== 'emailpass') {
      // OAuth users don't have a password — skip this check
      return;
    }
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new UnauthorizedError('Account password is incorrect');
  }

  private async checkPinLock(user: any): Promise<void> {
    if (user.wallet_pin_locked_until) {
      const lockedUntil = new Date(user.wallet_pin_locked_until);
      if (lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);
        throw new TooManyRequestsError(
          `Wallet PIN is locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`
        );
      }
    }
  }

  private async incrementPinAttempts(userId: string, currentAttempts: number): Promise<void> {
    const newAttempts = currentAttempts + 1;
    const updateData: any = { wallet_pin_attempts: newAttempts };

    if (newAttempts >= PIN_MAX_ATTEMPTS) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + PIN_LOCK_MINUTES);
      updateData.wallet_pin_locked_until = lockedUntil.toISOString();
      logger.warn('Wallet PIN locked due to too many attempts', { userId });
    }

    await supabase.from('users').update(updateData).eq('id', userId);
  }
}

export default new SecurityService();
