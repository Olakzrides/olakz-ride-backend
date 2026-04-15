import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'OLAKZ';
  for (let i = 0; i < 7; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

class ReferralService {
  /**
   * Get referral info — auto-generates a code if user doesn't have one yet
   */
  async getReferralInfo(userId: string): Promise<any> {
    const { data: user, error } = await supabase
      .from('users')
      .select('referral_code, referred_by')
      .eq('id', userId)
      .single();

    if (error || !user) throw new NotFoundError('User not found');

    let referralCode = (user as any).referral_code;

    // Auto-generate if not set
    if (!referralCode) {
      referralCode = await this.assignReferralCode(userId);
    }

    // Count invited friends
    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', referralCode);

    return {
      referralCode,
      invitedCount: count || 0,
      referredBy: (user as any).referred_by || null,
    };
  }

  /**
   * Update referral code — must be unique, alphanumeric, 6–20 chars
   */
  async updateReferralCode(userId: string, newCode: string): Promise<{ referralCode: string }> {
    const trimmed = newCode.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,20}$/.test(trimmed)) {
      throw new ValidationError('Referral code must be 6–20 alphanumeric characters');
    }

    // Check uniqueness
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', trimmed)
      .neq('id', userId)
      .single();

    if (existing) throw new ConflictError('This referral code is already taken');

    const { error } = await supabase
      .from('users')
      .update({ referral_code: trimmed, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      logger.error('Update referral code error:', error);
      throw new Error('Failed to update referral code');
    }

    logger.info('Referral code updated', { userId, code: trimmed });
    return { referralCode: trimmed };
  }

  /**
   * Assign auto-generated referral code to user
   */
  private async assignReferralCode(userId: string): Promise<string> {
    let code = generateReferralCode();
    let attempts = 0;

    // Retry if collision
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', code)
        .single();

      if (!existing) break;
      code = generateReferralCode();
      attempts++;
    }

    await supabase
      .from('users')
      .update({ referral_code: code, updated_at: new Date().toISOString() })
      .eq('id', userId);

    return code;
  }
}

export default new ReferralService();
