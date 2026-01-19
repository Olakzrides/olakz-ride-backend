import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

class EmailService {
  constructor() {
    // Check if ZeptoMail API is configured
    if (process.env.ZEPTO_API_URL && process.env.ZEPTO_API_KEY) {
      logger.info('✅ ZeptoMail API configured successfully');
    } else {
      logger.warn('⚠️ ZeptoMail API not configured - emails will not be sent');
    }
  }

  /**
   * Send OTP email (HTML format)
   */
  async sendOTPEmail(to: string, firstName: string, otp: string, type: 'verification' | 'password_reset'): Promise<void> {
    const subject = type === 'verification' 
      ? 'Verify Your Email - Olakz Ride'
      : 'Reset Your Password - Olakz Ride';

    const html = this.getOTPEmailTemplate(firstName, otp, type);

    await this.sendEmail(to, subject, html);
  }

  /**
   * Send welcome email after verification
   */
  async sendWelcomeEmail(to: string, firstName: string): Promise<void> {
    const subject = 'Welcome to Olakz Ride!';
    const html = this.getWelcomeEmailTemplate(firstName);

    await this.sendEmail(to, subject, html);
  }

  /**
   * Send generic email via ZeptoMail API
   */
  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!process.env.ZEPTO_API_URL || !process.env.ZEPTO_API_KEY) {
      logger.warn(`Email sending skipped (API not configured): ${subject} to ${to}`);
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

      const response = await axios.post(process.env.ZEPTO_API_URL, payload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Zoho-enczapikey ${process.env.ZEPTO_API_KEY}`
        },
        timeout: 10000 // 10 second timeout
      });

      logger.info(`Email sent successfully via API to ${to}`, { 
        messageId: response.data.data?.[0]?.message_id 
      });
    } catch (error: any) {
      logger.error('Error sending email via API:', {
        error: error.message,
        response: error.response?.data
      });
      throw new Error('Failed to send email via API');
    }
  }

  /**
   * OTP Email Template (HTML)
   */
  private getOTPEmailTemplate(firstName: string, otp: string, type: 'verification' | 'password_reset'): string {
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
        <div class="expiry">⏰ This code expires in ${config.otp.expiryMinutes} minutes</div>
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
  private getWelcomeEmailTemplate(firstName: string): string {
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
}

export default new EmailService();