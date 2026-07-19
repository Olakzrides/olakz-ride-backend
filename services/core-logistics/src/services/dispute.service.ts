import { supabase } from '../config/database';
import { StorageUtil } from '../utils/storage.util';
import { logger } from '../config/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export type IssueType =
  | 'service_issue'
  | 'payment_problem'
  | 'technical_issue'
  | 'safety_concern'
  | 'bad_driver_behaviour'
  | 'delivery_issues'
  | 'others';

export type DisputeStatus = 'pending' | 'in_progress' | 'resolved';
export type Priority = 'high' | 'medium' | 'low';
export type SenderType = 'customer' | 'admin';
export type ChatType = 'general' | 'dispute';

/** Auto-assign priority based on issue type */
const PRIORITY_MAP: Record<IssueType, Priority> = {
  safety_concern:       'high',
  payment_problem:      'high',
  bad_driver_behaviour: 'high',
  service_issue:        'medium',
  technical_issue:      'medium',
  delivery_issues:      'medium',
  others:               'low',
};

export const ISSUE_TYPES: Array<{ value: IssueType; label: string; description: string }> = [
  { value: 'service_issue',        label: 'Service Issue',        description: 'Issues with driver behavior, vehicle condition, or service quality' },
  { value: 'payment_problem',      label: 'Payment Problem',      description: 'Issues with billing, charges, refunds, or payment methods' },
  { value: 'technical_issue',      label: 'Technical Issue',      description: 'App crashes, login problems, or other technical difficulties' },
  { value: 'safety_concern',       label: 'Safety Concern',       description: 'Safety-related incidents or concerns during your trip' },
  { value: 'bad_driver_behaviour', label: 'Bad Driver Behaviour', description: 'Unprofessional or inappropriate driver conduct' },
  { value: 'delivery_issues',      label: 'Delivery Issues',      description: 'Problems related to a delivery order' },
  { value: 'others',               label: 'Other',                description: 'Any other issues not covered by the above categories' },
];

// ── Dispute CRUD ─────────────────────────────────────────────────────────────

export class DisputeService {

  /**
   * Create a new dispute submitted by a customer, driver, or vendor.
   * reporter_role is read from users.active_role at the time of submission.
   * Photos (up to 2) are already uploaded to Supabase Storage by the controller —
   * this method receives their public URLs.
   */
  async createDispute(params: {
    customerId: string;
    issueType: IssueType;
    title: string;
    description: string;
    photoUrls?: string[];
    referenceId?: string;
    referenceType?: 'ride' | 'delivery';
  }) {
    const priority = PRIORITY_MAP[params.issueType] ?? 'low';

    // Read the user's current active_role so admin knows who is reporting
    const { data: userRow } = await supabase
      .from('users')
      .select('active_role')
      .eq('id', params.customerId)
      .single();

    const reporterRole = userRow?.active_role ?? 'customer';

    const { data: dispute, error } = await supabase
      .from('disputes')
      .insert({
        customer_id:    params.customerId,
        issue_type:     params.issueType,
        title:          params.title,
        description:    params.description,
        status:         'pending',
        priority,
        photo_urls:     params.photoUrls ?? [],
        reference_id:   params.referenceId ?? null,
        reference_type: params.referenceType ?? null,
        reporter_role:  reporterRole,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create dispute: ${error.message}`);

    // Auto-create a chat thread for this dispute
    const { data: chat, error: chatError } = await supabase
      .from('support_chats')
      .insert({
        customer_id:   params.customerId,
        type:          'dispute',
        dispute_id:    dispute.id,
        is_open:       true,
        reporter_role: reporterRole,
      })
      .select()
      .single();

    if (chatError) {
      logger.error('Failed to create dispute chat:', chatError);
    }

    // Send the customer's description as the first message in the thread
    if (chat) {
      await supabase.from('support_messages').insert({
        chat_id:     chat.id,
        sender_id:   params.customerId,
        sender_type: 'customer',
        message:     params.description,
      });
    }

    return { dispute, chat };
  }

  /** List a customer's own disputes with optional status filter */
  async listCustomerDisputes(customerId: string, status?: DisputeStatus) {
    let query = supabase
      .from('disputes')
      .select('id, issue_type, title, description, status, priority, photo_urls, reference_id, reference_type, created_at, updated_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list disputes: ${error.message}`);

    return data ?? [];
  }

  /** Get a single dispute with its full chat thread */
  async getDisputeWithChat(disputeId: string, customerId: string) {
    const { data: dispute, error } = await supabase
      .from('disputes')
      .select('*')
      .eq('id', disputeId)
      .eq('customer_id', customerId)
      .single();

    if (error || !dispute) throw new Error('Dispute not found');

    const { data: chat } = await supabase
      .from('support_chats')
      .select('id')
      .eq('dispute_id', disputeId)
      .single();

    let messages: any[] = [];
    if (chat) {
      const { data: msgs } = await supabase
        .from('support_messages')
        .select('id, sender_id, sender_type, message, attachment_url, is_read, created_at')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true });

      messages = msgs ?? [];

      // Mark admin messages as read now that customer is viewing
      await supabase
        .from('support_messages')
        .update({ is_read: true })
        .eq('chat_id', chat.id)
        .eq('sender_type', 'admin')
        .eq('is_read', false);
    }

