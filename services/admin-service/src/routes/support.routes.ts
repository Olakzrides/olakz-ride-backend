import { Router } from 'express';
import { SupportAdminController } from '../controllers/support-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl   = new SupportAdminController();

router.use(adminAuthMiddleware);

// ── Dispute counts (tab badges) ──────────────────────────────────────────────
// GET /api/admin/support/disputes/counts
router.get('/disputes/counts',
  auditMiddleware('support_get_dispute_counts'),
  ctrl.getDisputeCounts
);

// ── Dispute list ─────────────────────────────────────────────────────────────
// GET /api/admin/support/disputes?status=pending&priority=high&issue_type=…&search=…&page=1&limit=20
router.get('/disputes',
  auditMiddleware('support_list_disputes'),
  ctrl.listDisputes
);

// ── Single dispute detail + chat ─────────────────────────────────────────────
// GET /api/admin/support/disputes/:disputeId
router.get('/disputes/:disputeId',
  auditMiddleware('support_get_dispute'),
  ctrl.getDispute
);

// ── Update dispute status ────────────────────────────────────────────────────
// PATCH /api/admin/support/disputes/:disputeId/status
// Body: { status: 'in_progress' | 'resolved', resolution_note?: string }
router.patch('/disputes/:disputeId/status',
  auditMiddleware('support_update_dispute_status'),
  ctrl.updateDisputeStatus
);

// ── Admin replies inside a dispute thread ────────────────────────────────────
// POST /api/admin/support/disputes/:disputeId/messages
// Body: { message: string }
router.post('/disputes/:disputeId/messages',
  auditMiddleware('support_send_dispute_message'),
  ctrl.sendDisputeMessage
);

// ── General live chat list ───────────────────────────────────────────────────
// GET /api/admin/support/live-chats?page=1&limit=20
router.get('/live-chats',
  auditMiddleware('support_list_live_chats'),
  ctrl.listLiveChats
);

// ── General chat messages (marks customer msgs as read) ──────────────────────
// GET /api/admin/support/live-chats/:chatId/messages
router.get('/live-chats/:chatId/messages',
  auditMiddleware('support_get_live_chat_messages'),
  ctrl.getLiveChatMessages
);

// ── Admin replies in general chat ────────────────────────────────────────────
// POST /api/admin/support/live-chats/:chatId/messages
// Body: { message: string }
router.post('/live-chats/:chatId/messages',
  auditMiddleware('support_send_live_chat_message'),
  ctrl.sendLiveChatMessage
);

// ── FAQ categories ───────────────────────────────────────────────────────────
// GET  /api/admin/support/faq/categories
// POST /api/admin/support/faq/categories   Body: { name, slug, display_order? }
router.get( '/faq/categories', auditMiddleware('support_list_faq_categories'), ctrl.listFaqCategories);
router.post('/faq/categories', auditMiddleware('support_create_faq_category'), ctrl.createFaqCategory);

// ── FAQ articles ─────────────────────────────────────────────────────────────
// GET    /api/admin/support/faq/articles?category_id=…&include_inactive=true
// POST   /api/admin/support/faq/articles
// PUT    /api/admin/support/faq/articles/:articleId
// DELETE /api/admin/support/faq/articles/:articleId  (soft delete)
router.get(   '/faq/articles',             auditMiddleware('support_list_faq_articles'),   ctrl.listFaqArticles);
router.post(  '/faq/articles',             auditMiddleware('support_create_faq_article'),  ctrl.createFaqArticle);
router.put(   '/faq/articles/:articleId',  auditMiddleware('support_update_faq_article'),  ctrl.updateFaqArticle);
router.delete('/faq/articles/:articleId',  auditMiddleware('support_delete_faq_article'),  ctrl.deleteFaqArticle);

export default router;
