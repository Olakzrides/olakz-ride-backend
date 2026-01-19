import bcrypt from 'bcryptjs';
import config from '../config';
import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

class UserService {
  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<any> {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, username, roles, active_role, phone, avatar_url, email_verified, created_at')
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
   * Change password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // Get user
    const { data: user, error } = await supabase
      .from('users')
      .select('password_hash, provider')
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new NotFoundError('User not found');
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
      createdAt: user.created_at,
    };
  }
}

export default new UserService();