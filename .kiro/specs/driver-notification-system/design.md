# Driver Notification System - Design Document

## Architecture Overview

The notification system bridges core-logistics and auth-service to send emails to drivers when their applications are reviewed.

```
┌─────────────────────────────────────────────────────────────┐
│                     Admin Reviews Driver                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          AdminDriverService.reviewDriverApplication          │
│  1. Update driver status (approved/rejected)                 │
│  2. Create notification record                               │
│  3. Call NotificationService.sendDriverReviewEmail()         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              NotificationService (NEW)                       │
│  1. Get driver email from auth service                       │
│  2. Select email template (approval/rejection)               │
│  3. Call auth service email API                              │
│  4. Update notification record with status                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Auth Service Email API                          │
│  1. Render email template                                    │
│  2. Send via SMTP                                            │
│  3. Return delivery status                                   │
└─────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. NotificationService (NEW)

**Location:** `services/core-logistics/src/services/notification.service.ts`

**Responsibilities:**
- Send driver review notifications
- Fetch driver email from auth service
- Manage email templates
- Log notification attempts
- Handle retry logic

**Key Methods:**

```typescript
class NotificationService {
  /**
   * Send email notification for driver review (approval/rejection)
   */
  async sendDriverReviewEmail(params: {
    driverId: string;
    userId: string;
    action: 'approve' | 'reject';
    reviewerName?: string;
    notes?: string;
    rejectionReason?: string;
  }): Promise<boolean>

  /**
   * Get driver email from auth service
   */
  private async getDriverEmail(userId: string): Promise<string | null>

  /**
   * Send email via auth service
   */
  private async sendEmail(params: {
    to: string;
    subject: string;
    template: string;
    data: any;
  }): Promise<boolean>

  /**
   * Update notification record with delivery status
   */
  private async updateNotificationStatus(
    notificationId: string,
    status: 'sent' | 'failed',
    error?: string
  ): Promise<void>
}
```

### 2. Email Templates

**Approval Template:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .button { background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Application Approved!</h1>
    </div>
    <div class="content">
      <p>Hi {{driverName}},</p>
      
      <p>Great news! Your driver application has been <strong>approved</strong>.</p>
      
      <p>You can now start accepting rides and earning with OlakzRide.</p>
      
      {{#if notes}}
      <p><strong>Admin Notes:</strong> {{notes}}</p>
      {{/if}}
      
      <p><strong>Next Steps:</strong></p>
      <ol>
        <li>Download the OlakzRide Driver app</li>
        <li>Log in with your credentials</li>
        <li>Complete your profile setup</li>
        <li>Start accepting rides!</li>
      </ol>
      
      <a href="{{driverAppUrl}}" class="button">Open Driver App</a>
      
      <p>If you have any questions, feel free to contact our support team.</p>
      
      <p>Welcome to the OlakzRide family!</p>
      
      <p>Best regards,<br>The OlakzRide Team</p>
    </div>
    <div class="footer">
      <p>© 2026 OlakzRide. All rights reserved.</p>
      <p>Need help? Contact us at support@olakzride.com</p>
    </div>
  </div>
</body>
</html>
```

