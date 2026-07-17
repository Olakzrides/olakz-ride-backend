import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { SupportAdminService } from '../services/support-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class SupportAdminController {
  private svc = new SupportAdminService();

  // ── Dispute list & counts ─────────────────────────────────────────────────

  /**
   * GET /api/admin/support/disputes/counts
   * Tab badge counts: all, pending, in_progress, resolved
   */
  getDisputeCounts = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const counts = await this.svc.getDisputeStatusCounts();
      ResponseUtil.success(res, counts, 'Dispute counts retrieved');
    } catch (err) {
      logger.error('getDisputeCounts error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve dispute counts');
    }
  };

  /**
   * GET /api/admin/support/disputes
   * Paginated dispute list with filters.
   * Query: ?status=pending&priority=high&issue_type=payment_problem&search=…&page=1&limit=20
   */
  listDisputes = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await this.svc.listDisputes({
        status:    req.query.status    as any,
        priority:  req.query.priority  as any,
        issueType: req.query.issue_type as string | undefined,
        search:    req.query.search    as string | undefined,
        page,
        limit,
      });

      ResponseUtil.success(res, result, 'Disputes retrieved');
    } catch (err) {
      logger.error('listDisputes error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve disputes');
    }
  };

  /**
   * GET /api/admin/support/disputes/:disputeId
   * Full dispute detail with chat thread and customer info.
   */
  getDispute = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const result = await this.svc.getDisputeDetail(req.params.disputeId);
      ResponseUtil.success(res, result, 'Dispute retrieved');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'Dispute not found') {
        ResponseUtil.notFound(res, 'Dispute');
      } else {
        logger.error('getDispute error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to retrieve dispute');
      }
    }
  };

  /**
   * PATCH /api/admin/support/disputes/:disputeId/status
   * Update dispute status.
   * Body: { status: 'in_progress' | 'resolved', resolution_note?: string }
   */
  updateDisputeStatus = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { status, resolution_note } = req.body;
      const validStatuses = ['pending', 'in_progress', 'resolved'];

      if (!status || !validStatuses.includes(status)) {
        ResponseUtil.badRequest(res, `status must be one of: ${validStatuses.join(', ')}`);
        return;
      }

      if (status === 'resolved' && !resolution_note) {
        ResponseUtil.badRequest(res, 'resolution_note is required when resolving a dispute');
        return;
      }

      const dispute = await this.svc.updateDisputeStatus({
        disputeId:      req.params.disputeId,
        status,
        adminId:        req.user!.id,
        resolutionNote: resolution_note,
      });

      ResponseUtil.success(res, { dispute }, 'Dispute status updated');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'Dispute not found or update failed') {
        ResponseUtil.notFound(res, 'Dispute');
      } else {
        logger.error('updateDisputeStatus error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to update dispute status');
      }
    }
  };

  /**
   * POST /api/admin/support/disputes/:disputeId/messages
   * Admin sends a reply inside a dispute chat.
   * Body: { message: string }
   */
  sendDisputeMessage = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { message } = req.body;

      if (!message?.trim()) {
        ResponseUtil.badRequest(res, 'message is required');
        return;
      }

      const result = await this.svc.sendDisputeMessage({
        disputeId: req.params.disputeId,
        adminId:   req.user!.id,
        message:   message.trim(),
      });

      ResponseUtil.created(res, result, 'Message sent');
    } catch (err) {
      const msg = toMsg(err);
      if (msg.includes('not found')) {
        ResponseUtil.notFound(res, 'Dispute');
      } else if (msg.includes('resolved')) {
        ResponseUtil.badRequest(res, msg);
      } else {
        logger.error('sendDisputeMessage error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to send message');
      }
    }
  };

  // ── General Live Chat ─────────────────────────────────────────────────────

  /**
   * GET /api/admin/support/live-chats
   * Paginated list of general support chat sessions.
   */
  listLiveChats = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await this.svc.listGeneralChats({ page, limit });
      ResponseUtil.success(res, result, 'Live chats retrieved');
    } catch (err) {
      logger.error('listLiveChats error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve live chats');
    }
  };

  /**
   * GET /api/admin/support/live-chats/:chatId/messages
   * Messages in a general chat (marks customer messages as read).
   */
  getLiveChatMessages = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const result = await this.svc.getGeneralChatMessages(req.params.chatId);
      ResponseUtil.success(res, result, 'Messages retrieved');
    } catch (err) {
      const msg = toMsg(err);
      if (msg === 'Chat not found') {
        ResponseUtil.notFound(res, 'Chat');
      } else {
        logger.error('getLiveChatMessages error', { error: msg });
        ResponseUtil.serverError(res, 'Failed to retrieve messages');
      }
    }
  };

  /**
   * POST /api/admin/support/live-chats/:chatId/messages
   * Admin replies in a general chat.
   * Body: { message: string }
   */
  sendLiveChatMessage = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { message } = req.body;

      if (!message?.trim()) {
        ResponseUtil.badRequest(res, 'message is required');
        return;
      }

      const msg = await this.svc.sendGeneralChatMessage({
        chatId:  req.params.chatId,
        adminId: req.user!.id,
        message: message.trim(),
      });

      ResponseUtil.created(res, { message: msg }, 'Message sent');
    } catch (err) {
      const errMsg = toMsg(err);
      if (errMsg === 'Chat not found') {
        ResponseUtil.notFound(res, 'Chat');
      } else {
        logger.error('sendLiveChatMessage error', { error: errMsg });
        ResponseUtil.serverError(res, 'Failed to send message');
      }
    }
  };

  // ── FAQ management ────────────────────────────────────────────────────────

  /** GET /api/admin/support/faq/categories */
  listFaqCategories = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const categories = await this.svc.listFaqCategories();
      ResponseUtil.success(res, { categories }, 'FAQ categories retrieved');
    } catch (err) {
      logger.error('listFaqCategories error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve FAQ categories');
    }
  };

  /** POST /api/admin/support/faq/categories — Body: { name, slug, display_order? } */
  createFaqCategory = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { name, slug, display_order } = req.body;
      if (!name || !slug) {
        ResponseUtil.badRequest(res, 'name and slug are required');
        return;
      }
      const category = await this.svc.createFaqCategory({ name, slug, displayOrder: display_order });
      ResponseUtil.created(res, { category }, 'FAQ category created');
    } catch (err) {
      logger.error('createFaqCategory error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to create FAQ category');
    }
  };

  /** GET /api/admin/support/faq/articles?category_id=…&include_inactive=true */
  listFaqArticles = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const articles = await this.svc.listFaqArticles({
        categoryId:      req.query.category_id as string | undefined,
        includeInactive: req.query.include_inactive === 'true',
      });
      ResponseUtil.success(res, { articles, total: articles.length }, 'FAQ articles retrieved');
    } catch (err) {
      logger.error('listFaqArticles error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve FAQ articles');
    }
  };

  /** POST /api/admin/support/faq/articles */
  createFaqArticle = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { category_id, question, answer, display_order } = req.body;
      if (!category_id || !question || !answer) {
        ResponseUtil.badRequest(res, 'category_id, question and answer are required');
        return;
      }
      const article = await this.svc.createFaqArticle({
        categoryId:   category_id,
        question:     question.trim(),
        answer:       answer.trim(),
        displayOrder: display_order,
        adminId:      req.user!.id,
      });
      ResponseUtil.created(res, { article }, 'FAQ article created');
    } catch (err) {
      logger.error('createFaqArticle error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to create FAQ article');
    }
  };

  /** PUT /api/admin/support/faq/articles/:articleId */
  updateFaqArticle = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { question, answer, category_id, display_order, is_active } = req.body;
      const article = await this.svc.updateFaqArticle({
        articleId:    req.params.articleId,
        question,
        answer,
        categoryId:   category_id,
        displayOrder: display_order,
        isActive:     is_active,
        adminId:      req.user!.id,
      });
      ResponseUtil.success(res, { article }, 'FAQ article updated');
    } catch (err) {
      logger.error('updateFaqArticle error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to update FAQ article');
    }
  };

  /** DELETE /api/admin/support/faq/articles/:articleId — soft delete */
  deleteFaqArticle = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      await this.svc.deleteFaqArticle(req.params.articleId, req.user!.id);
      ResponseUtil.success(res, null, 'FAQ article deleted');
    } catch (err) {
      logger.error('deleteFaqArticle error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to delete FAQ article');
    }
  };
}
