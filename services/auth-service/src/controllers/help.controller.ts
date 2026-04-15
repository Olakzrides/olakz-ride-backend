import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import helpService from '../services/help.service';
import ResponseUtil from '../utils/response';

class HelpController {
  async getFaqs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category, search } = req.query as { category?: string; search?: string };
      const faqs = await helpService.getFaqs(category, search);
      ResponseUtil.success(res, { faqs }, 'FAQs retrieved');
    } catch (error) { next(error); }
  }

  async getTickets(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { status } = req.query as { status?: string };
      const tickets = await helpService.getTickets(userId, status);
      ResponseUtil.success(res, { tickets }, 'Tickets retrieved');
    } catch (error) { next(error); }
  }

  async createTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { title, complaintType, description, photoUrls } = req.body;
      if (!title || !complaintType) {
        ResponseUtil.error(res, 'title and complaintType are required', 400);
        return;
      }
      const ticket = await helpService.createTicket(userId, { title, complaintType, description, photoUrls });
      ResponseUtil.success(res, { ticket }, 'Ticket created successfully', 201);
    } catch (error) { next(error); }
  }

  async getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { ticketId } = req.params;
      const messages = await helpService.getMessages(userId, ticketId);
      ResponseUtil.success(res, { messages }, 'Messages retrieved');
    } catch (error) { next(error); }
  }

  async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as AuthRequest).user!.userId;
      const { ticketId } = req.params;
      const { message, attachmentUrl } = req.body;
      if (!message) { ResponseUtil.error(res, 'message is required', 400); return; }
      const msg = await helpService.sendMessage(userId, ticketId, { message, attachmentUrl });
      ResponseUtil.success(res, { message: msg }, 'Message sent', 201);
    } catch (error) { next(error); }
  }
}

export default new HelpController();