**Rejection Template:**
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f44336; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .button { background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
    .reason-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Update</h1>
    </div>
    <div class="content">
      <p>Hi {{driverName}},</p>
      
      <p>Thank you for your interest in becoming a driver with OlakzRide.</p>
      
      <p>After careful review, we regret to inform you that your application has not been approved at this time.</p>
      
      <div class="reason-box">
        <strong>Reason:</strong><br>
        {{rejectionReason}}
      </div>
      
      {{#if notes}}
      <p><strong>Additional Notes:</strong> {{notes}}</p>
      {{/if}}
      
      <p><strong>What's Next?</strong></p>
      <ul>
        <li>Review the reason for rejection above</li>
        <li>Address any issues mentioned</li>
        <li>Reapply when you're ready</li>
      </ul>
      
      <a href="{{reapplyUrl}}" class="button">Reapply Now</a>
      
      <p>We encourage you to address the concerns and reapply. Our team is here to help if you have any questions.</p>
      
      <p>Best regards,<br>The OlakzRide Team</p>
    </div>
    <div class="footer">
      <p>© 2026 OlakzRide. All rights reserved.</p>
      <p>Need help? Contact us at support@olakzride.com</p>
    </div>
  </div>
</body>
</html>
```

### 3. Auth Service Integration

**Endpoint:** `POST /api/auth/send-email` (to be created in auth-service)

**Request:**
```typescript
{
  to: string;
  subject: string;
  html: string;
  text?: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  messageId?: string;
  error?: string;
}
```

### 4. Database Schema Updates

**notifications table** (already exists, just update status):
```sql
-- No schema changes needed, existing table is sufficient
-- Just ensure we update the status field after sending
```

## Data Flow

### Approval Flow
```
1. Admin clicks "Approve" button
   ↓
2. AdminDriverController.reviewDriver()
   ↓
3. AdminDriverService.reviewDriverApplication()
   - Update driver status to 'approved'
   - Create notification record (status: 'pending')
   ↓
4. NotificationService.sendDriverReviewEmail()
   - Get driver email from auth service
   - Render approval template
   - Send email via auth service
   - Update notification status to 'sent' or 'failed'
   ↓
5. Return success to admin (don't wait for email)
```

### Rejection Flow
```
1. Admin clicks "Reject" with reason
   ↓
2. AdminDriverController.reviewDriver()
   ↓
3. AdminDriverService.reviewDriverApplication()
   - Update driver status to 'rejected'
   - Store rejection reason
   - Create notification record (status: 'pending')
   ↓
4. NotificationService.sendDriverReviewEmail()
   - Get driver email from auth service
   - Render rejection template with reason
   - Send email via auth service
   - Update notification status to 'sent' or 'failed'
   ↓
5. Return success to admin (don't wait for email)
```

## Error Handling

### Email Sending Failures
- **Network Error:** Log error, mark notification as 'failed', don't block admin
- **Invalid Email:** Log error, mark notification as 'failed', don't block admin
- **SMTP Error:** Log error, mark notification as 'failed', retry later
- **Auth Service Down:** Log error, mark notification as 'failed', retry later

### Retry Strategy
- Failed emails are marked with 'failed' status
- Background job (future) can retry failed notifications
- Max 3 retry attempts
- Exponential backoff: 5min, 15min, 1hour

## API Changes

### New Auth Service Endpoint

**POST /api/auth/send-email**

```typescript
// Request
{
  to: string;
  subject: string;
  html: string;
  text?: string;
}

// Response
{
  success: boolean;
  messageId?: string;
  error?: string;
}
```

### Enhanced Admin Review Response

**POST /api/admin/drivers/:driverId/review**

```typescript
// Response (enhanced)
{
  success: true,
  message: "Driver application approved successfully",
  data: {
    driverId: "...",
    action: "approve",
    reviewedBy: "...",
    emailSent: true,  // NEW
    emailError: null  // NEW (or error message if failed)
  }
}
```

## Configuration

### Environment Variables

**core-logistics .env:**
```bash
# Auth Service URL for email sending
AUTH_SERVICE_URL=http://localhost:3003
AUTH_SERVICE_INTERNAL_KEY=your-internal-api-key

# Email Configuration
DRIVER_APP_URL=https://driver.olakzride.com
REAPPLY_URL=https://olakzride.com/driver/register
SUPPORT_EMAIL=support@olakzride.com
```

**auth-service .env:**
```bash
# Already configured
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@olakzride.com
```

## Security Considerations

### Internal API Authentication
- Use internal API key for service-to-service communication
- Don't expose email sending endpoint publicly
- Validate requests come from core-logistics service

### Email Content Security
- Sanitize all user input before including in emails
- Don't include sensitive information (passwords, tokens)
- Use HTTPS for all links in emails

### Rate Limiting
- Limit email sending to prevent abuse
- Max 100 emails per hour per service
- Track and alert on unusual patterns

## Performance Considerations

### Async Email Sending
- Email sending happens asynchronously
- Admin sees immediate response
- Email delivery doesn't block workflow
- Use Promise.resolve() to fire-and-forget

### Caching
- Cache driver emails for 5 minutes
- Reduce calls to auth service
- Invalidate cache on email change

### Batch Operations
- If bulk approving drivers, batch email sending
- Send max 10 emails concurrently
- Queue remaining emails for background processing

## Testing Strategy

### Unit Tests
1. NotificationService.sendDriverReviewEmail()
   - Test approval email generation
   - Test rejection email generation
   - Test error handling
   - Test retry logic

2. Template rendering
   - Test with all variables populated
   - Test with missing optional variables
   - Test HTML escaping

### Integration Tests
1. End-to-end approval flow
   - Register driver
   - Admin approves
   - Verify email sent
   - Check notification status

2. End-to-end rejection flow
   - Register driver
   - Admin rejects with reason
   - Verify email sent with reason
   - Check notification status

3. Error scenarios
   - Auth service down
   - Invalid email address
   - SMTP failure

## Rollout Plan

### Phase 1: Core Implementation
- Create NotificationService
- Create email templates
- Integrate with AdminDriverService
- Add logging

### Phase 2: Auth Service Email Endpoint
- Create /send-email endpoint in auth-service
- Add internal API authentication
- Test email delivery

### Phase 3: Testing & Deployment
- Unit tests
- Integration tests
- Deploy to staging
- Test with real emails
- Deploy to production

### Phase 4: Monitoring & Optimization
- Monitor email delivery rates
- Set up alerts for failures
- Optimize retry logic
- Add email analytics
