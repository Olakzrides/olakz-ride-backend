import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';

class SafetyService {
  /**
   * Get safety settings (emergency contact + alert timer)
   */
  async getSafetySettings(userId: string): Promise<any> {
    const { data: user, error } = await supabase
      .from('users')
      .select(
        'emergency_contact_name, emergency_contact_phone, emergency_contact_email, ' +
        'alert_timer_enabled, alert_timer_minutes'
      )
      .eq('id', userId)
      .single();

    if (error || !user) throw new NotFoundError('User not found');

    const u = user as any;

    return {
      emergencyContact: {
        name: u.emergency_contact_name || null,
        phone: u.emergency_contact_phone || null,
        email: u.emergency_contact_email || null,
      },
      alertTimer: {
        enabled: u.alert_timer_enabled ?? false,
        minutes: u.alert_timer_minutes ?? 6,
      },
    };
  }

  /**
   * Update emergency contact
   */
  async updateEmergencyContact(
    userId: string,
    data: { name: string; phone: string; email?: string }
  ): Promise<any> {
    if (!data.name?.trim()) throw new ValidationError('Emergency contact name is required');
    if (!data.phone?.trim()) throw new ValidationError('Emergency contact phone is required');

    const { error } = await supabase
      .from('users')
      .update({
        emergency_contact_name: data.name.trim(),
        emergency_contact_phone: data.phone.trim(),
        emergency_contact_email: data.email?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      logger.error('Update emergency contact error:', error);
      throw new Error('Failed to update emergency contact');
    }

    logger.info('Emergency contact updated', { userId });

    return {
      emergencyContactName: data.name.trim(),
      emergencyContactPhone: data.phone.trim(),
      emergencyContactEmail: data.email?.trim() || null,
    };
  }

  /**
   * Update alert timer settings
   */
  async updateAlertTimer(
    userId: string,
    data: { enabled: boolean; minutes?: number }
  ): Promise<any> {
    if (typeof data.enabled !== 'boolean') {
      throw new ValidationError('enabled must be a boolean');
    }

    if (data.minutes !== undefined) {
      if (!Number.isInteger(data.minutes) || data.minutes < 1 || data.minutes > 60) {
        throw new ValidationError('minutes must be an integer between 1 and 60');
      }
    }

    const updateData: any = {
      alert_timer_enabled: data.enabled,
      updated_at: new Date().toISOString(),
    };

    if (data.minutes !== undefined) {
      updateData.alert_timer_minutes = data.minutes;
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      logger.error('Update alert timer error:', error);
      throw new Error('Failed to update alert timer');
    }

    // Fetch updated values to return accurate state
    const { data: user } = await supabase
      .from('users')
      .select('alert_timer_enabled, alert_timer_minutes')
      .eq('id', userId)
      .single();

    logger.info('Alert timer updated', { userId, enabled: data.enabled });

    return {
      alertTimerEnabled: user?.alert_timer_enabled ?? data.enabled,
      alertTimerMinutes: user?.alert_timer_minutes ?? data.minutes ?? 6,
    };
  }
}

export default new SafetyService();
