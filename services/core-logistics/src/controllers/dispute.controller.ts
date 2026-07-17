import { Request, Response } from 'express';
import { DisputeService, ISSUE_TYPES, IssueType } from '../services/dispute.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

const VALID_ISSUE_TYPES = ISSUE_TYPES.map(t => t.value);

export class DisputeController {
  private disputeService = new DisputeService();

  // ── Issue types dropdown data ─────────────────────────────────────────────

  /**
   * GET /api/support/issue-types
   * Returns the list of issue type options for the Report Issue dropdown.
   */
  getIssueTypes = async (_req: Request, res: Response): Promise<void> => {
    ResponseUtil.success(res, { issue_types: ISSUE_TYPES });
  };

  // ── Disputes ──────────────────────────────────────────────────────────────

  /**
   * POST /api/support/disputes
   * Create a new dispute. Photos (max 2) can be sent as multipart/form-data.
   */
  createDispute = async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) { ResponseUtil.unauthorized(res); return; }

      const { issue_type, title, description, reference_id, reference_type } = req.body;

      if (!issue_type || !title || !description) {
        ResponseUtil.badRequest(res, 'issue_type, title and description are required');
        return;
      }

      if (!VALID_ISSUE_TYPES.includes(issue_type)) {
        ResponseUtil.badRequest(res, `Invalid issue_type. Must be one of: ${VALID_ISSUE_TYPES.join(', ')}`);
        return;
      }

      if (title.length > 100) {
        ResponseUtil.badRequest(res, 'Title must be 100 characters or less');
        return;
      }

      if (description.length > 1000) {
        ResponseUtil.badRequest(res, 'Description must be 1000 characters or less');
        return;
      }

      // Handle optional photo uploads (up to 2)
      const files: Express.Multer.File[] = [];
      if (req.files) {
        if (Array.isArray(req.files)) {
          files.push(...req.files.slice(0, 2));
        } else {
          Object.values(req.files).forEach(arr => files.push(...arr.slice(0, 2)));
        }
      }

      const photoUrls: string[] = [];
      for (const file of files.slice(0, 2)) {
        try {
          const url = await this.disputeService.uploadDisputePhoto(customerId, file);
          photoUrls.push(url);
        } catch (uploadErr: any) {
          logger.warn('Dispute photo upload failed:', uploadErr.message);
          // Non-fatal — continue without this photo
        }
      }

      const { dispute } = await this.disputeService.createDispute({
        customerId,
        issueType:     issue_type as IssueType,
        title:         title.trim(),
        description:   description.trim(),
        photoUrls,
        referenceId:   reference_id,
        referenceType: reference_type,
      });

      ResponseUtil.success(
        res,
        { dispute },
        'Your dispute has been submitted successfully. We will review it and get back to you soon.',
        201
      );
    } catch (err: any) {
      logger.error('createDispute error:', err);
      ResponseUtil.error(res, err.message);
    }
  };

  /**
   * GET /api/support/disputes
   * List the authenticated customer's disputes.
   * Query: ?status=pending|in_progress|resolved
   */
  listDisputes = async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) { ResponseUtil.unauthorized(res); return; }

      const { status } = req.query as { status?: string };
      const validStatuses = ['pending', 'in_progress', 'resolved'];
      const statusFilter = validStatuses.includes(status ?? '') ? (status as any) : undefined;

      const disputes = await this.disputeService.listCustomerDisputes(customerId, statusFilter);
      ResponseUtil.success(res, { disputes, total: disputes.length });
    } catch (err: any) {
      logger.error('listDisputes error:', err);
      ResponseUtil.error(res, err.message);
    }
  };

  /**
   * GET /api/support/disputes/:disputeId
   * Get a single dispute with its full chat thread.
   */
  getDispute = async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) { ResponseUtil.unauthorized(res); return; }

      const { disputeId } = req.params;
      const result = await this.disputeService.getDisputeWithChat(disputeId, customerId);
      ResponseUtil.success(res, result);
    } catch (err: any) {
      if (err.message === 'Dispute not found') {
        ResponseUtil.notFound(res, 'Dispute');
      } else {
        logger.error('getDispute error:', err);
        ResponseUtil.error(res, err.message);
      }
    }
  };

  /**
   * POST /api/support/disputes/:disputeId/messages
   * Send a message inside a dispute chat thread.
   */
  sendDisputeMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) { ResponseUtil.unauthorized(res); return; }

      const { disputeId } = req.params;
      const { message } = req.body;

      // Optional single attachment
      let attachmentUrl: string | undefined;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (file) {
        attachmentUrl = await this.disputeService.uploadDisputePhoto(customerId, file);
      }

      if (!message && !attachmentUrl) {
        ResponseUtil.badRequest(res, 'message or attachment is required');
        return;
      }

      const result = await this.disputeService.sendDisputeMessage({
        disputeId,
        customerId,
        message,
        attachmentUrl,
      });

      ResponseUtil.success(res, result, 'Message sent', 201);
    } catch (err: any) {
      if (err.message.includes('not found')) {
        ResponseUtil.notFound(res, 'Dispute');
      } else if (err.message.includes('resolved')) {
        ResponseUtil.error(res, err.message, 400);
      } else {
        logger.error('sendDisputeMessage error:', err);
        ResponseUtil.error(res, err.message);
      }
    }
  };

  // ── General Live Chat ─────────────────────────────────────────────────────

  /**
   * POST /api/support/live-chat
   * Get or create the customer's general support chat session.
   * Returns the chatId + welcome message if new.
   */
  getOrCreateLiveChat = async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) { ResponseUtil.unauthorized(res); return; }

      const result = await this.disputeService.getOrCreateGeneralChat(customerId);
      ResponseUtil.success(res, result, result.isNew ? 'Support chat started' : 'Support chat resumed');
    } catch (err: any) {
      logger.error('getOrCreateLiveChat error:', err);
      ResponseUtil.error(res, err.message);
    }
  };

  /**
   * GET /api/support/live-chat/:chatId/messages
   * Fetch all messages in a general chat.
   */
  getLiveChatMessages = async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) { ResponseUtil.unauthorized(res); return; }

      const { chatId } = req.params;
      const messages = await this.disputeService.getGeneralChatMessages(chatId, customerId);
      ResponseUtil.success(res, { messages, total: messages.length });
    } catch (err: any) {
      if (err.message === 'Chat not found') {
        ResponseUtil.notFound(res, 'Chat');
      } else {
        logger.error('getLiveChatMessages error:', err);
        ResponseUtil.error(res, err.message);
      }
    }
  };

  /**
   * POST /api/support/live-chat/:chatId/messages
   * Send a message in the general chat.
   */
  sendLiveChatMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = (req as any).user?.id;
      if (!customerId) { ResponseUtil.unauthorized(res); return; }

      const { chatId } = req.params;
      const { message } = req.body;

      let attachmentUrl: string | undefined;
      const file = (req as any).file as Express.Multer.File | undefined;
      if (file) {
        attachmentUrl = await this.disputeService.uploadDisputePhoto(customerId, file);
      }

      if (!message && !attachmentUrl) {
        ResponseUtil.badRequest(res, 'message or attachment is required');
        return;
      }

      const msg = await this.disputeService.sendGeneralChatMessage({
        chatId,
        customerId,
        message,
        attachmentUrl,
      });

      ResponseUtil.success(res, { message: msg }, 'Message sent', 201);
    } catch (err: any) {
      if (err.message === 'Chat not found') {
        ResponseUtil.notFound(res, 'Chat');
      } else {
        logger.error('sendLiveChatMessage error:', err);
        ResponseUtil.error(res, err.message);
      }
    }
  };

  // ── FAQ ───────────────────────────────────────────────────────────────────

  /**
   * GET /api/support/faqs/categories
   */
  getFaqCategories = async (_req: Request, res: Response): Promise<void> => {
    try {
      const categories = await this.disputeService.getFaqCategories();
      ResponseUtil.success(res, { categories });
    } catch (err: any) {
      logger.error('getFaqCategories error:', err);
      ResponseUtil.error(res, err.message);
    }
  };

  /**
   * GET /api/support/faqs
   * Query: ?category=general&search=account
   */
  getFaqArticles = async (req: Request, res: Response): Promise<void> => {
    try {
      const { category, search } = req.query as { category?: string; search?: string };
      const articles = await this.disputeService.getFaqArticles({
        categorySlug: category,
        search,
      });
      ResponseUtil.success(res, { articles, total: articles.length });
    } catch (err: any) {
      logger.error('getFaqArticles error:', err);
      ResponseUtil.error(res, err.message);
    }
  };
}
