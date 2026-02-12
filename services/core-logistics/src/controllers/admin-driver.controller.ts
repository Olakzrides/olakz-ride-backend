import { Response } from 'express';
import { AdminDriverService } from '../services/admin-driver.service';
import { DocumentService } from '../services/document.service';
import { logger } from '../config/logger';

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
  isAdmin: boolean;
}

interface AdminRequest {
  user?: AdminUser;
  params: any;
  query: any;
  body: any;
  ip?: string;
  get: (header: string) => string | undefined;
}

// Simple response utilities for admin endpoints
const sendResponse = (res: Response, statusCode: number, message: string, data?: any) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
};

const sendError = (res: Response, statusCode: number, message: string, code?: string) => {
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      timestamp: new Date().toISOString(),
    },
  });
};

export class AdminDriverController {
  private adminDriverService: AdminDriverService;
  private documentService: DocumentService;

  constructor() {
    this.adminDriverService = new AdminDriverService();
    this.documentService = new DocumentService();
  }

  /**
   * Get all pending driver applications for admin review
   * GET /admin/drivers/pending
   */
  getPendingDrivers = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { 
        page = 1, 
        limit = 20 
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      const result = await this.adminDriverService.getPendingDriverApplications(
        Number(limit),
        offset
      );

      sendResponse(res, 200, 'Pending driver applications retrieved successfully', {
        drivers: result.drivers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: result.total,
          pages: Math.ceil(result.total / Number(limit)),
        },
      });
    } catch (error: any) {
      logger.error('Get pending drivers error:', error);
      sendError(res, 500, 'Failed to get pending driver applications', 'ADMIN_DRIVERS_FETCH_ERROR');
    }
  };

  /**
   * Get driver application details for admin review
   * GET /admin/drivers/:driverId
   */
  getDriverForReview = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverId } = req.params;

      const driver = await this.adminDriverService.getDriverApplicationForReview(driverId);

      if (!driver) {
        sendError(res, 404, 'Driver application not found', 'DRIVER_NOT_FOUND');
        return;
      }

      // Generate signed URLs for documents with graceful error handling
      const documentsWithUrls = await Promise.all(
        (driver.documents || []).map(async (doc) => {
          let signedUrl = null;
          let signedUrlError = null;
          
          try {
            signedUrl = await this.documentService.getSecureDocumentUrl(
              doc.id,
              req.user?.id || 'admin',
              24 * 60 * 60, // 24 hours
              req.ip,
              req.get('User-Agent')
            );
          } catch (error: any) {
            logger.warn('Could not generate signed URL for document:', {
              documentId: doc.id,
              driverId,
              error: error.message,
            });
            // Store the error message for the frontend
            signedUrlError = error.message;
          }

          return {
            ...doc,
            signedUrl,
            signedUrlError,
          };
        })
      );

      // Count successful and failed URL generations
      const successCount = documentsWithUrls.filter(d => d.signedUrl).length;
      const errorCount = documentsWithUrls.filter(d => d.signedUrlError).length;

      logger.info('Driver application retrieved for review:', {
        driverId,
        documentsTotal: documentsWithUrls.length,
        documentsAccessible: successCount,
        documentsMissing: errorCount,
      });

      sendResponse(res, 200, 'Driver application details retrieved successfully', {
        driver: {
          ...driver,
          documents: documentsWithUrls,
        },
        document_summary: {
          total: documentsWithUrls.length,
          accessible: successCount,
          missing: errorCount,
        },
      });
    } catch (error: any) {
      logger.error('Get driver for review error:', error);
      sendError(res, 500, 'Failed to get driver application details', 'DRIVER_FETCH_ERROR');
    }
  };

  /**
   * Review a driver application (approve or reject)
   * POST /admin/drivers/:driverId/review
   */
  reviewDriver = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverId } = req.params;
      const { action, serviceTier, notes, rejectionReason } = req.body;
      const reviewerId = req.user?.id;

      if (!reviewerId) {
        sendError(res, 401, 'Admin authentication required', 'ADMIN_AUTH_REQUIRED');
        return;
      }

      // Validate action
      if (!['approve', 'reject'].includes(action)) {
        sendError(res, 400, 'Invalid review action. Must be "approve" or "reject"', 'INVALID_REVIEW_ACTION');
        return;
      }

      // Validate service tier for approve action
      if (action === 'approve' && !serviceTier) {
        sendError(res, 400, 'Service tier is required when approving a driver', 'SERVICE_TIER_REQUIRED');
        return;
      }

      // Validate service tier value
      if (serviceTier && !['standard', 'premium', 'vip'].includes(serviceTier)) {
        sendError(res, 400, 'Invalid service tier. Must be: standard, premium, or vip', 'INVALID_SERVICE_TIER');
        return;
      }

      // Validate rejection reason for reject action
      if (action === 'reject' && !rejectionReason) {
        sendError(res, 400, 'Rejection reason is required for reject action', 'REJECTION_REASON_REQUIRED');
        return;
      }

      const success = await this.adminDriverService.reviewDriverApplication({
        driverId,
        reviewerId,
        action,
        serviceTier,
        notes,
        rejectionReason,
      });

      if (success) {
        sendResponse(res, 200, `Driver application ${action}d successfully`, {
          driverId,
          action,
          serviceTier: action === 'approve' ? serviceTier : undefined,
          reviewedBy: reviewerId,
        });
      } else {
        sendError(res, 500, 'Failed to review driver application', 'DRIVER_REVIEW_ERROR');
      }
    } catch (error: any) {
      logger.error('Review driver error:', error);
      
      // Return specific error message if available
      const errorMessage = error.message || 'Failed to review driver application';
      sendError(res, 500, errorMessage, 'DRIVER_REVIEW_ERROR');
    }
  };

  /**
   * Get admin review statistics for drivers
   * GET /admin/drivers/statistics
   */
  getReviewStatistics = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const reviewerId = req.query.reviewerId as string;

      const statistics = await this.adminDriverService.getDriverReviewStatistics(reviewerId);

      sendResponse(res, 200, 'Driver review statistics retrieved successfully', {
        statistics,
      });
    } catch (error: any) {
      logger.error('Get driver review statistics error:', error);
      sendError(res, 500, 'Failed to get review statistics', 'STATISTICS_FETCH_ERROR');
    }
  };

  /**
   * Bulk approve driver applications
   * POST /admin/drivers/bulk-approve
   */
  bulkApproveDrivers = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverIds, notes } = req.body;
      const reviewerId = req.user?.id;

      if (!reviewerId) {
        sendError(res, 401, 'Admin authentication required', 'ADMIN_AUTH_REQUIRED');
        return;
      }

      if (!Array.isArray(driverIds) || driverIds.length === 0) {
        sendError(res, 400, 'Driver IDs array is required', 'DRIVER_IDS_REQUIRED');
        return;
      }

      const result = await this.adminDriverService.bulkApproveDrivers(
        driverIds,
        reviewerId,
        notes
      );

      sendResponse(res, 200, 'Bulk approval completed', {
        result,
        totalProcessed: driverIds.length,
      });
    } catch (error: any) {
      logger.error('Bulk approve drivers error:', error);
      sendError(res, 500, 'Failed to bulk approve drivers', 'BULK_APPROVE_ERROR');
    }
  };

  /**
   * Search driver applications by criteria
   * GET /admin/drivers/search
   */
  searchDrivers = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;

      // This would require implementing search functionality
      // For now, return a placeholder response
      sendResponse(res, 200, 'Driver search completed', {
        drivers: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          pages: 0,
        },
        message: 'Advanced search feature will be implemented in next iteration',
      });
    } catch (error: any) {
      logger.error('Search drivers error:', error);
      sendError(res, 500, 'Failed to search drivers', 'DRIVER_SEARCH_ERROR');
    }
  };
}