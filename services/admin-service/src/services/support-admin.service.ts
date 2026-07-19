import axios from 'axios';
import { supabase } from '../config/database';
import config from '../config';
import { logger } from '../utils/logger';

// ── Types ────────────────────────────────────────────────────────────────────

export type DisputeStatus = 'pending' | 'in_progress' | 'resolved';
export type Priority      = 'high' | 'medium' | 'low';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Call core-logistics internal API to push a Socket.IO event to the customer */
async function emitToCustomer(
  endpoint: 'message' | 'dispute-status',
  body: Record<string, unknown>
): Promise<void> {
  try {
    const baseUrl = process.env.CORE_LOGISTICS_INTERNAL_URL || 'http://localhost:3001';
    await axios.post(
      `${baseUrl}/api/internal/support/emit/${endpoint}`,
      body,
      {
        headers: {
          'x-internal-api-key': process.env.INTERNAL_API_KEY || config.internalApiKey,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );
  } catch (err: any) {
    // Non-fatal — message is already saved to DB; socket delivery is best-effort
    logger.warn(`Socket emit to customer failed (${endpoint}):`, err.message);
  }
}

/**
 * Fetch role-specific profile for the reporter.
 * - driver  → drivers table (status, rating, vehicle info)
 * - vendor  → vendors table (business_name, business_type, verification_status)
 * - customer → no extra lookup needed
 */
async function fetchReporterProfile(
  userId: string,
  reporterRole: string
): Promise<Record<string, any> | null> {
  try {
    if (reporterRole === 'driver') {
      const { data } = await supabase
        .from('drivers')
        .select(`
          id, status, rating, total_rides, total_deliveries,
          service_types, created_at,
          vehicle_type:vehicle_types!drivers_vehicle_type_id_fkey(name, display_name),
          vehicles:driver_vehicles(plate_number, manufacturer, model, year, color, is_active)
        `)
        .eq('user_id', userId)
        .single();

      if (!data) return null;

      const activeVehicle = (data.vehicles as any[])?.find((v: any) => v.is_active) ?? data.vehicles?.[0] ?? null;

      return {
        driver_id:        data.id,
        status:           data.status,
        rating:           data.rating,
        total_rides:      data.total_rides,
        total_deliveries: data.total_deliveries,
        service_types:    data.service_types,
        vehicle_type:     (data.vehicle_type as any)?.display_name ?? null,
        vehicle:          activeVehicle ? {
          plate_number: activeVehicle.plate_number,
          manufacturer: activeVehicle.manufacturer,
          model:        activeVehicle.model,
          year:         activeVehicle.year,
          color:        activeVehicle.color,
        } : null,
        registered_at: data.created_at,
      };
    }

    if (reporterRole === 'vendor') {
      const { data } = await supabase
        .from('vendors')
        .select('id, business_name, business_type, verification_status, is_active, city, state, created_at')
        .eq('user_id', userId)
        .single();

      if (!data) return null;

      return {
        vendor_id:           data.id,
        business_name:       data.business_name,
        business_type:       data.business_type,
        verification_status: data.verification_status,
        is_active:           data.is_active,
        city:                data.city,
        state:               data.state,
        registered_at:       data.created_at,
      };
    }

    return null; // customer — no extra profile needed
  } catch (err: any) {
    logger.warn(`fetchReporterProfile failed for ${reporterRole} ${userId}:`, err.message);
    return null;
  }
}

// ── Dispute management ────────────────────────────────────────────────────────

export class SupportAdminService {

  // ── Disputes ────────────────────────────────────────────────────────────────

  /** List all disputes with filters — for the admin "Support and Moderation" dashboard */
  async listDisputes(params: {
    status?:    DisputeStatus;
    priority?:  Priority;
    issueType?: string;
    search?:    string;
    page:       number;
    limit:      number;
  }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('disputes')
      .select(`
        id, customer_id, issue_type, title, description,
        status, priority, photo_urls, reference_id, reference_type,
        assigned_to, resolved_at, resolution_note, reporter_role,
        created_at, updated_at
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (params.status)    query = query.eq('status', params.status);
    if (params.priority)  query = query.eq('priority', params.priority);
    if (params.issueType) query = query.eq('issue_type', params.issueType);
    if (params.search) {
      query = query.or(
        `title.ilike.%${params.search}%,description.ilike.%${params.search}%`
      );
    }

    const { data, error, count } = await query;
    if (error) throw new Error(`Failed to list disputes: ${error.message}`);

    // Enrich with customer info
    const customerIds = [...new Set((data ?? []).map((d: any) => d.customer_id))];
    let customerMap: Record<string, any> = {};
    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, phone')
        .in('id', customerIds);
      (users ?? []).forEach((u: any) => { customerMap[u.id] = u; });
    }

    const disputes = (data ?? []).map((d: any) => ({
      ...d,
      customer: customerMap[d.customer_id] ?? null,
    }));

    return {
      disputes,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    };
  }

  /** Get status counts for tab badges */
  async getDisputeStatusCounts() {
    const { data, error } = await supabase
      .from('disputes')
      .select('status');

    if (error) throw new Error(`Failed to get status counts: ${error.message}`);

    const counts = { all: 0, pending: 0, in_progress: 0, resolved: 0 };
    (data ?? []).forEach((d: any) => {
      counts.all++;
      if (d.status in counts) counts[d.status as DisputeStatus]++;
    });

    return counts;
  }

  /** Get a single dispute with full chat thread, customer info, and role-specific profile */
  async getDisputeDetail(disputeId: string) {
    const { data: dispute, error } = await supabase
      .from('disputes')
      .select('*')
      .eq('id', disputeId)
      .single();

    if (error || !dispute) throw new Error('Dispute not found');

    // Base user info
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, active_role')
      .eq('id', dispute.customer_id)
      .single();

    // Role-specific profile (driver details, vendor details, or null for customer)
    const reporterProfile = await fetchReporterProfile(
      dispute.customer_id,
      dispute.reporter_role ?? user?.active_role ?? 'customer'
    );

    // Chat thread
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

      // Mark customer messages as read by admin
      await supabase
        .from('support_messages')
        .update({ is_read: true })
        .eq('chat_id', chat.id)
        .eq('sender_type', 'customer')
        .eq('is_read', false);
    }

    return {
      dispute,
      reporter: {
        ...user,
        reporter_role:   dispute.reporter_role ?? 'customer',
        profile:         reporterProfile,
      },
      chatId:   chat?.id ?? null,
      messages,
    };
  }

  /** Update dispute status (pending → in_progress → resolved) */
  async updateDisputeStatus(params: {
    disputeId:      string;
    status:         DisputeStatus;
    adminId:        string;
    resolutionNote?: string;
  }) {
    const updatePayload: any = {
      status:      params.status,
      assigned_to: params.adminId,
      updated_at:  new Date().toISOString(),
    };

    if (params.status === 'resolved') {
      updatePayload.resolved_at      = new Date().toISOString();
      updatePayload.resolution_note  = params.resolutionNote ?? null;
    }

    const { data: dispute, error } = await supabase
      .from('disputes')
      .update(updatePayload)
      .eq('id', params.disputeId)
      .select('id, customer_id, status')
      .single();

    if (error || !dispute) throw new Error('Dispute not found or update failed');

    // Push real-time event to customer via core-logistics Socket.IO
    await emitToCustomer('dispute-status', {
      customer_id:     dispute.customer_id,
      dispute_id:      dispute.id,
      status:          dispute.status,
      resolution_note: params.resolutionNote,
    });

    return dispute;
  }

  /** Admin sends a reply message inside a dispute thread */
  async sendDisputeMessage(params: {
    disputeId:     string;
    adminId:       string;
    message?:      string;
    attachmentUrl?: string;
  }) {
    // Fetch dispute to get customer_id and chat_id
    const { data: dispute, error: dErr } = await supabase
      .from('disputes')
      .select('id, customer_id, status')
      .eq('id', params.disputeId)
      .single();

    if (dErr || !dispute) throw new Error('Dispute not found');
    if (dispute.status === 'resolved') throw new Error('Cannot reply to a resolved dispute');

    const { data: chat, error: cErr } = await supabase
      .from('support_chats')
      .select('id')
      .eq('dispute_id', params.disputeId)
      .single();

    if (cErr || !chat) throw new Error('Chat thread not found');

    const { data: msg, error: mErr } = await supabase
      .from('support_messages')
      .insert({
        chat_id:        chat.id,
        sender_id:      params.adminId,
        sender_type:    'admin',
        message:        params.message ?? null,
        attachment_url: params.attachmentUrl ?? null,
      })
      .select()
      .single();

    if (mErr) throw new Error(`Failed to send message: ${mErr.message}`);

    // Push real-time event to customer
    await emitToCustomer('message', {
      customer_id: dispute.customer_id,
      chat_id:     chat.id,
      chat_type:   'dispute',
      dispute_id:  params.disputeId,
      message: {
        id:             msg.id,
        senderType:     'admin',
        message:        msg.message,
        attachmentUrl:  msg.attachment_url,
        createdAt:      msg.created_at,
      },
    });

    return { message: msg, chatId: chat.id };
  }

  // ── General Live Chat ────────────────────────────────────────────────────

  /** List all open general support chat sessions for the admin inbox */
  async listGeneralChats(params: { page: number; limit: number }) {
    const { page, limit } = params;
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from('support_chats')
      .select('id, customer_id, is_open, reporter_role, created_at, updated_at', { count: 'exact' })
      .eq('type', 'general')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to list chats: ${error.message}`);

    const customerIds = [...new Set((data ?? []).map((c: any) => c.customer_id))];
    let customerMap: Record<string, any> = {};
    if (customerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, phone')
        .in('id', customerIds);
      (users ?? []).forEach((u: any) => { customerMap[u.id] = u; });
    }

    const chats = (data ?? []).map((c: any) => ({
      ...c,
      customer: customerMap[c.customer_id] ?? null,
    }));

    return {
      chats,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    };
  }

  /** Get messages in a general chat (admin view) — includes reporter profile */
  async getGeneralChatMessages(chatId: string) {
    const { data: chat, error: cErr } = await supabase
      .from('support_chats')
      .select('id, customer_id, reporter_role')
      .eq('id', chatId)
      .eq('type', 'general')
      .single();

    if (cErr || !chat) throw new Error('Chat not found');

    // Base user info
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, active_role')
      .eq('id', chat.customer_id)
      .single();

    // Role-specific profile
    const reporterRole = chat.reporter_role ?? user?.active_role ?? 'customer';
    const reporterProfile = await fetchReporterProfile(chat.customer_id, reporterRole);

    const { data: messages } = await supabase
      .from('support_messages')
      .select('id, sender_id, sender_type, message, attachment_url, is_read, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    // Mark customer messages as read
    await supabase
      .from('support_messages')
      .update({ is_read: true })
      .eq('chat_id', chatId)
      .eq('sender_type', 'customer')
      .eq('is_read', false);

    return {
      chatId,
      reporter: {
        ...user,
        reporter_role: reporterRole,
        profile:       reporterProfile,
      },
      messages: messages ?? [],
    };
  }

  /** Admin replies in a general chat */
  async sendGeneralChatMessage(params: {
    chatId:        string;
    adminId:       string;
    message?:      string;
    attachmentUrl?: string;
  }) {
    const { data: chat, error: cErr } = await supabase
      .from('support_chats')
      .select('id, customer_id')
      .eq('id', params.chatId)
      .eq('type', 'general')
      .single();

    if (cErr || !chat) throw new Error('Chat not found');

    const { data: msg, error: mErr } = await supabase
      .from('support_messages')
      .insert({
        chat_id:        params.chatId,
        sender_id:      params.adminId,
        sender_type:    'admin',
        message:        params.message ?? null,
        attachment_url: params.attachmentUrl ?? null,
      })
      .select()
      .single();

    if (mErr) throw new Error(`Failed to send message: ${mErr.message}`);

    // Push real-time event to customer
    await emitToCustomer('message', {
      customer_id: chat.customer_id,
      chat_id:     params.chatId,
      chat_type:   'general',
      message: {
        id:            msg.id,
        senderType:    'admin',
        message:       msg.message,
        attachmentUrl: msg.attachment_url,
        createdAt:     msg.created_at,
      },
    });

    return msg;
  }

  // ── FAQ management ───────────────────────────────────────────────────────

  async listFaqCategories() {
    const { data, error } = await supabase
      .from('faq_categories')
      .select('*')
      .order('display_order', { ascending: true });
    if (error) throw new Error(`Failed to list FAQ categories: ${error.message}`);
    return data ?? [];
  }

  async createFaqCategory(params: { name: string; slug: string; displayOrder?: number }) {
    const { data, error } = await supabase
      .from('faq_categories')
      .insert({ name: params.name, slug: params.slug, display_order: params.displayOrder ?? 0 })
      .select()
      .single();
    if (error) throw new Error(`Failed to create FAQ category: ${error.message}`);
    return data;
  }

  async listFaqArticles(params: { categoryId?: string; includeInactive?: boolean }) {
    let query = supabase
      .from('faq_articles')
      .select(`*, category:faq_categories(id, name, slug)`)
      .order('display_order', { ascending: true });

    if (!params.includeInactive) query = query.eq('is_active', true);
    if (params.categoryId)       query = query.eq('category_id', params.categoryId);

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list FAQ articles: ${error.message}`);
    return data ?? [];
  }

  async createFaqArticle(params: {
    categoryId:   string;
    question:     string;
    answer:       string;
    displayOrder?: number;
    adminId:      string;
  }) {
    const { data, error } = await supabase
      .from('faq_articles')
      .insert({
        category_id:   params.categoryId,
        question:      params.question,
        answer:        params.answer,
        display_order: params.displayOrder ?? 0,
        created_by:    params.adminId,
        updated_by:    params.adminId,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create FAQ article: ${error.message}`);
    return data;
  }

  async updateFaqArticle(params: {
    articleId:    string;
    question?:    string;
    answer?:      string;
    categoryId?:  string;
    displayOrder?: number;
    isActive?:    boolean;
    adminId:      string;
  }) {
    const updatePayload: any = { updated_by: params.adminId, updated_at: new Date().toISOString() };
    if (params.question     !== undefined) updatePayload.question      = params.question;
    if (params.answer       !== undefined) updatePayload.answer        = params.answer;
    if (params.categoryId   !== undefined) updatePayload.category_id   = params.categoryId;
    if (params.displayOrder !== undefined) updatePayload.display_order = params.displayOrder;
    if (params.isActive     !== undefined) updatePayload.is_active     = params.isActive;

    const { data, error } = await supabase
      .from('faq_articles')
      .update(updatePayload)
      .eq('id', params.articleId)
      .select()
      .single();
    if (error) throw new Error(`Failed to update FAQ article: ${error.message}`);
    return data;
  }

  async deleteFaqArticle(articleId: string, adminId: string) {
    // Soft delete — set is_active = false
    return this.updateFaqArticle({ articleId, isActive: false, adminId });
  }
}
