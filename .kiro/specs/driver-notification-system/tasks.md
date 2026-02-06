# Driver Notification System - Implementation Tasks

## Task List

- [ ] 1. Create email sending endpoint in auth-service
  - [ ] 1.1 Create POST /api/auth/send-email endpoint
  - [ ] 1.2 Add internal API key authentication
  - [ ] 1.3 Integrate with existing EmailService
  - [ ] 1.4 Add request validation
  - [ ] 1.5 Test email sending

- [ ] 2. Create NotificationService in core-logistics
  - [ ] 2.1 Create notification.service.ts file
  - [ ] 2.2 Implement sendDriverReviewEmail() method
  - [ ] 2.3 Implement getDriverEmail() method
  - [ ] 2.4 Implement sendEmail() method
  - [ ] 2.5 Add error handling and logging

- [ ] 3. Create email templates
  - [ ] 3.1 Create approval email template
  - [ ] 3.2 Create rejection email template
  - [ ] 3.3 Add template rendering logic
  - [ ] 3.4 Test templates with sample data

- [ ] 4. Integrate with AdminDriverService
  - [ ] 4.1 Update reviewDriverApplication() to call NotificationService
  - [ ] 4.2 Handle email sending errors gracefully
  - [ ] 4.3 Update notification record with status
  - [ ] 4.4 Add logging for email attempts

- [ ] 5. Update environment configuration
  - [ ] 5.1 Add AUTH_SERVICE_URL to core-logistics .env
  - [ ] 5.2 Add email template URLs to .env
  - [ ] 5.3 Update .env.template files

- [ ] 6. Testing
  - [ ] 6.1 Test approval email flow end-to-end
  - [ ] 6.2 Test rejection email flow end-to-end
  - [ ] 6.3 Test error handling (auth service down, invalid email)
  - [ ] 6.4 Verify emails are received in inbox

## Task Details

### Task 1.1: Create email sending endpoint in auth-service

**File:** `services/auth-service/src/controllers/email.controller.ts` (NEW)

```typescript
import { Request, Response } from 'express';
import { EmailService } from '../services/email.service';
import { logger } from '../utils/logger';

export class EmailController {
  private emailService: EmailService;

  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Send email (internal API for other services)
   * POST /api/auth/send-email
   */
  sendEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { to, subject, html, text } = req.body;

      // Validate required fields
      if (!to || !subject || !html) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: to, subject, html',
        });
        return;
      }

      // Send email
      const result = await this.emailService.sendEmail({
        to,
        subject,
        html,
        text: text || undefined,
      });

      if (result.success) {
        res.status(200).json({
          success: true,
          messageId: result.messageId,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error || 'Failed to send email',
        });
      }
    } catch (error: any) {
      logger.error('Send email error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  };
}
```

### Task 1.2: Add internal API authentication middleware

**File:** `services/auth-service/src/middleware/internal-api.middleware.ts` (NEW)

```typescript
import { Request, Response, NextFunction } from 'express';
import config from '../config';

export const internalApiAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-internal-api-key'];

  if (!apiKey || apiKey !== config.internalApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid internal API key',
    });
  }

  next();
};
```

### Task 2.1: Create NotificationService

**File:** `services/core-logistics/src/services/notification.service.ts` (NEW)

```typescript
import axios from 'axios';
import { supabase } from '../config/database';
import { logger } from '../config/logger';
import config from '../config/env';

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

  constructor() {
    this.authServiceUrl = config.authServiceUrl || 'http://localhost:3003';
    this.internalApiKey = config.internalApiKey || '';
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
   * Send email via auth service
   */
  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    text?: string;
  }): Promise<boolean> {
    try {
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
      
      <p>If you have any questions, feel free to contact our support team at ${config.supportEmail || 'support@olakzride.com'}.</p>
      
      <p>Welcome to the OlakzRide family!</p>
      
      <p>Best regards,<br>The OlakzRide Team</p>
    </div>
    <div class="footer">
      <p>© 2026 OlakzRide. All rights reserved.</p>
      <p>Need help? Contact us at ${config.supportEmail || 'support@olakzride.com'}</p>
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
      
      <p>Contact us at ${config.supportEmail || 'support@olakzride.com'} for assistance.</p>
      
      <p>Best regards,<br>The OlakzRide Team</p>
    </div>
    <div class="footer">
      <p>© 2026 OlakzRide. All rights reserved.</p>
      <p>Need help? Contact us at ${config.supportEmail || 'support@olakzride.com'}</p>
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
}
```

### Task 4.1: Integrate with AdminDriverService

Update `reviewDriverApplication()` method to call NotificationService:

```typescript
// Add to imports
import { NotificationService } from './notification.service';

// In AdminDriverService class
private notificationService: NotificationService;

constructor() {
  this.notificationService = new NotificationService();
}

// In reviewDriverApplication method, after creating notification:
// Send email notification (async, don't wait)
this.notificationService.sendDriverReviewEmail({
  driverId,
  userId: driver.user_id,
  action,
  notes,
  rejectionReason,
}).then((result) => {
  // Update notification status
  if (result.success) {
    supabase
      .from('driver_notifications')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('driver_id', driverId)
      .eq('type', action === 'approve' ? 'application_approved' : 'application_rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(() => {
        logger.info('Notification status updated to sent');
      });
  } else {
    supabase
      .from('driver_notifications')
      .update({ status: 'failed', error_message: result.error })
      .eq('driver_id', driverId)
      .eq('type', action === 'approve' ? 'application_approved' : 'application_rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(() => {
        logger.error('Notification status updated to failed');
      });
  }
}).catch((error) => {
  logger.error('Failed to send notification email:', error);
});
```

## Dependencies
- Task 2 depends on Task 1 (NotificationService needs auth service endpoint)
- Task 4 depends on Task 2 and 3 (Integration needs service and templates)
- Task 6 depends on all previous tasks (Testing needs everything)

## Estimated Time
- Task 1: 2 hours
- Task 2: 3 hours
- Task 3: 1.5 hours
- Task 4: 1.5 hours
- Task 5: 0.5 hours
- Task 6: 2 hours
- **Total: 10.5 hours**

## Success Criteria
- Approval emails are sent automatically when admin approves
- Rejection emails are sent automatically when admin rejects
- Emails contain correct personalization and content
- Failed emails don't block admin workflow
- All email attempts are logged
- End-to-end tests pass
