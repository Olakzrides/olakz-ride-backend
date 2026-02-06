import { Response } from 'express';
import { AdminDocumentService } from '../services/admin-document.service';
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

export class AdminDocumentController {
  private adminDocumentService: AdminDocumentService;
  private documentService: DocumentService;

  constructor() {
    this.adminDocumentService = new AdminDocumentService();
    this.documentService = new DocumentService();
  }

  /**
   * Get all pending documents for admin review
   * GET /admin/documents/pending
   */
  getPendingDocuments = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        priority 
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      const result = await this.adminDocumentService.getPendingDocuments(
        Number(limit),
        offset,
        priority as string
      );

      sendResponse(res, 200, 'Pending documents retrieved successfully', {
        documents: result.documents,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: result.total,
          pages: Math.ceil(result.total / Number(limit)),
        },
      });
    } catch (error: any) {
      logger.error('Get pending documents error:', error);
      sendError(res, 500, 'Failed to get pending documents', 'ADMIN_DOCUMENTS_FETCH_ERROR');
    }
  };

  /**
   * Get document details for admin review
   * GET /admin/documents/:documentId
   */
  getDocumentForReview = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;

      const document = await this.adminDocumentService.getDocumentForReview(documentId);

      if (!document) {
        sendError(res, 404, 'Document not found', 'DOCUMENT_NOT_FOUND');
        return;
      }

      // Try to get secure signed URL for document viewing
      let signedUrl = null;
      try {
        signedUrl = await this.documentService.getSecureDocumentUrl(
          documentId,
          req.user?.id || 'admin',
          24 * 60 * 60, // 24 hours
          req.ip,
          req.get('User-Agent')
        );
      } catch (error: any) {
        logger.warn('Could not generate signed URL for document:', {
          documentId,
          error: error.message,
          documentUrl: (document as any).document_url,
        });
        // Continue without signed URL - admin can still see document metadata
      }

      sendResponse(res, 200, 'Document details retrieved successfully', {
        document: {
          ...document,
          signedUrl,
          signedUrlError: signedUrl ? null : 'Document file not accessible - may have been moved or deleted',
        },
      });
    } catch (error: any) {
      logger.error('Get document for review error:', error);
      sendError(res, 500, 'Failed to get document details', 'DOCUMENT_FETCH_ERROR');
    }
  };

  /**
   * Review a document (approve, reject, or request replacement)
   * POST /admin/documents/:documentId/review
   */
  reviewDocument = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const { action, notes, rejectionReason, priority } = req.body;
      const reviewerId = req.user?.id;

      if (!reviewerId) {
        sendError(res, 401, 'Admin authentication required', 'ADMIN_AUTH_REQUIRED');
        return;
      }

      // Validate action
      if (!['approve', 'reject', 'request_replacement'].includes(action)) {
        sendError(res, 400, 'Invalid review action', 'INVALID_REVIEW_ACTION');
        return;
      }

      // Validate rejection reason for reject action
      if (action === 'reject' && !rejectionReason) {
        sendError(res, 400, 'Rejection reason is required for reject action', 'REJECTION_REASON_REQUIRED');
        return;
      }

      const success = await this.adminDocumentService.reviewDocument({
        documentId,
        reviewerId,
        action,
        notes,
        rejectionReason,
        priority,
      });

      if (success) {
        sendResponse(res, 200, `Document ${action}d successfully`, {
          documentId,
          action,
          reviewedBy: reviewerId,
        });
      } else {
        sendError(res, 500, 'Failed to review document', 'DOCUMENT_REVIEW_ERROR');
      }
    } catch (error: any) {
      logger.error('Review document error:', error);
      sendError(res, 500, 'Failed to review document', 'DOCUMENT_REVIEW_ERROR');
    }
  };

  /**
   * Get admin review statistics
   * GET /admin/documents/statistics
   */
  getReviewStatistics = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const reviewerId = req.query.reviewerId as string;

      const statistics = await this.adminDocumentService.getReviewStatistics(reviewerId);

      sendResponse(res, 200, 'Review statistics retrieved successfully', {
        statistics,
      });
    } catch (error: any) {
      logger.error('Get review statistics error:', error);
      sendError(res, 500, 'Failed to get review statistics', 'STATISTICS_FETCH_ERROR');
    }
  };

  /**
   * Get document version history
   * GET /admin/documents/:documentId/versions
   */
  getDocumentVersions = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;

      const versions = await this.adminDocumentService.getDocumentVersions(documentId);

      sendResponse(res, 200, 'Document versions retrieved successfully', {
        versions,
      });
    } catch (error: any) {
      logger.error('Get document versions error:', error);
      sendError(res, 500, 'Failed to get document versions', 'VERSIONS_FETCH_ERROR');
    }
  };

  /**
   * Bulk approve documents
   * POST /admin/documents/bulk-approve
   */
  bulkApproveDocuments = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { documentIds, notes } = req.body;
      const reviewerId = req.user?.id;

      if (!reviewerId) {
        sendError(res, 401, 'Admin authentication required', 'ADMIN_AUTH_REQUIRED');
        return;
      }

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        sendError(res, 400, 'Document IDs array is required', 'DOCUMENT_IDS_REQUIRED');
        return;
      }

      const result = await this.adminDocumentService.bulkApproveDocuments(
        documentIds,
        reviewerId,
        notes
      );

      sendResponse(res, 200, 'Bulk approval completed', {
        result,
        totalProcessed: documentIds.length,
      });
    } catch (error: any) {
      logger.error('Bulk approve documents error:', error);
      sendError(res, 500, 'Failed to bulk approve documents', 'BULK_APPROVE_ERROR');
    }
  };

  /**
   * Get document access logs (admin only)
   * GET /admin/documents/:documentId/access-logs
   */
  getDocumentAccessLogs = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      // This would require extending DocumentAccessLogService
      // For now, return a placeholder response
      sendResponse(res, 200, 'Access logs retrieved successfully', {
        logs: [],
        message: 'Access logs feature will be implemented in next iteration',
      });
    } catch (error: any) {
      logger.error('Get document access logs error:', error);
      sendError(res, 500, 'Failed to get access logs', 'ACCESS_LOGS_FETCH_ERROR');
    }
  };

  /**
   * Search documents by criteria
   * GET /admin/documents/search
   */
  searchDocuments = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { page = 1, limit = 20 } = req.query;

      // This would require implementing search functionality
      // For now, return a placeholder response
      sendResponse(res, 200, 'Document search completed', {
        documents: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          pages: 0,
        },
        message: 'Advanced search feature will be implemented in next iteration',
      });
    } catch (error: any) {
      logger.error('Search documents error:', error);
      sendError(res, 500, 'Failed to search documents', 'DOCUMENT_SEARCH_ERROR');
    }
  };
}