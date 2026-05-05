import { Router } from 'express';
import { AdminDocumentController } from '../controllers/admin-document.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AdminDocumentController();

router.use(adminAuthMiddleware);

router.get('/pending', auditMiddleware('get_pending_documents'), ctrl.getPendingDocuments);
router.get('/statistics', auditMiddleware('get_document_statistics'), ctrl.getReviewStatistics);
router.get('/search', auditMiddleware('search_documents'), ctrl.searchDocuments);
router.post('/bulk-approve', auditMiddleware('bulk_approve_documents'), ctrl.bulkApproveDocuments);
router.get('/:documentId', auditMiddleware('get_document_for_review'), ctrl.getDocumentForReview);
router.post('/:documentId/review', auditMiddleware('review_document'), ctrl.reviewDocument);
router.get('/:documentId/versions', auditMiddleware('get_document_versions'), ctrl.getDocumentVersions);
router.get('/:documentId/access-logs', auditMiddleware('get_document_access_logs'), ctrl.getDocumentAccessLogs);

export default router;
