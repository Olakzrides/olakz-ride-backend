import axios from 'axios';
import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export type BroadcastTargetRole = 'all' | 'customer' | 'driver' | 'vendor';

export interface SendBroadcastInput {
  title:      string;
  body:       string;
  targetRole: BroadcastTargetRole;
  data?:      Record<string, string>;
  adminId:    string;
}

const CORE_LOGISTICS_URL = () =>
  process.env.CORE_LOGISTICS_URL || 'http://localhost:3001';

const INTERNAL_KEY = () =>
  process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';

function internalHeaders() {
  return {
    'Content-Type':    'application/json',
    'x-internal-api-key': INTERNAL_KEY(),
  };
}

export class BroadcastService {

  /**
   * Send a broadcast notification.
   *
   * Flow:
   *  1. Create a pending record in admin_broadcasts
   *  2. Call core-logistics internal API to send via FCM topic
   *  3. Call core-logistics internal API to create inbox entries for all targeted users
   *  4. Update the broadcast record with results (completed / failed)
   */
  static async send(input: SendBroadcastInput) {
    const { title, body, targetRole, data = {}, adminId } = input;

    // ── Validate ─────────────────────────────────────────────────────────────
    if (!title?.trim()) throw new Error('title is required');
    if (!body?.trim())  throw new Error('body is required');

    const validRoles: BroadcastTargetRole[] = ['all', 'customer', 'driver', 'vendor'];
    if (!validRoles.includes(targetRole)) {
      throw new Error(`targetRole must be one of: ${validRoles.join(', ')}`);
    }

    // ── 1. Create pending broadcast record ────────────────────────────────────
    const { data: broadcast, error: createError } = await supabase
      .from('admin_broadcasts')
      .insert({
        title:         title.trim(),
        body:          body.trim(),
        target_role:   targetRole,
        data,
        sent_by:       adminId,
        status:        'sending',
        created_at:    new Date().toISOString(),
      })
      .select()
      .single();

    if (createError || !broadcast) {
      throw new Error(`Failed to create broadcast record: ${createError?.message}`);
    }

    const broadcastId = broadcast.id;

    try {
      // ── 2. Send FCM broadcast via core-logistics ──────────────────────────
      const fcmResponse = await axios.post(
        `${CORE_LOGISTICS_URL()}/api/internal/push/broadcast`,
        {
          broadcast_id: broadcastId,
          title:        title.trim(),
          body:         body.trim(),
          target_role:  targetRole,
          data,
        },
        { headers: internalHeaders(), timeout: 30000 }
      );

      const fcmResult = fcmResponse.data?.data ?? {};
      const fcmMessageId = fcmResult.fcm_message_id ?? null;

      // ── 3. Create inbox entries for all targeted users ────────────────────
      let devicesReached = 0;
      try {
        const inboxResponse = await axios.post(
          `${CORE_LOGISTICS_URL()}/api/internal/push/broadcast/inbox`,
          {
            broadcast_id: broadcastId,
            title:        title.trim(),
            body:         body.trim(),
            target_role:  targetRole,
            data,
          },
          { headers: internalHeaders(), timeout: 120000 }  // longer timeout for large user base
        );
        devicesReached = inboxResponse.data?.data?.inserted ?? 0;
      } catch (inboxErr: any) {
        // Non-fatal — FCM already delivered, inbox will be empty for this broadcast
        logger.error('Broadcast inbox creation failed (non-fatal)', {
          broadcastId, error: inboxErr.message,
        });
      }

      // ── 4. Mark broadcast as completed ────────────────────────────────────
      await supabase
        .from('admin_broadcasts')
        .update({
          status:          'completed',
          fcm_message_id:  fcmMessageId,
          devices_reached: devicesReached,
          completed_at:    new Date().toISOString(),
        })
        .eq('id', broadcastId);

      logger.info('Admin broadcast completed', {
        broadcastId, targetRole, adminId, devicesReached,
      });

      return {
        id:              broadcastId,
        title:           title.trim(),
        body:            body.trim(),
        target_role:     targetRole,
        status:          'completed',
        fcm_message_id:  fcmMessageId,
        devices_reached: devicesReached,
        created_at:      broadcast.created_at,
        completed_at:    new Date().toISOString(),
      };

    } catch (err: any) {
      // Mark as failed
      await supabase
        .from('admin_broadcasts')
        .update({
          status:        'failed',
          error_message: err.message,
          completed_at:  new Date().toISOString(),
        })
        .eq('id', broadcastId);

      logger.error('Admin broadcast failed', { broadcastId, error: err.message });
      throw new Error(`Broadcast failed: ${err.message}`);
    }
  }

