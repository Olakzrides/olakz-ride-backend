import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { AdminDocumentService } from '../services/admin-document.service';
import { DocumentService } from '../services/document.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AdminDocumentController {
  private adminDocumentService = new AdminDocumentService();
  private documentService = new DocumentService();

  getPendingDocuments = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await this.adminDocumentService.getPendingDocuments(limit, (page - 1) * limit, req.query.priority as string);
      ResponseUtil.success(res, {
        documents: result.documents,
        pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
      }, 'Pending documents retrieved successfully');
    } catch (err: unknown) {
      logger.error('getPendingDocuments error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to get pending documents', 'ADMIN_DOCUMENTS_FETCH_ERROR');
    }
  };

  getDocumentForReview = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const document = await this.adminDocumentService.getDocumentForReview(documentId);
      if (!document) { ResponseUtil.notFound(res, 'Document'); return; }

      let signedUrl = null, signedUrlError = null;
      try {
        signedUrl = await this.documentService.getSecureDocumentUrl(documentId, req.user?.id || 'admin', 24 * 60 * 60, req.ip, req.get('User-Agent'));
      } catch (e: unknown) { signedUrlError = toMessage(e); }

      ResponseUtil.success(res, { document: { ...(document as object), signedUrl, signedUrlError } }, 'Document details retrieved successfully');
    } catch (err: unknown) {
      logger.error('getDocumentForReview error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to get document details', 'DOCUMENT_FETCH_ERROR');
    }
  };

  reviewDocument = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { documentId } = req.params;
      const { action, notes, rejectionReason, priority } = req.body;
      const reviewerId = req.user?.id;

      if (!reviewerId) { ResponseUtil.unauthorized(res); return; }
      if (!['approve', 'reject', 'request_replacement'].includes(action)) { ResponseUtil.badRequest(res, 'Invalid review action', 'INVALID_REVIEW_ACTION'); return; }
      if (action === 'reject' && !rejectionReason) { ResponseUtil.badRequest(res, 'Rejection reason is required', 'REJECTION_REASON_REQUIRED'); return; }

      await this.adminDocumentService.reviewDocument({ documentId, reviewerId, action, notes, rejectionReason, priority });
      ResponseUtil.success(res, { documentId, action, reviewedBy: reviewerId }, `Document ${action}d successfully`);
    } catch (err: unknown) {
      logger.error('reviewDocument error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to review document', 'DOCUMENT_REVIEW_ERROR');
    }
  };

  getReviewStatistics = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const statistics = await this.adminDocumentService.getReviewStatistics(req.query.reviewerId as string);
      ResponseUtil.success(res, { statistics }, 'Review statistics retrieved successfully');
    } catch (err: unknown) {
      logger.error('getReviewStatistics error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to get review statistics', 'STATISTICS_FETCH_ERROR');
    }
  };

  getDocumentVersions = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const versions = await this.adminDocumentService.getDocumentVersions(req.params.documentId);
      ResponseUtil.success(res, { versions }, 'Document versions retrieved successfully');
    } catch (err: unknown) {
      logger.error('getDocumentVersions error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to get document versions', 'VERSIONS_FETCH_ERROR');
    }
  };

  bulkApproveDocuments = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { documentIds, notes } = req.body;
      const reviewerId = req.user?.id;
      if (!reviewerId) { ResponseUtil.unauthorized(res); return; }
      if (!Array.isArray(documentIds) || documentIds.length === 0) { ResponseUtil.badRequest(res, 'Document IDs array is required', 'DOCUMENT_IDS_REQUIRED'); return; }
      const result = await this.adminDocumentService.bulkApproveDocuments(documentIds, reviewerId, notes);
      ResponseUtil.success(res, { result, totalProcessed: documentIds.length }, 'Bulk approval completed');
    } catch (err: unknown) {
      logger.error('bulkApproveDocuments error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to bulk approve documents', 'BULK_APPROVE_ERROR');
    }
  };

  getDocumentAccessLogs = async (_req: AdminRequest, res: Response): Promise<void> => {
    ResponseUtil.success(res, { logs: [] }, 'Access logs retrieved successfully');
  };

  searchDocuments = async (req: AdminRequest, res: Response): Promise<void> => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    ResponseUtil.success(res, { documents: [], pagination: { page, limit, total: 0, pages: 0 } }, 'Document search completed');
  };
}
