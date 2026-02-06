import axios from 'axios';
import { supabase } from '../config/database';
import { logger } from '../config/logger';

interface SendDriverReviewEmailParams {
  driverId: string;
  userId: string;
  action: 'approve' | 'reject';
  reviewerName?: string;
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
    
    // Debug logging
    logger.info('NotificationService initialized:', {
      authServiceUrl: this.authServiceUrl,
      hasApiKey: !!this.internalApiKey,
      apiKeyLength: this.internalApiKey?.length,
      supportEmail: this.supportEmail,
    });
  }

  /**
   * Send email notification for driver review
   */
  async sendDriverReviewEmail(params: SendDriverReviewEmailParams): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Get driver email from auth service
      const driverEmail = await this.getDriverEmail(params.userId);
      if (!driverEmail) {
        logger.error('Driver email not found:', { userId: params.userId });
        return { success: false, error: 'Driver email not found' };
      }

      // Get driver name
      const driverName = await this.getDriverName(params.userId);

      // Generate email content based on action
      const emailContent = this.generateEmailContent({
        action: params.action,
        driverName,
        notes: params.notes,
        rejectionReason: params.rejectionReason,
      });

      // Send email via auth service
      const emailSent = await this.sendEmail({
        to: driverEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (emailSent) {
        logger.info('Driver review email sent successfully:', {
          driverId: params.driverId,
          userId: params.userId,
          action: params.action,
          email: driverEmail,
        });
        return { success: true };
      } else {
        return { success: false, error: 'Failed to send email' };
      }
    } catch (error: any) {
      logger.error('Send driver review email error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send admin notification when new driver registers
   */
  async sendAdminNewDriverNotification(params: {
    driverName: string;
    driverEmail: string;
    vehicleType: string;
    serviceTypes: string[];
    registrationId: string;
  }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Get all admin emails
      const adminEmails = await this.getAdminEmails();
      
      if (adminEmails.length === 0) {
        logger.warn('No admin emails found for new driver notification');
        return { success: false, error: 'No admin emails configured' };
      }

      // Generate email content
      const emailContent = this.generateAdminNewDriverEmail({
        driverName: params.driverName,
        driverEmail: params.driverEmail,
        vehicleType: params.vehicleType,
        serviceTypes: params.serviceTypes,
        registrationId: params.registrationId,
      });

      // Send email to all admins
      let successCount = 0;
      let failCount = 0;

      for (const adminEmail of adminEmails) {
        const emailSent = await this.sendEmail({
          to: adminEmail,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });

        if (emailSent) {
          successCount++;
          logger.info('Admin notification sent:', {
            adminEmail,
            driverName: params.driverName,
            registrationId: params.registrationId,
          });
        } else {
          failCount++;
          logger.error('Failed to send admin notification:', {
            adminEmail,
            driverName: params.driverName,
          });
        }
      }

      if (successCount > 0) {
        logger.info('Admin notifications sent:', {
          successCount,
          failCount,
          totalAdmins: adminEmails.length,
          registrationId: params.registrationId,
        });
        return { success: true };
      } else {
        return { success: false, error: 'Failed to send to any admin' };
      }
    } catch (error: any) {
      logger.error('Send admin notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get driver email from auth service
   */
  private async getDriverEmail(userId: string): Promise<string | null> {
    try {
      // Query users table in auth service database
      const { data, error } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();

      if (error || !data) {
        logger.error('Failed to get driver email:', { userId, error });
        return null;
      }

      return data.email;
    } catch (error: any) {
      logger.error('Get driver email error:', error);
      return null;
    }
  }

  /**
   * Get driver name from auth service
   */
  private async getDriverName(userId: string): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return 'Driver';
      }

      return data.full_name || data.email.split('@')[0] || 'Driver';
    } catch (error: any) {
      return 'Driver';
    }
  }

  /**
   * Get all admin emails
   */
  private async getAdminEmails(): Promise<string[]> {
    try {
      // Query users where roles array contains 'admin'
      const { data, error } = await supabase
        .from('users')
        .select('email, roles')
        .contains('roles', ['admin']);

      if (error) {
        logger.error('Failed to get admin users:', error);
        return [];
      }

      if (!data || data.length === 0) {
        logger.warn('No admin users found in database');
        return [];
      }

      // Filter and return emails
      const adminEmails = data
        .filter(user => user.email && user.roles && user.roles.includes('admin'))
        .map(user => user.email);

      logger.info('Found admin emails:', {
        count: adminEmails.length,
        emails: adminEmails,
      });

      return adminEmails;
    } catch (error: any) {
      logger.error('Get admin emails error:', error);
      return [];
    }
  }

  /**
   * Send email via auth service
   */
  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    try {
      logger.info('Sending email to auth service:', {
        url: `${this.authServiceUrl}/api/auth/send-email`,
        to: params.to,
        hasApiKey: !!this.internalApiKey,
        apiKeyPreview: this.internalApiKey?.substring(0, 10) + '...',
      });

      const response = await axios.post(
        `${this.authServiceUrl}/api/auth/send-email`,
        params,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-internal-api-key': this.internalApiKey,
          },
          timeout: 10000, // 10 seconds
        }
      );

      return response.data.success === true;
    } catch (error: any) {
      logger.error('Send email via auth service error:', {
        error: error.message,
        to: params.to,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
      });
      return false;
    }
  }

  /**
   * Generate email content based on action
   */
  private generateEmailContent(params: {
    action: 'approve' | 'reject';
    driverName: string;
    notes?: string;
    rejectionReason?: string;
  }): { subject: string; html: string; text: string } {
    if (params.action === 'approve') {
      return this.generateApprovalEmail(params.driverName, params.notes);
    } else {
      return this.generateRejectionEmail(
        params.driverName,
        params.rejectionReason || 'Application did not meet requirements',
        params.notes
      );
    }
  }

  /**
   * Generate approval email
   */
  private generateApprovalEmail(driverName: string, notes?: string): {
    subject: string;
    html: string;
    text: string;
  } {
    const subject = '🎉 Your OlakzRide Driver Application is Approved!';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
    .button { background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .notes-box { background: #e8f5e9; border-left: 4px solid #4CAF50; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Application Approved!</h1>
    </div>
    <div class="content">
      <p>Hi ${driverName},</p>
      
      <p>Great news! Your driver application has been <strong>approved</strong>.</p>
      
      <p>You can now start accepting rides and earning with OlakzRide.</p>
      
      ${notes ? `<div class="notes-box"><strong>Admin Notes:</strong><br>${notes}</div>` : ''}
      
      <p><strong>Next Steps:</strong></p>
      <ol>
        <li>Download the OlakzRide Driver app</li>
        <li>Log in with your credentials</li>
        <li>Complete your profile setup</li>
        <li>Start accepting rides!</li>
      </ol>
      
      <p>If you have any questions, feel free to contact our support team at ${this.supportEmail}.</p>
      
      <p>Welcome to the OlakzRide family!</p>
      
      <p>Best regards,<br>The OlakzRide Team</p>
    </div>
    <div class="footer">
      <p>© 2026 OlakzRide. All rights reserved.</p>
      <p>Need help? Contact us at ${this.supportEmail}</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
Hi ${driverName},

Great news! Your driver application has been approved.

You can now start accepting rides and earning with OlakzRide.

${notes ? `Admin Notes: ${notes}\n\n` : ''}

Next Steps:
1. Download the OlakzRide Driver app
2. Log in with your credentials
3. Complete your profile setup
4. Start accepting rides!

If you have any questions, feel free to contact our support team.

Welcome to the OlakzRide family!

Best regards,
The OlakzRide Team
    `;

    return { subject, html, text };
  }

  /**
   * Generate rejection email
   */
  private generateRejectionEmail(
    driverName: string,
    rejectionReason: string,
    notes?: string
  ): { subject: string; html: string; text: string } {
    const subject = 'OlakzRide Driver Application Update';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
    .button { background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .reason-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
    .notes-box { background: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Update</h1>
    </div>
    <div class="content">
      <p>Hi ${driverName},</p>
      
      <p>Thank you for your interest in becoming a driver with OlakzRide.</p>
      
      <p>After careful review, we regret to inform you that your application has not been approved at this time.</p>
      
      <div class="reason-box">
        <strong>Reason:</strong><br>
        ${rejectionReason}
      </div>
      
      ${notes ? `<div class="notes-box"><strong>Additional Notes:</strong><br>${notes}</div>` : ''}
      
      <p><strong>What's Next?</strong></p>
      <ul>
        <li>Review the reason for rejection above</li>
        <li>Address any issues mentioned</li>
        <li>Reapply when you're ready</li>
      </ul>
      
      <p>We encourage you to address the concerns and reapply. Our team is here to help if you have any questions.</p>
      
      <p>Contact us at ${this.supportEmail} for assistance.</p>
      
      <p>Best regards,<br>The OlakzRide Team</p>
    </div>
    <div class="footer">
      <p>© 2026 OlakzRide. All rights reserved.</p>
      <p>Need help? Contact us at ${this.supportEmail}</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
Hi ${driverName},

Thank you for your interest in becoming a driver with OlakzRide.

After careful review, we regret to inform you that your application has not been approved at this time.

Reason: ${rejectionReason}

${notes ? `Additional Notes: ${notes}\n\n` : ''}

What's Next?
- Review the reason for rejection above
- Address any issues mentioned
- Reapply when you're ready

We encourage you to address the concerns and reapply. Our team is here to help if you have any questions.

Best regards,
The OlakzRide Team
    `;

    return { subject, html, text };
  }

  /**
   * Generate admin notification email for new driver registration
   */
  private generateAdminNewDriverEmail(params: {
    driverName: string;
    driverEmail: string;
    vehicleType: string;
    serviceTypes: string[];
    registrationId: string;
  }): { subject: string; html: string; text: string } {
    const subject = '🚗 New Driver Application Submitted - Action Required';
    
    const servicesList = params.serviceTypes
      .map(s => s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
      .join(', ');

    const vehicleTypeFormatted = params.vehicleType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 8px 8px; }
    .info-box { background: white; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .info-row { margin: 10px 0; }
    .label { font-weight: bold; color: #555; }
    .value { color: #333; }
    .action-box { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; text-align: center; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚗 New Driver Application</h1>
    </div>
    <div class="content">
      <p>Hello Admin,</p>
      
      <p>A new driver has completed their registration and is awaiting your review.</p>
      
      <div class="info-box">
        <h3 style="margin-top: 0; color: #667eea;">Driver Information</h3>
        <div class="info-row">
          <span class="label">Name:</span>
          <span class="value">${params.driverName}</span>
        </div>
        <div class="info-row">
          <span class="label">Email:</span>
          <span class="value">${params.driverEmail}</span>
        </div>
        <div class="info-row">
          <span class="label">Vehicle Type:</span>
          <span class="value">${vehicleTypeFormatted}</span>
        </div>
        <div class="info-row">
          <span class="label">Services:</span>
          <span class="value">${servicesList}</span>
        </div>
        <div class="info-row">
          <span class="label">Registration ID:</span>
          <span class="value">${params.registrationId}</span>
        </div>
        <div class="info-row">
          <span class="label">Submitted:</span>
          <span class="value">${new Date().toLocaleString()}</span>
        </div>
      </div>

      <div class="action-box">
        <p style="margin: 0; color: #856404;">
          <strong>⚠️ Action Required:</strong> Please log in to the admin panel to review this application.
        </p>
      </div>

      <p><strong>Next Steps:</strong></p>
      <ul>
        <li>Review driver documents and information</li>
        <li>Verify vehicle details and insurance</li>
        <li>Approve or reject the application</li>
        <li>Driver will be notified of your decision via email</li>
      </ul>
      
      <p>Best regards,<br>OlakzRide System</p>
    </div>
    <div class="footer">
      <p>© 2026 OlakzRide. All rights reserved.</p>
      <p>This is an automated notification from the OlakzRide driver management system.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
New Driver Application Submitted

Hello Admin,

A new driver has completed their registration and is awaiting your review.

Driver Information:
- Name: ${params.driverName}
- Email: ${params.driverEmail}
- Vehicle Type: ${vehicleTypeFormatted}
- Services: ${servicesList}
- Registration ID: ${params.registrationId}
- Submitted: ${new Date().toLocaleString()}

Action Required: Please log in to the admin panel to review this application.

Next Steps:
- Review driver documents and information
- Verify vehicle details and insurance
- Approve or reject the application
- Driver will be notified of your decision via email

Best regards,
OlakzRide System
    `;

    return { subject, html, text };
  }
}