  /**
   * GET paginated list of past broadcasts (admin history).
   */
  static async getAll(filters: {
    targetRole?: string;
    page?:  number;
    limit?: number;
  } = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('admin_broadcasts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.targetRole && filters.targetRole !== 'all') {
      query = query.eq('target_role', filters.targetRole);
    }

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch broadcasts: ${error.message}`);

    // Enrich with admin user name
    const adminIds = [...new Set((data ?? []).map(b => b.sent_by).filter(Boolean))];
    const adminMap = new Map<string, { first_name: string; last_name: string; email: string }>();

    if (adminIds.length > 0) {
      const { data: admins } = await supabase
        .from('users')
        .select('id, first_name, last_name, email')
        .in('id', adminIds);
      for (const a of admins ?? []) adminMap.set(a.id, a);
    }

    const broadcasts = (data ?? []).map(b => {
      const admin = adminMap.get(b.sent_by);
      return {
        ...b,
        sent_by_admin: admin
          ? { id: b.sent_by, name: `${admin.first_name ?? ''} ${admin.last_name ?? ''}`.trim(), email: admin.email }
          : { id: b.sent_by, name: 'Unknown', email: null },
      };
    });

    return {
      broadcasts,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    };
  }

  /**
   * PATCH — edit a broadcast (resend with corrected content).
   *
   * Flow:
   *  1. Update admin_broadcasts record with new title/body
   *  2. Delete all existing notification_history inbox rows for this broadcast
   *  3. Send a new FCM topic push with the corrected message
   *  4. Create new notification_history inbox rows with the corrected content
   */
  static async update(broadcastId: string, updates: {
    title?: string;
    body?:  string;
    data?:  Record<string, string>;
  }, adminId: string) {
    if (!updates.title?.trim() && !updates.body?.trim()) {
      throw new Error('At least one of title or body is required');
    }

    // Fetch existing broadcast
    const { data: existing, error: fetchError } = await supabase
      .from('admin_broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .single();

    if (fetchError || !existing) throw new Error('Broadcast not found');

    const newTitle = updates.title?.trim() ?? existing.title;
    const newBody  = updates.body?.trim()  ?? existing.body;
    const newData  = updates.data          ?? existing.data ?? {};
    const targetRole = existing.target_role as BroadcastTargetRole;

    // 1. Update the admin_broadcasts record
    const { error: updateError } = await supabase
      .from('admin_broadcasts')
      .update({
        title:      newTitle,
        body:       newBody,
        data:       newData,
        status:     'sending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', broadcastId);

    if (updateError) throw new Error(`Failed to update broadcast: ${updateError.message}`);

    try {
      // 2. Delete old inbox rows for this broadcast
      await supabase
        .from('notification_history')
        .delete()
        .eq('broadcast_id', broadcastId);

      // 3. Resend FCM push with corrected content
      const fcmResponse = await axios.post(
        `${CORE_LOGISTICS_URL()}/api/internal/push/broadcast`,
        {
          broadcast_id: broadcastId,
          title:        newTitle,
          body:         newBody,
          target_role:  targetRole,
          data:         newData,
        },
        { headers: internalHeaders(), timeout: 30000 }
      );

      const fcmResult      = fcmResponse.data?.data ?? {};
      const fcmMessageId   = fcmResult.fcm_message_id ?? null;

      // 4. Create new inbox entries with corrected content
      let devicesReached = 0;
      try {
        const inboxResponse = await axios.post(
          `${CORE_LOGISTICS_URL()}/api/internal/push/broadcast/inbox`,
          {
            broadcast_id: broadcastId,
            title:        newTitle,
            body:         newBody,
            target_role:  targetRole,
            data:         newData,
          },
          { headers: internalHeaders(), timeout: 120000 }
        );
        devicesReached = inboxResponse.data?.data?.inserted ?? 0;
      } catch (inboxErr: any) {
        logger.error('Broadcast update inbox creation failed (non-fatal)', {
          broadcastId, error: inboxErr.message,
        });
      }

      // 5. Mark completed
      await supabase
        .from('admin_broadcasts')
        .update({
          status:          'completed',
          fcm_message_id:  fcmMessageId,
          devices_reached: devicesReached,
          completed_at:    new Date().toISOString(),
        })
        .eq('id', broadcastId);

      logger.info('Admin broadcast updated + resent', {
        broadcastId, adminId, newTitle, devicesReached,
      });

      return await BroadcastService.getById(broadcastId);

    } catch (err: any) {
      await supabase
        .from('admin_broadcasts')
        .update({ status: 'failed', error_message: err.message })
        .eq('id', broadcastId);
      throw new Error(`Broadcast update failed: ${err.message}`);
    }
  }

  /**
   * DELETE — remove a broadcast completely.
   *
   * Flow:
   *  1. Delete all notification_history inbox rows for this broadcast
   *  2. Delete the admin_broadcasts record
   *
   * No resend — the notification simply disappears from all users' inboxes.
   * The FCM push already delivered to phones cannot be recalled (Firebase limitation).
   */
  static async remove(broadcastId: string, adminId: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('admin_broadcasts')
      .select('id, title')
      .eq('id', broadcastId)
      .single();

    if (fetchError || !existing) throw new Error('Broadcast not found');

    // 1. Delete all users' inbox rows
    await supabase
      .from('notification_history')
      .delete()
      .eq('broadcast_id', broadcastId);

    // 2. Delete the admin record
    const { error: deleteError } = await supabase
      .from('admin_broadcasts')
      .delete()
      .eq('id', broadcastId);

    if (deleteError) throw new Error(`Failed to delete broadcast: ${deleteError.message}`);

    logger.warn('Admin deleted broadcast', { broadcastId, adminId, title: existing.title });
    return { deleted: true, broadcastId };
  }

  /**
   * GET single broadcast by ID.
   */
  static async getById(broadcastId: string) {
    const { data, error } = await supabase
      .from('admin_broadcasts')
      .select('*')
      .eq('id', broadcastId)
      .single();

    if (error || !data) return null;

    const { data: adminUser } = await supabase
      .from('users')
      .select('first_name, last_name, email')
      .eq('id', data.sent_by)
      .single();

    return {
      ...data,
      sent_by_admin: adminUser
        ? {
            id:    data.sent_by,
            name:  `${adminUser.first_name ?? ''} ${adminUser.last_name ?? ''}`.trim(),
            email: adminUser.email,
          }
        : { id: data.sent_by, name: 'Unknown', email: null },
    };
  }
}
