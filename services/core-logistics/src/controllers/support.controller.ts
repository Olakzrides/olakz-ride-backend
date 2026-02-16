import { Request, Response } from 'express';
import { SupportService } from '../services/support.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class SupportController {
  private supportService: SupportService;

  constructor() {
    this.supportService = new SupportService();
  }

  /**
   * Generate WhatsApp support link for active ride
   * POST /api/support/contact
   */
  contactSupport = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { rideId, issueCategory, message } = req.body;

      // Validate required fields
      if (!rideId) {
        return ResponseUtil.badRequest(res, 'Ride ID is required');
      }

      if (!issueCategory) {
        return ResponseUtil.badRequest(res, 'Issue category is required');
      }

      // Validate issue category
      const validCategories = ['payment', 'driver', 'app', 'safety', 'other'];
      if (!validCategories.includes(issueCategory)) {
        return ResponseUtil.badRequest(
          res,
          `Invalid issue category. Must be one of: ${validCategories.join(', ')}`
        );
      }

      // Generate support link (service will fetch user name from database)
      const result = await this.supportService.generateSupportLink({
        rideId,
        userId,
        userName: '', // Will be fetched from database
        issueCategory,
        customMessage: message,
      });

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      logger.info('Support contact generated', {
        userId,
        rideId,
        issueCategory,
      });

      return ResponseUtil.success(res, {
        whatsappLink: result.whatsappLink,
        message: 'Support link generated successfully. Click to open WhatsApp.',
      });
    } catch (error: any) {
      logger.error('Contact support error:', error);
      return ResponseUtil.error(res, 'Failed to generate support link');
    }
  };

  /**
   * Get support contact information
   * GET /api/support/info
   */
  getSupportInfo = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const contactInfo = this.supportService.getSupportContactInfo();

      return ResponseUtil.success(res, {
        support: {
          whatsapp: contactInfo.whatsappNumber,
          displayNumber: contactInfo.formattedNumber,
          availableFor: 'Active rides only',
          issueCategories: [
            { value: 'payment', label: 'Payment Issue' },
            { value: 'driver', label: 'Driver Issue' },
            { value: 'app', label: 'App Problem' },
            { value: 'safety', label: 'Safety Concern' },
            { value: 'other', label: 'Other Issue' },
          ],
        },
      });
    } catch (error: any) {
      logger.error('Get support info error:', error);
      return ResponseUtil.error(res, 'Failed to get support information');
    }
  };
}
