import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';

const SUPPORTED_LANGUAGES = ['en', 'fr', 'ha', 'yo', 'ig'];

class ProfileService {
  /**
   * Get full profile for the authenticated user
   */
  async getProfile(userId: string): Promise<any> {
    const { data: user, error } = await supabase
      .from('users')
      .select(
        'id, email, first_name, last_name, username, phone, avatar_url, ' +
        'email_verified, roles, active_role, notifications_enabled, language, created_at'
      )
      .eq('id', userId)
      .single();

    if (error || !user) {
      throw new NotFoundError('User not found');
    }

    return this.formatProfile(user);
  }

  /**
   * Update basic profile info (name, phone)
   */
  async updateProfile(userId: string, data: { firstName?: string; lastName?: string; phone?: string }): Promise<any> {
    const updateData: any = { updated_at: new Date().toISOString() };

    if (data.firstName !== undefined) updateData.first_name = data.firstName.trim();
    if (data.lastName !== undefined) updateData.last_name = data.lastName.trim();
    if (data.phone !== undefined) updateData.phone = data.phone.trim();

    if (Object.keys(updateData).length === 1) {
      throw new ValidationError('No valid fields provided for update');
    }

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select(
        'id, email, first_name, last_name, username, phone, avatar_url, ' +
        'email_verified, roles, active_role, notifications_enabled, language, created_at'
      )
      .single();

    if (error) {
      logger.error('Update profile error:', error);
      throw new Error('Failed to update profile');
    }

    logger.info('Profile updated', { userId });
    return this.formatProfile(user);
  }

  /**
   * Update avatar — accepts base64 image string
   * Uploads to Supabase Storage bucket: avatars
   */
  async updateAvatar(userId: string, base64Image: string, mimeType: string): Promise<{ avatarUrl: string }> {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      throw new ValidationError('Only JPEG, PNG and WebP images are allowed');
    }

    // Decode base64
    const buffer = Buffer.from(base64Image, 'base64');

    // Max 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      throw new ValidationError('Image must be smaller than 5MB');
    }

    const ext = mimeType.split('/')[1];
    const filePath = `avatars/${userId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      logger.error('Avatar upload error:', uploadError);
      throw new Error('Failed to upload avatar');
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
    const avatarUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from('users')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (updateError) {
      logger.error('Avatar URL update error:', updateError);
      throw new Error('Failed to save avatar URL');
    }

    logger.info('Avatar updated', { userId, avatarUrl });
    return { avatarUrl };
  }

  /**
   * Toggle push notifications
   */
  async updateNotifications(userId: string, enabled: boolean): Promise<{ notificationsEnabled: boolean }> {
    const { error } = await supabase
      .from('users')
      .update({ notifications_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      logger.error('Update notifications error:', error);
      throw new Error('Failed to update notification preference');
    }

    logger.info('Notifications updated', { userId, enabled });
    return { notificationsEnabled: enabled };
  }

  /**
   * Set preferred language
   */
  async updateLanguage(userId: string, language: string): Promise<{ language: string }> {
    if (!SUPPORTED_LANGUAGES.includes(language)) {
      throw new ValidationError(`Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
    }

    const { error } = await supabase
      .from('users')
      .update({ language, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      logger.error('Update language error:', error);
      throw new Error('Failed to update language preference');
    }

    logger.info('Language updated', { userId, language });
    return { language };
  }

  private formatProfile(user: any): any {
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      emailVerified: user.email_verified,
      roles: user.roles,
      activeRole: user.active_role,
      notificationsEnabled: user.notifications_enabled ?? true,
      language: user.language ?? 'en',
      createdAt: user.created_at,
    };
  }
}

export default new ProfileService();
