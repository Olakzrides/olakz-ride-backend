# Driver Notification System

## Overview
Implement email notification system to notify drivers when their applications are approved or rejected by admins.

## Problem Statement
Currently, when admins approve or reject driver applications, notification records are created in the database but no actual emails are sent to drivers. Drivers have no way to know the status of their application without manually checking.

## User Stories

### 1. As a driver who submitted an application
**I want** to receive an email when my application is approved  
**So that** I know I can start accepting rides

**Acceptance Criteria:**
- 1.1 When admin approves my application, I receive an email within 1 minute
- 1.2 Email contains approval confirmation and next steps
- 1.3 Email is personalized with my name
- 1.4 Email includes link to driver app/portal

### 2. As a driver whose application was rejected
**I want** to receive an email explaining why my application was rejected  
**So that** I can fix the issues and reapply

**Acceptance Criteria:**
- 2.1 When admin rejects my application, I receive an email within 1 minute
- 2.2 Email contains rejection reason provided by admin
- 2.3 Email includes instructions on how to reapply
- 2.4 Email is professional and supportive in tone

### 3. As an admin reviewing applications
**I want** the system to automatically send emails when I approve/reject  
**So that** I don't have to manually notify each driver

**Acceptance Criteria:**
- 3.1 Email is sent automatically after I click approve/reject
- 3.2 I can see confirmation that email was sent
- 3.3 If email fails, I see an error message
- 3.4 Email sending doesn't block my workflow (async)

### 4. As a system administrator
**I want** all email notifications to be logged  
**So that** I can audit communication and troubleshoot issues

**Acceptance Criteria:**
- 4.1 All email attempts (success and failure) are logged
- 4.2 Logs include recipient, template used, and delivery status
- 4.3 Failed emails are retried automatically (up to 3 times)
- 4.4 Logs are searchable by driver ID and date

## Technical Requirements

### TR-1: Email Service Integration
- Integrate with existing EmailService in auth-service
- Create NotificationService in core-logistics service
- Use HTTP client to call auth-service email endpoints
- Handle network errors and timeouts gracefully

### TR-2: Email Templates
- Create approval email template with personalization
- Create rejection email template with reason field
- Templates should be HTML with plain text fallback
- Include company branding and contact information

### TR-3: Driver Email Retrieval
- Query auth-service to get driver's email address
- Cache email addresses to reduce API calls
- Handle cases where email is not found

### TR-4: Notification Logging
- Log all notification attempts in database
- Track delivery status (pending, sent, failed)
- Store error messages for failed deliveries
- Enable retry mechanism for failed emails

### TR-5: Async Processing
- Email sending should not block admin workflow
- Use async/await for non-blocking execution
- Admin sees immediate response, email sends in background
- Failed emails don't cause API request to fail

## Out of Scope
- SMS notifications (future enhancement)
- Push notifications (future enhancement)
- In-app notifications (future enhancement)
- Email template customization UI (future enhancement)
- Bulk email sending (future enhancement)

## Success Metrics
- 100% of approved/rejected applications trigger email
- 95%+ email delivery success rate
- Email delivery within 60 seconds of admin action
- Zero blocking of admin workflow due to email sending
- All email attempts logged for audit

## Dependencies
- Auth service EmailService must be functional
- Driver must have valid email in auth service
- SMTP configuration must be correct in auth service
