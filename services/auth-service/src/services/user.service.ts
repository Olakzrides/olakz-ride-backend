import bcrypt from 'bcryptjs';
import config from '../config';
import supabase from '../utils/supabase';
import logger from '../utils/logger';
import tokenService from './token.service';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

class UserService {
  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<any> {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, username, roles, active_role, phone, avatar_url, email_verified, notifications_enabled, language, created_at')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new NotFoundError('User not found');
    }

    return {
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
      notificationsEnabled: user.notifications_enabled ?? true,
      language: user.language ?? 'en',
      createdAt: user.created_at,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updates: any): Promise<any> {
    const allowedUpdates = ['first_name', 'last_name', 'username', 'phone', 'avatar_url'];
    const updateData: any = { updated_at: new Date().toISOString() };

    // Filter allowed updates
    Object.keys(updates).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        updateData[key] = updates[key];
      }
    });

    // Check if username is already taken
    if (updates.username) {
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', updates.username)
        .neq('id', userId)
        .single();

      if (existingUser) {
        throw new ConflictError('Username is already taken');
      }
    }

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating user profile:', error);
      throw new Error('Failed to update profile');
    }

    logger.info(`Profile updated for user: ${userId}`);
    return this.formatUserData(user);
  }

  /**
   * Update user roles (Admin only)
   */
  async updateRoles(userId: string, roles: string[], activeRole?: string): Promise<any> {
    // Validate that activeRole is in roles array
    if (activeRole && !roles.includes(activeRole)) {
      throw new ValidationError('Active role must be one of the assigned roles');
    }

    const updateData: any = {
      roles,
      updated_at: new Date().toISOString(),
    };

    if (activeRole) {
      updateData.active_role = activeRole;
    }

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating user roles:', error);
      throw new Error('Failed to update roles');
    }

    logger.info(`Roles updated to ${roles.join(', ')} for user: ${userId}`);
    return this.formatUserData(user);
  }

  /**
   * Add role to user (used by driver registration)
   */
  async addRole(userId: string, role: string): Promise<any> {
    // Get current user
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('roles, active_role')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      throw new NotFoundError('User not found');
    }

    // Check if role already exists
    if (user.roles.includes(role)) {
      logger.info(`User ${userId} already has role: ${role}`);
      return this.getUserById(userId);
    }

    // Add role to array
    const updatedRoles = [...user.roles, role];

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({
        roles: updatedRoles,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Error adding role to user:', error);
      throw new Error('Failed to add role');
    }

    logger.info(`Role ${role} added to user: ${userId}`);
    return this.formatUserData(updatedUser);
  }

  /**
   * Switch active role
   */
  async switchActiveRole(userId: string, activeRole: string): Promise<any> {
    // Get current user
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('roles')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      throw new NotFoundError('User not found');
    }

    // Validate that user has this role
    if (!user.roles.includes(activeRole)) {
      throw new ValidationError('You do not have this role assigned');
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({
        active_role: activeRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Error switching active role:', error);
      throw new Error('Failed to switch active role');
    }

    logger.info(`Active role switched to ${activeRole} for user: ${userId}`);
    return this.formatUserData(updatedUser);
  }

  /**
   * Update phone number.
   * New number immediately becomes the user's wallet account identifier.
   * No OTP needed — simple update.
   */
  async updatePhone(userId: string, phone: string): Promise<any> {
    // Normalise to E.164
    const normalizePhone = (p: string) => {
      const d = p.replace(/\D/g, '');
      if (d.startsWith('234')) return `+${d}`;
      if (d.startsWith('0'))   return `+234${d.slice(1)}`;
      if (d.length === 10)     return `+234${d}`;
      return `+${d}`;
    };
    const normalizedPhone = normalizePhone(phone);

    // Ensure the phone isn't already taken by another active account
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('phone', normalizedPhone)
      .neq('id', userId)
      .neq('status', 'account_deleted')
      .single();

    if (existing) {
      throw new ConflictError('This phone number is already associated with another account.');
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({ phone: normalizedPhone, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating phone number:', error);
      throw new Error('Failed to update phone number');
    }

    logger.info(`Phone number updated for user: ${userId}`);
    return this.formatUserData(user);
  }

  /**
   * Change password.
   * Blocked for admin and super_admin accounts — password is exclusively
   * managed by the super admin. Restriction lifts when admin role is removed.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash, provider, roles')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new NotFoundError('User not found');
    }

    // ── Block admin accounts from self-service password changes ───────────────
    const userRoles: string[] = Array.isArray(user.roles) ? user.roles : [];
    if (userRoles.includes('admin') || userRoles.includes('super_admin')) {
      throw new ValidationError(
        'Admin accounts cannot change their own password. Contact your Super Admin to reset it.'
      );
    }

    // Check if user uses password authentication
    if (user.provider !== 'emailpass') {
      throw new ValidationError('Password change is not available for OAuth accounts');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isPasswordValid) {
      throw new ValidationError('Current password is incorrect');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      logger.error('Error changing password:', updateError);
      throw new Error('Failed to change password');
    }

    logger.info(`Password changed for user: ${userId}`);
  }

  /**
   * Delete account (soft delete).
   *
   * What happens:
   *  - users.status         → 'account_deleted'
   *  - drivers.status       → 'account_deleted'  (if driver record exists)
   *  - vendors.verification_status → 'account_deleted'  (if vendor record exists)
   *
   * What does NOT happen:
   *  - No rows deleted — all data is preserved for audit
   *  - Email/phone are NOT cleared — user can re-register with same credentials
   *    because re-registration creates a brand-new row; the old deleted row stays
   *
   * The status 'account_deleted' is deliberately distinct from 'terminated'
   * (which is admin-initiated) so audit logs can distinguish self-deletion
   * from admin action.
   */
  async deleteAccount(userId: string, reason?: string): Promise<void> {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, status')
      .eq('id', userId)
      .single();

    if (fetchError || !user) {
      logger.error('deleteAccount: user lookup failed', {
        userId,
        error: fetchError?.message,
        code:  fetchError?.code,
      });
      throw new NotFoundError('User not found');
    }

    // Idempotent — if already deleted, return success instead of throwing
    if (user.status === 'account_deleted') {
      logger.info('deleteAccount: account already deleted (idempotent)', { userId });
      return;
    }

    const now = new Date().toISOString();

    // ── 1. Mark the users row as deleted ─────────────────────────────────────
    const { error: userErr } = await supabase
      .from('users')
      .update({ status: 'account_deleted', updated_at: now })
      .eq('id', userId);

    if (userErr) {
      logger.error('Error marking user as account_deleted:', userErr);
      throw new Error('Failed to delete account');
    }

    // ── 2. Revoke all tokens immediately ─────────────────────────────────────
    try {
      await tokenService.revokeAllUserTokens(userId);
    } catch (tokenErr) {
      logger.warn('Could not revoke tokens on account delete (non-fatal)', {
        userId, error: tokenErr instanceof Error ? tokenErr.message : String(tokenErr),
      });
    }

    // ── 3. Disable driver record (non-fatal) ──────────────────────────────────
    await supabase
      .from('drivers')
      .update({ status: 'account_deleted', updated_at: now })
      .eq('user_id', userId);

    // ── 4. Disable vendor record + deactivate all vendor products (non-fatal) ─
    // Look up the vendor record to get the owner_id used in food/marketplace
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id, user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (vendor) {
      // Mark vendor record as deleted
      await supabase
        .from('vendors')
        .update({ verification_status: 'account_deleted', is_active: false, updated_at: now })
        .eq('user_id', userId);

      // Deactivate food menu items (food_restaurants is keyed by owner_id = user_id)
      const { data: restaurant } = await supabase
        .from('food_restaurants')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle();

      if (restaurant) {
        await supabase
          .from('food_restaurants')
          .update({ is_active: false, is_open: false, updated_at: now })
          .eq('owner_id', userId);

        await supabase
          .from('food_menu_items')
          .update({ is_active: false, is_available: false, updated_at: now })
          .eq('restaurant_id', restaurant.id);

        logger.info('Food restaurant + menu deactivated on account delete', { userId, restaurantId: restaurant.id });
      }

      // Deactivate marketplace products (marketplace_stores is keyed by owner_id = user_id)
      const { data: store } = await supabase
        .from('marketplace_stores')
        .select('id')
        .eq('owner_id', userId)
        .maybeSingle();

      if (store) {
        await supabase
          .from('marketplace_stores')
          .update({ is_active: false, is_open: false, updated_at: now })
          .eq('owner_id', userId);

        await supabase
          .from('marketplace_products')
          .update({ is_active: false, is_available: false, updated_at: now })
          .eq('store_id', store.id);

        logger.info('Marketplace store + products deactivated on account delete', { userId, storeId: store.id });
      }
    }

    logger.info('User self-deleted account — data preserved for audit', {
      userId,
      reason: reason?.trim() || 'no reason provided',
    });
  }

  /**
   * Format user data for response
   */
  private formatUserData(user: any): any {
    return {
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
      notificationsEnabled: user.notifications_enabled ?? true,
      language: user.language ?? 'en',
      createdAt: user.created_at,
    };
  }
}

export default new UserService();