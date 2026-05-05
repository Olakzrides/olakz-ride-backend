import axios from 'axios';
import { supabase } from '../config/database';
import { logger } from '../utils/logger';

interface SendDriverReviewEmailParams {
  driverId: string;
  userId: string;
  action: 'approve' | 'reject';
  notes?: string;
  rejectionReason?: string;
}

export class NotificationService {
  private authServiceUrl: string;
  private internalApiKey: string;
  private supportEmail: string;

  constructor() {
    this.authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3003';
    this.internalApiKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
    this.supportEmail = process.env.SUPPORT_EMAIL || 'support@olakzride.com';
  }

  async sendDriverReviewEmail(params: SendDriverReviewEmailParams): Promise<{ success: boolean; error?: string }> {
    try {
      const email = await this.getUserEmail(params.userId);
      if (!email) return { success: false, error: 'Driver email not found' };

      const name = await this.getUserName(params.userId);
      const content =
        params.action === 'approve'
          ? this.approvalEmail(name, params.notes)
          : this.rejectionEmail(name, params.rejectionReason || 'Application did not meet requirements', params.notes);

      const sent = await this.sendEmail({ to: email, ...content });
      return sent ? { success: true } : { success: false, error: 'Failed to send email' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('sendDriverReviewEmail error', { error: msg });
      return { success: false, error: msg };
    }
  }

  private async getUserEmail(userId: string): Promise<string | null> {
    const { data, error } = await supabase.from('users').select('email').eq('id', userId).single();
    if (error || !data) return null;
    return data.email;
  }

  private async getUserName(userId: string): Promise<string> {
    const { data } = await supabase.from('users').select('full_name, email').eq('id', userId).single();
    if (!data) return 'Driver';
    return data.full_name || data.email?.split('@')[0] || 'Driver';
  }

  private async sendEmail(params: { to: string; subject: string; html: string; text?: string }): Promise<boolean> {
    try {
      const response = await axios.post(`${this.authServiceUrl}/api/auth/send-email`, params, {
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': this.internalApiKey },
        timeout: 10000,
      });
      return response.data.success === true;
    } catch (err: unknown) {
      logger.error('sendEmail error', { error: err instanceof Error ? err.message : String(err) });
      return false;
    }
  }

  private approvalEmail(name: string, notes?: string): { subject: string; html: string; text: string } {
    return {
      subject: '🎉 Your OlakzRide Driver Application is Approved!',
      html: `<p>Hi ${name},</p><p>Your driver application has been <strong>approved</strong>. You can now start accepting rides.</p>${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}<p>Best regards,<br>The OlakzRide Team</p>`,
      text: `Hi ${name},\n\nYour driver application has been approved.\n${notes ? `Notes: ${notes}\n` : ''}\nBest regards,\nThe OlakzRide Team`,
    };
  }

  private rejectionEmail(name: string, reason: string, notes?: string): { subject: string; html: string; text: string } {
    return {
      subject: 'OlakzRide Driver Application Update',
      html: `<p>Hi ${name},</p><p>Your application was not approved.</p><p><strong>Reason:</strong> ${reason}</p>${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}<p>Please address the concerns and reapply. Contact ${this.supportEmail} for help.</p>`,
      text: `Hi ${name},\n\nYour application was not approved.\nReason: ${reason}\n${notes ? `Notes: ${notes}\n` : ''}\nContact ${this.supportEmail} for help.`,
    };
  }
}
