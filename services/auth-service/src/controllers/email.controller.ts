import { Request, Response } from 'express';
import emailService from '../services/email.service';
import ResponseUtil from '../utils/response';
import logger from '../utils/logger';

export class EmailController {
  /**
   * Send email (internal API for other services)
   * POST /api/auth/send-email
   */
  sendEmail = async (req: Request, res: Response): Promise<void> => {
    try {
      const { to, subject, html } = req.body;

      if (!to || !subject || !html) {
        ResponseUtil.error(res, 'Missing required fields: to, subject, html', 400);
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        ResponseUtil.error(res, 'Invalid email address format', 400);
        return;
      }

      await emailService.sendEmail(to, subject, html);

      logger.info('Email sent via internal API', { to, subject });
      ResponseUtil.success(res, null, 'Email sent successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to send email';
      logger.error('Send email error:', error);
      ResponseUtil.error(res, message, 500);
    }
  };
}
