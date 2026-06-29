import axios from 'axios';
import { logger } from '../utils/logger';

/**
 * Lightweight email service for admin-service.
 * Uses the same ZeptoMail transport as auth-service.
 * All methods are non-throwing — email failures are logged but never
 * crash the main request flow.
 */
class AdminEmailService {

  // ── Transport ──────────────────────────────────────────────────────────────

  private async send(to: string, subject: string, html: string): Promise<void> {
    const apiUrl = process.env.ZEPTO_API_URL;
    const apiKey = process.env.ZEPTO_API_KEY;

    if (!apiUrl || !apiKey) {
      logger.warn(`[AdminEmail] Skipped — ZeptoMail not configured: "${subject}" → ${to}`);
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
          to: [{ email_address: { address: to } }],
          subject,
          htmlbody: html,
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

      logger.info(`[AdminEmail] Sent "${subject}" → ${to}`);
    } catch (err: any) {
      logger.error(`[AdminEmail] Failed to send "${subject}" → ${to}`, {
        error: err.response?.data || err.message,
      });
    }
  }

  // ── Public methods ─────────────────────────────────────────────────────────

  /**
   * Sent immediately after a super admin creates a sub-admin with status = 'pending'.
   * Informs the new admin their account exists but is not yet active.
   */
  async sendPendingAccountEmail(params: {
    to:         string;
    firstName:  string;
    role:       string;
    email:      string;
    password:   string;
  }): Promise<void> {
    const { to, firstName, role, email, password } = params;
    const subject = 'Your Olakz Ride Admin Account — Pending Approval';
    const html    = this.pendingTemplate({ firstName, role, email, password });
    await this.send(to, subject, html);
  }

  /**
   * Sent when a super admin approves a pending sub-admin account.
   * Gives the admin their login credentials and a welcome message.
   */
  async sendApprovalEmail(params: {
    to:        string;
    firstName: string;
    role:      string;
    email:     string;
    password:  string;
  }): Promise<void> {
    const { to, firstName, role, email, password } = params;
    const subject = 'Welcome to Olakz Ride — Your Admin Account is Active!';
    const html    = this.approvalTemplate({ firstName, role, email, password });
    await this.send(to, subject, html);
  }

  // ── Email templates ────────────────────────────────────────────────────────

  private pendingTemplate(p: {
    firstName: string;
    role:      string;
    email:     string;
    password:  string;
  }): string {
    const roleLabel = p.role === 'super_admin' ? 'Super Admin' : 'Admin';
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Account Pending – Olakz Ride</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                🚗 Olakz Ride
              </h1>
              <p style="margin:6px 0 0;color:#a0a8c0;font-size:13px;">Admin Platform</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:22px;">
                Hi ${p.firstName}, your account has been created
              </h2>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">
                A <strong>${roleLabel}</strong> account has been created for you on the
                Olakz Ride admin platform. Your account is currently
                <strong style="color:#f59e0b;">pending approval</strong> by the Super Admin.
              </p>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">
                You will receive another email once your account has been approved and
                you can log in. In the meantime, here are your login credentials —
                keep them safe:
              </p>

              <!-- Credentials box -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 12px;font-size:14px;color:#64748b;font-weight:600;
                               text-transform:uppercase;letter-spacing:0.5px;">Your Credentials</p>
                    <table>
                      <tr>
                        <td style="padding:4px 16px 4px 0;color:#64748b;font-size:14px;font-weight:600;">Email</td>
                        <td style="padding:4px 0;color:#1a1a2e;font-size:14px;">${p.email}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 16px 4px 0;color:#64748b;font-size:14px;font-weight:600;">Password</td>
                        <td style="padding:4px 0;color:#1a1a2e;font-size:14px;font-family:monospace;">${p.password}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 16px 4px 0;color:#64748b;font-size:14px;font-weight:600;">Role</td>
                        <td style="padding:4px 0;color:#1a1a2e;font-size:14px;">${roleLabel}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Status badge -->
              <div style="background:#fef9ec;border:1px solid #fde68a;border-radius:8px;
                          padding:14px 20px;margin-bottom:28px;">
                <p style="margin:0;color:#92400e;font-size:14px;">
                  ⏳ <strong>Status: Pending Approval</strong> — You cannot log in until
                  the Super Admin approves your account. Watch out for our next email.
                </p>
              </div>

              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                If you did not expect this email or believe it was sent in error,
                please contact your organisation administrator immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                © ${new Date().getFullYear()} Olakz Ride. All rights reserved.<br />
                This is an automated message — please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  private approvalTemplate(p: {
    firstName: string;
    role:      string;
    email:     string;
    password:  string;
  }): string {
    const roleLabel = p.role === 'super_admin' ? 'Super Admin' : 'Admin';
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Account Approved – Olakz Ride</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">
                🚗 Olakz Ride
              </h1>
              <p style="margin:6px 0 0;color:#a0a8c0;font-size:13px;">Admin Platform</p>
            </td>
          </tr>

          <!-- Approved banner -->
          <tr>
            <td style="background:#ecfdf5;padding:20px 40px;border-bottom:1px solid #d1fae5;">
              <p style="margin:0;color:#065f46;font-size:15px;font-weight:600;text-align:center;">
                ✅ Your admin account has been approved!
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1a1a2e;font-size:22px;">
                Welcome to Olakz Ride, ${p.firstName}!
              </h2>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">
                Your <strong>${roleLabel}</strong> account has been approved by the Super Admin.
                You can now log in to the Olakz Ride admin dashboard using the
                credentials below.
              </p>

              <!-- Credentials box -->
              <table width="100%" cellpadding="0" cellspacing="0"
                     style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 12px;font-size:14px;color:#64748b;font-weight:600;
                               text-transform:uppercase;letter-spacing:0.5px;">Login Credentials</p>
                    <table>
                      <tr>
                        <td style="padding:4px 16px 4px 0;color:#64748b;font-size:14px;font-weight:600;">Email</td>
                        <td style="padding:4px 0;color:#1a1a2e;font-size:14px;">${p.email}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 16px 4px 0;color:#64748b;font-size:14px;font-weight:600;">Password</td>
                        <td style="padding:4px 0;color:#1a1a2e;font-size:14px;font-family:monospace;">${p.password}</td>
                      </tr>
                      <tr>
                        <td style="padding:4px 16px 4px 0;color:#64748b;font-size:14px;font-weight:600;">Role</td>
                        <td style="padding:4px 0;color:#1a1a2e;font-size:14px;">${roleLabel}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;
                          padding:14px 20px;margin-bottom:28px;">
                <p style="margin:0;color:#1e40af;font-size:14px;line-height:1.6;">
                  🔒 <strong>Security tip:</strong> For your protection, only the Super Admin
                  can reset your password. If you ever lose access, contact them directly.
                  Never share your credentials with anyone.
                </p>
              </div>

              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                If you did not expect this email or believe it was sent in error,
                please contact your organisation administrator immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                © ${new Date().getFullYear()} Olakz Ride. All rights reserved.<br />
                This is an automated message — please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

export const adminEmailService = new AdminEmailService();
