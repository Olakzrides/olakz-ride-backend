"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../utils/logger"));
class EmailService {
    constructor() {
        // Check if ZeptoMail API is configured
        if (process.env.ZEPTO_API_URL && process.env.ZEPTO_API_KEY) {
            logger_1.default.info('✅ ZeptoMail API configured successfully');
        }
        else {
            logger_1.default.warn('⚠️ ZeptoMail API not configured - emails will not be sent');
        }
    }
    /**
     * Send OTP email (HTML format)
     */
    async sendOTPEmail(to, firstName, otp, type) {
        const subject = type === 'verification'
            ? 'Verify Your Email - Olakz Ride'
            : 'Reset Your Password - Olakz Ride';
        const html = this.getOTPEmailTemplate(firstName, otp, type);
        await this.sendEmail(to, subject, html);
    }
    /**
     * Send welcome email after verification
     */
    async sendWelcomeEmail(to, firstName) {
        const subject = 'Welcome to Olakz Ride!';
        const html = this.getWelcomeEmailTemplate(firstName);
        await this.sendEmail(to, subject, html);
    }
    /**
     * Send document status notification email
     */
    async sendDocumentNotificationEmail(to, firstName, documentType, status, notes, rejectionReason) {
        const subject = this.getDocumentNotificationSubject(status, documentType);
        const html = this.getDocumentNotificationTemplate(firstName, documentType, status, notes, rejectionReason);
        await this.sendEmail(to, subject, html);
    }
    /**
     * Send admin notification email for new document submissions
     */
    async sendAdminDocumentNotificationEmail(adminEmail, documentType, driverName, documentCount) {
        const subject = `New Driver Document Submitted - ${documentType}`;
        const html = this.getAdminDocumentNotificationTemplate(documentType, driverName, documentCount);
        await this.sendEmail(adminEmail, subject, html);
    }
    /**
     * Send generic email via ZeptoMail API
     */
    async sendEmail(to, subject, html) {
        if (!process.env.ZEPTO_API_URL || !process.env.ZEPTO_API_KEY) {
            logger_1.default.warn(`Email sending skipped (API not configured): ${subject} to ${to}`);
            return;
        }
        try {
            const payload = {
                from: {
                    address: process.env.ZEPTO_FROM_EMAIL,
                    name: process.env.ZEPTO_FROM_NAME
                },
                to: [
                    {
                        email_address: {
                            address: to
                        }
                    }
                ],
                subject: subject,
                htmlbody: html
            };
            const response = await axios_1.default.post(process.env.ZEPTO_API_URL, payload, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Zoho-enczapikey ${process.env.ZEPTO_API_KEY}`
                },
                timeout: 10000 // 10 second timeout
            });
            logger_1.default.info(`Email sent successfully via API to ${to}`, {
                messageId: response.data.data?.[0]?.message_id
            });
        }
        catch (error) {
            logger_1.default.error('Error sending email via API:', {
                error: error.message,
                response: error.response?.data
            });
            throw new Error('Failed to send email via API');
        }
    }
    /**
     * OTP Email Template (HTML)
     */
    getOTPEmailTemplate(firstName, otp, type) {
        const message = type === 'verification'
            ? 'Thank you for signing up! Please use the code below to verify your email address.'
            : 'You requested to reset your password. Use the code below to proceed.';
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f4;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 20px auto;
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
      margin-bottom: 20px;
      color: #555;
    }
    .message {
      font-size: 16px;
      margin-bottom: 30px;
      color: #666;
    }
    .otp-container {
      background: #f8f9fa;
      border: 2px dashed #667eea;
      border-radius: 8px;
      padding: 25px;
      text-align: center;
      margin: 30px 0;
    }
    .otp-label {
      font-size: 14px;
      color: #666;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .otp-code {
      font-size: 42px;
      font-weight: bold;
      color: #667eea;
      letter-spacing: 8px;
      margin: 10px 0;
      font-family: 'Courier New', monospace;
    }
    .expiry {
      font-size: 14px;
      color: #999;
      margin-top: 15px;
    }
    .warning {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .warning p {
      margin: 0;
      color: #856404;
      font-size: 14px;
    }
    .footer {
      background: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #999;
      font-size: 14px;
      border-top: 1px solid #eee;
    }
    .footer p {
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚗 Olakz Ride</h1>
    </div>
    <div class="content">
      <p class="greeting">Hello ${firstName},</p>
      <p class="message">${message}</p>
      
      <div class="otp-container">
        <div class="otp-label">Your Verification Code</div>
        <div class="otp-code">${otp}</div>
        <div class="expiry">⏰ This code expires in ${config_1.default.otp.expiryMinutes} minutes</div>
      </div>

      <div class="warning">
        <p><strong>⚠️ Security Notice:</strong> If you didn't request this code, please ignore this email and ensure your account is secure.</p>
      </div>

      <p style="color: #666; font-size: 14px; margin-top: 30px;">
        Need help? Contact us at <a href="mailto:support@olakzrides.com" style="color: #667eea;">support@olakzrides.com</a>
      </p>
    </div>
    <div class="footer">
      <p><strong>Olakz Ride</strong></p>
      <p>Your trusted delivery partner</p>
      <p>&copy; ${new Date().getFullYear()} Olakz Ride. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
    }
    /**
     * Welcome Email Template
     */
    getWelcomeEmailTemplate(firstName) {
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #eee; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 14px; border-radius: 0 0 10px 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Welcome to Olakz Ride!</h1>
    </div>
    <div class="content">
      <p>Hi ${firstName},</p>
      <p>Your email has been successfully verified! You're now ready to start using Olakz Ride.</p>
      <p><strong>What you can do:</strong></p>
      <ul>
        <li>Send and receive deliveries</li>
        <li>Track your packages in real-time</li>
        <li>Manage your orders easily</li>
      </ul>
      <p>If you have any questions, we're here to help!</p>
      <p>Best regards,<br>The Olakz Ride Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Olakz Ride. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
    }
    /**
     * Get document notification subject based on status
     */
    getDocumentNotificationSubject(status, documentType) {
        const docTypeFormatted = documentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        switch (status) {
            case 'approved':
                return `✅ Document Approved - ${docTypeFormatted}`;
            case 'rejected':
                return `❌ Document Rejected - ${docTypeFormatted}`;
            case 'replacement_requested':
                return `🔄 Document Replacement Required - ${docTypeFormatted}`;
            default:
                return `📄 Document Update - ${docTypeFormatted}`;
        }
    }
    /**
     * Document notification email template
     */
    getDocumentNotificationTemplate(firstName, documentType, status, notes, rejectionReason) {
        const docTypeFormatted = documentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        let statusMessage = '';
        let statusColor = '#667eea';
        let statusIcon = '📄';
        let actionRequired = '';
        switch (status) {
            case 'approved':
                statusMessage = `Your ${docTypeFormatted} has been approved! ✅`;
                statusColor = '#28a745';
                statusIcon = '✅';
                actionRequired = 'No further action is required for this document.';
                break;
            case 'rejected':
                statusMessage = `Your ${docTypeFormatted} has been rejected. ❌`;
                statusColor = '#dc3545';
                statusIcon = '❌';
                actionRequired = 'Please upload a new document that meets our requirements.';
                break;
            case 'replacement_requested':
                statusMessage = `A replacement is required for your ${docTypeFormatted}. 🔄`;
                statusColor = '#ffc107';
                statusIcon = '🔄';
                actionRequired = 'Please upload a new version of this document.';
                break;
        }
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: ${statusColor}; color: white; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .status-box { background: #f8f9fa; border-left: 4px solid ${statusColor}; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .notes-box { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .action-box { background: #e3f2fd; border: 1px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
    .btn { display: inline-block; background: ${statusColor}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${statusIcon} Document ${status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</h1>
    </div>
    <div class="content">
      <p>Hi ${firstName},</p>
      
      <div class="status-box">
        <h3 style="margin-top: 0; color: ${statusColor};">${statusMessage}</h3>
        <p><strong>Document Type:</strong> ${docTypeFormatted}</p>
        <p><strong>Status:</strong> ${status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
      </div>

      ${rejectionReason ? `
      <div class="notes-box">
        <h4 style="margin-top: 0; color: #856404;">Rejection Reason:</h4>
        <p>${rejectionReason}</p>
      </div>
      ` : ''}

      ${notes ? `
      <div class="notes-box">
        <h4 style="margin-top: 0; color: #856404;">Additional Notes:</h4>
        <p>${notes}</p>
      </div>
      ` : ''}

      <div class="action-box">
        <h4 style="margin-top: 0; color: #1976d2;">Next Steps:</h4>
        <p>${actionRequired}</p>
        ${status !== 'approved' ? '<a href="https://olakzride.duckdns.org" class="btn">Upload New Document</a>' : ''}
      </div>

      <p>If you have any questions about this decision, please contact our support team.</p>
      
      <p>Best regards,<br>The Olakz Ride Team</p>
    </div>
    <div class="footer">
      <p><strong>Olakz Ride</strong> - Your trusted delivery partner</p>
      <p>&copy; ${new Date().getFullYear()} Olakz Ride. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
    }
    /**
     * Admin notification email template
     */
    getAdminDocumentNotificationTemplate(documentType, driverName, documentCount) {
        const docTypeFormatted = documentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #eee; }
    .info-box { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0; }
    .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #999; font-size: 14px; border-radius: 0 0 10px 10px; }
    .btn { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 New Document Submitted</h1>
    </div>
    <div class="content">
      <p>Hello Admin,</p>
      
      <p>A new driver document has been submitted and is awaiting review.</p>
      
      <div class="info-box">
        <p><strong>Document Type:</strong> ${docTypeFormatted}</p>
        <p><strong>Driver:</strong> ${driverName}</p>
        <p><strong>Pending Documents:</strong> ${documentCount} total</p>
        <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
      </div>

      <p>Please review this document at your earliest convenience.</p>
      
      <a href="https://olakzride.duckdns.org/admin/documents" class="btn">Review Documents</a>
      
      <p>Best regards,<br>Olakz Ride System</p>
    </div>
    <div class="footer">
      <p><strong>Olakz Ride Admin</strong></p>
      <p>&copy; ${new Date().getFullYear()} Olakz Ride. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `;
    }
}
exports.default = new EmailService();
//# sourceMappingURL=email.service.js.map