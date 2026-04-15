import supabase from '../utils/supabase';
import logger from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';

const VALID_COMPLAINT_TYPES = ['bad_driver_behaviour', 'payment_issues', 'delivery_issues', 'others'];
const VALID_CATEGORIES = ['general', 'account', 'ordering', 'payment'];

class HelpService {
  // ─── FAQs ────────────────────────────────────────────────────────────────────

  async getFaqs(category?: string, search?: string): Promise<any[]> {
    let query = supabase
      .from('faq_items')
      .select('id, category, question, answer, rank')
      .eq('is_active', true)
      .order('rank', { ascending: true });

    if (category && VALID_CATEGORIES.includes(category)) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('Get FAQs error:', error);
      throw new Error('Failed to fetch FAQs');
    }

    let faqs = data || [];

    if (search) {
      const term = search.toLowerCase();
      faqs = faqs.filter(
        (f) =>
          f.question.toLowerCase().includes(term) ||
          f.answer.toLowerCase().includes(term)
      );
    }

    return faqs;
  }

  // ─── Support Tickets ─────────────────────────────────────────────────────────

  async getTickets(userId: string, status?: string): Promise<any[]> {
    let query = supabase
      .from('support_tickets')
      .select('id, title, complaint_type, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('Get tickets error:', error);
      throw new Error('Failed to fetch tickets');
    }

    return data || [];
  }

  async createTicket(
    userId: string,
    data: { title: string; complaintType: string; description?: string; photoUrls?: string[] }
  ): Promise<any> {
    if (!data.title?.trim()) throw new ValidationError('Title is required');
    if (!VALID_COMPLAINT_TYPES.includes(data.complaintType)) {
      throw new ValidationError(`complaintType must be one of: ${VALID_COMPLAINT_TYPES.join(', ')}`);
    }

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        title: data.title.trim(),
        complaint_type: data.complaintType,
        description: data.description?.trim() || null,
        photo_urls: data.photoUrls || [],
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      logger.error('Create ticket error:', error);
      throw new Error('Failed to create ticket');
    }

    logger.info('Support ticket created', { userId, ticketId: ticket.id });
    return ticket;
  }

  // ─── Support Messages ─────────────────────────────────────────────────────────

  async getMessages(userId: string, ticketId: string): Promise<any[]> {
    // Verify ticket belongs to user
    const { data: ticket } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .single();

    if (!ticket) throw new NotFoundError('Ticket not found');

    const { data, error } = await supabase
      .from('support_messages')
      .select('id, sender_id, sender_type, message, attachment_url, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error('Get messages error:', error);
      throw new Error('Failed to fetch messages');
    }

    return data || [];
  }

  async sendMessage(
    userId: string,
    ticketId: string,
    data: { message: string; attachmentUrl?: string }
  ): Promise<any> {
    if (!data.message?.trim()) throw new ValidationError('Message is required');

    // Verify ticket belongs to user
    const { data: ticket } = await supabase
      .from('support_tickets')
      .select('id, status')
      .eq('id', ticketId)
      .eq('user_id', userId)
      .single();

    if (!ticket) throw new NotFoundError('Ticket not found');

    const { data: message, error } = await supabase
      .from('support_messages')
      .insert({
        ticket_id: ticketId,
        sender_id: userId,
        sender_type: 'user',
        message: data.message.trim(),
        attachment_url: data.attachmentUrl || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Send message error:', error);
      throw new Error('Failed to send message');
    }

    // Update ticket updated_at
    await supabase
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', ticketId);

    logger.info('Support message sent', { userId, ticketId, messageId: message.id });
    return message;
  }
}

export default new HelpService();
