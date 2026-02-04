import { Router } from 'express';
import { AdminDocumentController } from '../controllers/admin-document.controller';
import { adminAuthMiddleware, adminAuditMiddleware, adminRateLimitMiddleware } from '../middleware/admin.middleware';

const router = Router();
const adminDocumentController = new AdminDocumentController();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);
router.use(adminRateLimitMiddleware(200, 15 * 60 * 1000)); // 200 requests per 15 minutes for admins

/**
 * @route GET /admin/documents/pending
 * @desc Get all pending documents for admin review
 * @access Admin
 */
router.get(
  '/pending',
  adminAuditMiddleware('get_pending_documents'),
  adminDocumentController.getPendingDocuments
);

/**
 * @route GET /admin/documents/statistics
 * @desc Get admin review statistics
 * @access Admin
 */
router.get(
  '/statistics',
  adminAuditMiddleware('get_review_statistics'),
  adminDocumentController.getReviewStatistics
);

/**
 * @route GET /admin/documents/search
 * @desc Search documents by criteria
 * @access Admin
 */
router.get(
  '/search',
  adminAuditMiddleware('search_documents'),
  adminDocumentController.searchDocuments
);

/**
 * @route GET /admin/documents/:documentId
 * @desc Get document details for admin review
 * @access Admin
 */
router.get(
  '/:documentId',
  adminAuditMiddleware('get_document_for_review'),
  adminDocumentController.getDocumentForReview
);

/**
 * @route POST /admin/documents/:documentId/review
 * @desc Review a document (approve, reject, or request replacement)
 * @access Admin
 */
router.post(
  '/:documentId/review',
  adminAuditMiddleware('review_document'),
  adminDocumentController.reviewDocument
);

/**
 * @route GET /admin/documents/:documentId/versions
 * @desc Get document version history
 * @access Admin
 */
router.get(
  '/:documentId/versions',
  adminAuditMiddleware('get_document_versions'),
  adminDocumentController.getDocumentVersions
);

/**
 * @route GET /admin/documents/:documentId/access-logs
 * @desc Get document access logs (admin only)
 * @access Admin
 */
router.get(
  '/:documentId/access-logs',
  adminAuditMiddleware('get_document_access_logs'),
  adminDocumentController.getDocumentAccessLogs
);

/**
 * @route POST /admin/documents/bulk-approve
 * @desc Bulk approve documents
 * @access Admin
 */
router.post(
  '/bulk-approve',
  adminAuditMiddleware('bulk_approve_documents'),
  adminDocumentController.bulkApproveDocuments
);

export default router;