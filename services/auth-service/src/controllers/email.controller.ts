import { Request, Response } from 'express';
import emailService from '../services/email.service';
import logger from '../utils/logger';

export class EmailController {
  /**
   * Send email (internal API for other services)
   * POST /api/auth/send-email
   */
  sendEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { to, subject, html } = req.body;

      // Validate required fields
      if (!to || !subject || !html) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: to, subject, html',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        res.status(400).json({
          success: false,
          error: 'Invalid email address format',
        });
        return;
      }

      logger.info('Sending email via internal API:', {
        to,
        subject,
      });

      // Send email using the public sendEmail method
      try {
        await emailService.sendEmail(to, subject, html);
        
        logger.info('Email sent successfully:', {
          to,
          subject,
        });
        
        res.status(200).json({
          success: true,
          message: 'Email sent successfully',
        });
      } catch (emailError: any) {
        logger.error('Failed to send email:', {
          to,
          error: emailError.message,
        });
        
        res.status(500).json({
          success: false,
          error: emailError.message || 'Failed to send email',
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