    return { dispute, chatId: chat?.id ?? null, messages };
  }

  /** Post a message inside a dispute thread (customer side) */
  async sendDisputeMessage(params: {
    disputeId: string;
    customerId: string;
    message?: string;
    attachmentUrl?: string;
  }) {
    // Verify ownership
    const { data: dispute, error: dErr } = await supabase
      .from('disputes')
      .select('id, status')
      .eq('id', params.disputeId)
      .eq('customer_id', params.customerId)
      .single();

    if (dErr || !dispute) throw new Error('Dispute not found');
    if (dispute.status === 'resolved') throw new Error('Cannot send messages on a resolved dispute');

    const { data: chat, error: cErr } = await supabase
      .from('support_chats')
      .select('id')
      .eq('dispute_id', params.disputeId)
      .single();

    if (cErr || !chat) throw new Error('Chat thread not found for this dispute');

    const { data: msg, error: mErr } = await supabase
      .from('support_messages')
      .insert({
        chat_id:        chat.id,
        sender_id:      params.customerId,
        sender_type:    'customer',
        message:        params.message ?? null,
        attachment_url: params.attachmentUrl ?? null,
      })
      .select()
      .single();

    if (mErr) throw new Error(`Failed to send message: ${mErr.message}`);

    return { message: msg, chatId: chat.id };
  }

  // ── General Live Chat ───────────────────────────────────────────────────────

  /**
   * Get or create the customer's general support chat.
   * If the customer has an existing open general chat, return it.
   * Otherwise create a new one with a welcome message.
   */
  async getOrCreateGeneralChat(customerId: string) {
    // Try to find an existing open general chat
    const { data: existing } = await supabase
      .from('support_chats')
      .select('id, created_at')
      .eq('customer_id', customerId)
      .eq('type', 'general')
      .eq('is_open', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing) return { chatId: existing.id, isNew: false };

    // Read active_role so admin knows who started the chat
    const { data: userRow } = await supabase
      .from('users')
      .select('active_role')
      .eq('id', customerId)
      .single();

    const reporterRole = userRow?.active_role ?? 'customer';

    // Create a new general chat
    const { data: chat, error } = await supabase
      .from('support_chats')
      .insert({
        customer_id:   customerId,
        type:          'general',
        dispute_id:    null,
        is_open:       true,
        reporter_role: reporterRole,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create support chat: ${error.message}`);

    // Insert the automated welcome message from support
    await supabase.from('support_messages').insert({
      chat_id:     chat.id,
      sender_id:   chat.id,
      sender_type: 'admin',
      message:     'Hello! Welcome to Olakz support. How can I help you today?',
    });

    return { chatId: chat.id, isNew: true };
  }

  /** Get messages for a general chat (customer must own the chat) */
  async getGeneralChatMessages(chatId: string, customerId: string) {
    const { data: chat, error } = await supabase
      .from('support_chats')
      .select('id')
      .eq('id', chatId)
      .eq('customer_id', customerId)
      .eq('type', 'general')
      .single();

    if (error || !chat) throw new Error('Chat not found');

    const { data: messages } = await supabase
      .from('support_messages')
      .select('id, sender_id, sender_type, message, attachment_url, is_read, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    // Mark admin messages as read
    await supabase
      .from('support_messages')
      .update({ is_read: true })
      .eq('chat_id', chatId)
      .eq('sender_type', 'admin')
      .eq('is_read', false);

    return messages ?? [];
  }

  /** Send a message in a general chat (customer side) */
  async sendGeneralChatMessage(params: {
    chatId: string;
    customerId: string;
    message?: string;
    attachmentUrl?: string;
  }) {
    const { data: chat, error: cErr } = await supabase
      .from('support_chats')
      .select('id')
      .eq('id', params.chatId)
      .eq('customer_id', params.customerId)
      .eq('type', 'general')
      .single();

    if (cErr || !chat) throw new Error('Chat not found');

    const { data: msg, error: mErr } = await supabase
      .from('support_messages')
      .insert({
        chat_id:        params.chatId,
        sender_id:      params.customerId,
        sender_type:    'customer',
        message:        params.message ?? null,
        attachment_url: params.attachmentUrl ?? null,
      })
      .select()
      .single();

    if (mErr) throw new Error(`Failed to send message: ${mErr.message}`);

    return msg;
  }

  // ── FAQ (read-only for customers) ─────────────────────────────────────────

  async getFaqCategories() {
    const { data, error } = await supabase
      .from('faq_categories')
      .select('id, name, slug, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw new Error(`Failed to fetch FAQ categories: ${error.message}`);
    return data ?? [];
  }

  async getFaqArticles(params: { categorySlug?: string; search?: string }) {
    let query = supabase
      .from('faq_articles')
      .select(`
        id, question, answer, display_order,
        category:faq_categories(id, name, slug)
      `)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (params.categorySlug) {
      query = query.eq('faq_categories.slug', params.categorySlug);
    }

    if (params.search) {
      query = query.or(`question.ilike.%${params.search}%,answer.ilike.%${params.search}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to fetch FAQ articles: ${error.message}`);
    return data ?? [];
  }

  // ── Photo upload helper ───────────────────────────────────────────────────

  /**
   * Upload a complaint photo to Supabase Storage.
   * Returns the public URL.
   */
  async uploadDisputePhoto(customerId: string, file: Express.Multer.File): Promise<string> {
    const result = await StorageUtil.uploadFile(
      file,
      `disputes/${customerId}`
    );
    return result.url;
  }
}
