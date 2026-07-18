import { Router } from 'express';
import { SupportController } from '../controllers/support.controller';
import { DisputeController } from '../controllers/dispute.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();
const supportController = new SupportController();
const disputeController = new DisputeController();

// All support routes require authentication
router.use(authenticate);

// ── Existing WhatsApp support (keep as-is) ────────────────────────────────
router.post('/contact', supportController.contactSupport);
router.get('/info',     supportController.getSupportInfo);

// ── Issue types dropdown (for Report Issue form) ─────────────────────────
router.get('/issue-types', disputeController.getIssueTypes);

// ── FAQ / Help Center ────────────────────────────────────────────────────
// GET /api/support/faqs/categories  — category tabs (General, Account …)
// GET /api/support/faqs             — articles; ?category=general&search=…
router.get('/faqs/categories', disputeController.getFaqCategories);
router.get('/faqs',            disputeController.getFaqArticles);

// ── Disputes ─────────────────────────────────────────────────────────────
// POST   /api/support/disputes             — submit a new dispute (multipart, up to 2 photos)
// GET    /api/support/disputes             — customer's own disputes; ?status=pending|in_progress|resolved
// GET    /api/support/disputes/:disputeId  — dispute detail + full chat thread
// POST   /api/support/disputes/:disputeId/messages — send a message (optional file attachment)
router.post(
  '/disputes',
  upload.any(),   // accepts up to 2 photo files with any field name
  disputeController.createDispute
);
router.get( '/disputes',                                disputeController.listDisputes);
router.get( '/disputes/:disputeId',                     disputeController.getDispute);
router.post(
  '/disputes/:disputeId/messages',
  upload.single('attachment'),
  disputeController.sendDisputeMessage
);

// ── General Live Chat ────────────────────────────────────────────────────
// POST /api/support/live-chat                       — get or create a general chat session
// GET  /api/support/live-chat/:chatId/messages      — load message history
// POST /api/support/live-chat/:chatId/messages      — send a message
router.post('/live-chat',                                            disputeController.getOrCreateLiveChat);
router.get( '/live-chat/:chatId/messages',                           disputeController.getLiveChatMessages);
router.post('/live-chat/:chatId/messages', upload.single('attachment'), disputeController.sendLiveChatMessage);

export default router;
