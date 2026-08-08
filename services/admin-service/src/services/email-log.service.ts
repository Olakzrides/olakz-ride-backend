import axios from 'axios';
import { supabase } from '../config/database';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmailType =
  | 'otp'
  | 'welcome'
  | 'driver_approval'
  | 'driver_rejection'
  | 'admin_pending'
  | 'admin_approval'
  | 'order_confirmation'
  | 'dispute'
  | 'broadcast'
  | 'other';

export type EmailStatus = 'pending' | 'sent' | 'failed';

export interface LogEmailParams {
  recipientEmail: string;
  recipientName?: string;
  subject:        string;
  bodyHtml:       string;
  emailType:      EmailType;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class EmailLogService {

  /**
   * Create a log entry with status 'pending', then send via ZeptoMail,
   * and update to 'sent' or 'failed'. Returns the log row ID.
   *
   * This is the single transport used by AdminEmailService.
   * The auth-service has its own transport — logs from there are written
   * via the internal API route.
   */
  static async sendAndLog(params: LogEmailParams): Promise<void> {
    const { recipientEmail, recipientName, subject, bodyHtml, emailType } = params;

    // 1. Insert a pending log entry
    const { data: logRow, error: insertErr } = await supabase
      .from('email_logs')
      .insert({
        recipient_email: recipientEmail,
        recipient_name:  recipientName ?? null,
        subject,
        body_html:       bodyHtml,
        email_type:      emailType,
        status:          'pending',
      })
      .select('id')
      .single();

    const logId = logRow?.id ?? null;
    if (insertErr) {
      logger.warn('EmailLogService: failed to insert log entry', { error: insertErr.message });
    }

    // 2. Send via ZeptoMail
    const apiUrl = process.env.ZEPTO_API_URL;
    const apiKey = process.env.ZEPTO_API_KEY;

    if (!apiUrl || !apiKey) {
      logger.warn(`[EmailLog] ZeptoMail not configured — skipping "${subject}" → ${recipientEmail}`);
      if (logId) {
        await supabase
          .from('email_logs')
          .update({ status: 'failed', error_message: 'ZeptoMail not configured', sent_at: null })
          .eq('id', logId);
      }
      return;
    }

    try {
      await axios.post(
        apiUrl,
        {
          from: {
            address: process.env.ZEPTO_FROM_EMAIL || 'noreply@olakzrides.com',
            name:    process.env.ZEPTO_FROM_NAME  || 'Olakz Ride',
          },
          to: [{ email_address: { address: recipientEmail } }],
          subject,
          htmlbody: bodyHtml,
        },
        {
          headers: {
            Accept:         'application/json',
            'Content-Type': 'application/json',
            Authorization:  `Zoho-enczapikey ${apiKey}`,
          },
          timeout: 10000,
        }
      );

      // 3a. Mark as sent
      if (logId) {
        await supabase
          .from('email_logs')
          .update({ status: 'sent', sent_at: new Date().toISOString(), error_message: null })
          .eq('id', logId);
      }

      logger.info(`[EmailLog] Sent "${subject}" → ${recipientEmail}`);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Unknown error';

      // 3b. Mark as failed
      if (logId) {
        await supabase
          .from('email_logs')
          .update({ status: 'failed', error_message: errorMsg, sent_at: null })
          .eq('id', logId);
      }

      logger.error(`[EmailLog] Failed "${subject}" → ${recipientEmail}`, { error: errorMsg });
    }
  }

  /**
   * Log an email that was sent by the auth-service (via internal API call).
   * The auth-service calls this after attempting to send so both services
   * share the same email_logs table.
   */
  static async logExternal(params: LogEmailParams & { status: EmailStatus; errorMessage?: string }): Promise<void> {
    const { recipientEmail, recipientName, subject, bodyHtml, emailType, status, errorMessage } = params;

    const { error } = await supabase
      .from('email_logs')
      .insert({
        recipient_email: recipientEmail,
        recipient_name:  recipientName ?? null,
        subject,
        body_html:       bodyHtml,
        email_type:      emailType,
        status,
        error_message:   errorMessage ?? null,
        sent_at:         status === 'sent' ? new Date().toISOString() : null,
      });

    if (error) {
      logger.warn('EmailLogService.logExternal: failed to insert', { error: error.message });
    }
  }

  /**
   * Resend a specific email by ID.
   * Increments resend_count and updates status/sent_at.
   */
  static async resend(logId: string): Promise<void> {
    const { data: log, error: fetchErr } = await supabase
      .from('email_logs')
      .select('recipient_email, recipient_name, subject, body_html, email_type, resend_count')
      .eq('id', logId)
      .single();

    if (fetchErr || !log) throw new Error('Email log not found');

    const apiUrl = process.env.ZEPTO_API_URL;
    const apiKey = process.env.ZEPTO_API_KEY;

    if (!apiUrl || !apiKey) {
      throw new Error('ZeptoMail not configured');
    }

    try {
      await axios.post(
        apiUrl,
        {
          from: {
            address: process.env.ZEPTO_FROM_EMAIL || 'noreply@olakzrides.com',
            name:    process.env.ZEPTO_FROM_NAME  || 'Olakz Ride',
          },
          to: [{ email_address: { address: log.recipient_email } }],
          subject:  log.subject,
          htmlbody: log.body_html,
        },
        {
          headers: {
            Accept:         'application/json',
            'Content-Type': 'application/json',
            Authorization:  `Zoho-enczapikey ${apiKey}`,
          },
          timeout: 10000,
        }
      );

      await supabase
        .from('email_logs')
        .update({
          status:        'sent',
          sent_at:       new Date().toISOString(),
          last_resent_at: new Date().toISOString(),
          resend_count:  (log.resend_count ?? 0) + 1,
          error_message: null,
        })
        .eq('id', logId);

      logger.info(`[EmailLog] Resent "${log.subject}" → ${log.recipient_email}`);
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message || 'Unknown error';

      await supabase
        .from('email_logs')
        .update({
          status:        'failed',
          last_resent_at: new Date().toISOString(),
          resend_count:  (log.resend_count ?? 0) + 1,
          error_message: errorMsg,
        })
        .eq('id', logId);

      throw new Error(`Resend failed: ${errorMsg}`);
    }
  }

  /**
   * Bulk resend all failed emails.
   * Returns { resent, failed } counts.
   */
  static async resendAllFailed(): Promise<{ resent: number; failed: number }> {
    const { data: failedLogs, error } = await supabase
      .from('email_logs')
      .select('id')
      .eq('status', 'failed')
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to fetch failed emails: ${error.message}`);

    let resent = 0;
    let failed = 0;

    for (const log of failedLogs ?? []) {
      try {
        await EmailLogService.resend(log.id);
        resent++;
      } catch {
        failed++;
      }
    }

    logger.info(`[EmailLog] Bulk resend complete: ${resent} resent, ${failed} still failed`);
    return { resent, failed };
  }

  /**
   * List email logs with filters — for the admin dashboard table.
   */
  static async listLogs(params: {
    search?:    string;
    status?:    EmailStatus | 'all';
    emailType?: string;
    from?:      string;
    to?:        string;
    page:       number;
    limit:      number;
  }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('email_logs')
      .select('id, recipient_email, recipient_name, subject, email_type, status, resend_count, sent_at, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status && params.status !== 'all') {
      query = query.eq('status', params.status);
    }
    if (params.emailType && params.emailType !== 'all') {
      query = query.eq('email_type', params.emailType);
    }
    if (params.search?.trim()) {
      query = query.or(
        `recipient_email.ilike.%${params.search.trim()}%,subject.ilike.%${params.search.trim()}%`
      );
    }
    if (params.from) query = query.gte('created_at', params.from);
    if (params.to) {
      const toEnd = new Date(params.to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to list email logs: ${error.message}`);

    return {
      logs: data ?? [],
      pagination: {
        total: count ?? 0,
        page,
        limit,
        pages: Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Get full detail of one email log including body_html and error_message.
   */
  static async getById(logId: string) {
    const { data, error } = await supabase
      .from('email_logs')
      .select('*')
      .eq('id', logId)
      .single();

    if (error || !data) throw new Error('Email log not found');
    return data;
  }

  /**
   * Status counts for the filter tabs.
   */
  static async getStatusCounts() {
    const { data, error } = await supabase
      .from('email_logs')
      .select('status');

    if (error) throw new Error(`Failed to get status counts: ${error.message}`);

    const counts = { all: 0, sent: 0, failed: 0, pending: 0 };
    for (const row of data ?? []) {
      counts.all++;
      if (row.status === 'sent')    counts.sent++;
      if (row.status === 'failed')  counts.failed++;
      if (row.status === 'pending') counts.pending++;
    }
    return counts;
  }
}
