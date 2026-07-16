import { supabase } from '../config/database';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PromoStoredStatus = 'scheduled' | 'paused' | 'ended' | 'deactivated';
export type PromoEffectiveStatus = 'scheduled' | 'active' | 'paused' | 'ended' | 'deactivated';

export interface CreatePromoInput {
  name: string;
  promo_amount: number;
  total_budget_cap: number;
  starts_at: string;  // ISO date string
  ends_at: string;    // ISO date string
  created_by: string; // admin user id
}

export interface UpdatePromoInput {
  name?: string;
  promo_amount?: number;
  total_budget_cap?: number;
  starts_at?: string;
  ends_at?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the effective (display) status of a promo from its stored status + dates + budget.
 *
 * Stored status captures admin overrides (pause / end / deactivate).
 * Effective status is what the frontend shows and what the auth-service queries on.
 *
 *  stored=scheduled + now < starts_at              → 'scheduled'
 *  stored=scheduled + starts_at <= now <= ends_at  → 'active'   (auto-started)
 *  stored=scheduled + now > ends_at                → 'ended'    (auto-ended)
 *  stored=scheduled + budget exhausted             → 'ended'    (budget cap hit)
 *  stored=paused                                   → 'paused'
 *  stored=ended                                    → 'ended'
 *  stored=deactivated                              → 'deactivated'
 */
function computeEffectiveStatus(
  storedStatus: PromoStoredStatus,
  startsAt: string,
  endsAt: string,
  promoAmount: number,
  remainingBudget: number
): PromoEffectiveStatus {
  // Admin overrides always win
  if (storedStatus === 'paused')       return 'paused';
  if (storedStatus === 'ended')        return 'ended';
  if (storedStatus === 'deactivated')  return 'deactivated';

  const now = new Date();
  const start = new Date(startsAt);
  const end   = new Date(endsAt);

  if (now > end)             return 'ended';
  if (remainingBudget < promoAmount) return 'ended';
  if (now >= start)          return 'active';
  return 'scheduled';
}

function enrichPromo(p: Record<string, any>, disbursedAmount: number) {
  const promoAmount    = parseFloat(p.promo_amount);
  const totalBudget    = parseFloat(p.total_budget_cap);
  const remaining      = Math.max(0, totalBudget - disbursedAmount);
  const effectiveStatus = computeEffectiveStatus(
    p.status as PromoStoredStatus,
    p.starts_at,
    p.ends_at,
    promoAmount,
    remaining
  );

  return {
    ...p,
    promo_amount:      promoAmount,
    total_budget_cap:  totalBudget,
    disbursed_amount:  disbursedAmount,
    remaining_budget:  remaining,
    effective_status:  effectiveStatus,  // what the frontend uses for badge/buttons
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class PromoAdminService {

  /**
   * GET /api/admin/promos
   * Paginated list of all signup promo campaigns.
   *
   * Query params:
   *   status - scheduled | active | paused | ended | deactivated (filters by effective_status)
   */
  static async getAll(filters: {
    status?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase
      .from('signup_promos')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch promos: ${error.message}`);

    const rows = data ?? [];

    // Batch-fetch disbursed amounts
    const promoIds = rows.map(r => r.id);
    const disbursedMap = new Map<string, number>();

    if (promoIds.length > 0) {
      const { data: claims } = await supabase
        .from('promo_signup_claims')
        .select('promo_id, amount')
        .in('promo_id', promoIds);

      for (const c of claims ?? []) {
        disbursedMap.set(c.promo_id, (disbursedMap.get(c.promo_id) ?? 0) + parseFloat(c.amount));
      }
    }

    let promos = rows.map(p => enrichPromo(p, disbursedMap.get(p.id) ?? 0));

    // Apply effective_status filter after enrichment
    if (filters.status && filters.status !== 'all') {
      promos = promos.filter(p => p.effective_status === filters.status);
    }

    return {
      promos,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    };
  }

  /**
   * GET /api/admin/promos/:promoId
   * Single promo detail with claim statistics.
   */
  static async getById(promoId: string) {
    const { data: promo, error } = await supabase
      .from('signup_promos')
      .select('*')
      .eq('id', promoId)
      .single();

    if (error || !promo) return null;

    const { data: claims, count: claimsCount } = await supabase
      .from('promo_signup_claims')
      .select('amount', { count: 'exact' })
      .eq('promo_id', promoId);

    const disbursedAmount = (claims ?? []).reduce(
      (sum, c) => sum + parseFloat(c.amount), 0
    );

    return enrichPromo({ ...promo, claims_count: claimsCount ?? 0 }, disbursedAmount);
  }

  /**
   * POST /api/admin/promos
   * Create a new signup promo campaign.
   * Starts as 'scheduled' — auto-activates when starts_at is reached.
   */
  static async create(input: CreatePromoInput) {
    const { name, promo_amount, total_budget_cap, starts_at, ends_at, created_by } = input;

    if (!name?.trim())                                    throw new Error('Promo name is required');
    if (!promo_amount || promo_amount <= 0)               throw new Error('promo_amount must be positive');
    if (!total_budget_cap || total_budget_cap <= 0)       throw new Error('total_budget_cap must be positive');
    if (total_budget_cap < promo_amount)                  throw new Error('total_budget_cap must be >= promo_amount');
    if (!starts_at || !ends_at)                           throw new Error('starts_at and ends_at are required');
    if (new Date(ends_at) <= new Date(starts_at))         throw new Error('ends_at must be after starts_at');

    // Check no other scheduled/active/paused promo overlaps this date range
    // (only one promo can be effectively active at a time)
    const { data: overlapping } = await supabase
      .from('signup_promos')
      .select('id, name, starts_at, ends_at, status')
      .not('status', 'in', '("ended","deactivated")')
      .lt('starts_at', ends_at)
      .gt('ends_at', starts_at);

    if (overlapping && overlapping.length > 0) {
      const conflict = overlapping[0] as Record<string, any>;
      throw new Error(
        `Date range overlaps with existing promo "${conflict.name}" (${conflict.starts_at} → ${conflict.ends_at}). Only one promo can run at a time.`
      );
    }

    const { data, error } = await supabase
      .from('signup_promos')
      .insert({
        name:             name.trim(),
        promo_amount,
        total_budget_cap,
        starts_at,
        ends_at,
        status:           'scheduled',  // auto-activates when starts_at arrives
        is_active:        false,        // legacy field kept for backward compat
        claims_count:     0,
        created_by,
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create promo: ${error.message}`);

    logger.info('Admin created signup promo', {
      promoId: data.id, name, promo_amount, starts_at, ends_at, created_by,
    });

    return enrichPromo(data, 0);
  }

  /**
   * PATCH /api/admin/promos/:promoId
   * Update promo metadata.
   * Allowed when: scheduled or paused (not ended or deactivated).
   */
  static async update(promoId: string, updates: UpdatePromoInput, adminId: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('signup_promos')
      .select('id, status, starts_at, ends_at, promo_amount, total_budget_cap')
      .eq('id', promoId)
      .single();

    if (fetchError || !existing) throw new Error('Promo not found');

    const effectiveStatus = computeEffectiveStatus(
      existing.status,
      existing.starts_at,
      existing.ends_at,
      parseFloat(existing.promo_amount),
      Infinity  // use Infinity so budget doesn't interfere with update guard
    );

    if (effectiveStatus === 'active') {
      throw new Error('Cannot edit a running promo. Pause it first.');
    }
    if (effectiveStatus === 'ended' || effectiveStatus === 'deactivated') {
      throw new Error(`Cannot edit a promo with status: ${effectiveStatus}`);
    }

    const newPromoAmt = updates.promo_amount    ?? parseFloat(existing.promo_amount);
    const newBudget   = updates.total_budget_cap ?? parseFloat(existing.total_budget_cap);
    if (newBudget < newPromoAmt) throw new Error('total_budget_cap must be >= promo_amount');

    const newStart = updates.starts_at ?? existing.starts_at;
    const newEnd   = updates.ends_at   ?? existing.ends_at;
    if (new Date(newEnd) <= new Date(newStart)) throw new Error('ends_at must be after starts_at');

    const { data, error } = await supabase
      .from('signup_promos')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', promoId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update promo: ${error.message}`);

    logger.info('Admin updated signup promo', { promoId, adminId, updates });
    return enrichPromo(data, 0);
  }

  /**
   * PATCH /api/admin/promos/:promoId/pause
   * Temporarily stop an actively running promo.
   * New signups during the pause do not receive the credit.
   * Can be resumed. stored_status: scheduled → paused
   */
  static async pause(promoId: string, adminId: string) {
    const { data: existing, error } = await supabase
      .from('signup_promos')
      .select('id, status, starts_at, ends_at, promo_amount, total_budget_cap')
      .eq('id', promoId)
      .single();

    if (error || !existing) throw new Error('Promo not found');

    const disbursed = parseFloat(existing.promo_amount) * ((existing as any).claims_count ?? 0);
    const remaining = parseFloat(existing.total_budget_cap) - disbursed;
    const effectiveStatus = computeEffectiveStatus(
      existing.status, existing.starts_at, existing.ends_at,
      parseFloat(existing.promo_amount), remaining
    );

    if (effectiveStatus !== 'active') {
      throw new Error(`Only an active promo can be paused. Current status: ${effectiveStatus}`);
    }

    const { data, error: updateError } = await supabase
      .from('signup_promos')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', promoId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to pause promo: ${updateError.message}`);

    logger.info('Admin paused signup promo', { promoId, adminId });
    return enrichPromo(data, disbursed);
  }

  /**
   * PATCH /api/admin/promos/:promoId/resume
   * Resume a paused promo. Sets stored_status back to 'scheduled'
   * so the date window makes it active again automatically.
   */
  static async resume(promoId: string, adminId: string) {
    const { data: existing, error } = await supabase
      .from('signup_promos')
      .select('id, status, starts_at, ends_at, promo_amount, total_budget_cap, claims_count')
      .eq('id', promoId)
      .single();

    if (error || !existing) throw new Error('Promo not found');
    if (existing.status !== 'paused') throw new Error('Only a paused promo can be resumed');
    if (new Date(existing.ends_at) < new Date()) throw new Error('Cannot resume an expired promo');

    const { data, error: updateError } = await supabase
      .from('signup_promos')
      .update({ status: 'scheduled', updated_at: new Date().toISOString() })
      .eq('id', promoId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to resume promo: ${updateError.message}`);

    const disbursed = parseFloat(existing.promo_amount) * (existing.claims_count ?? 0);
    logger.info('Admin resumed signup promo', { promoId, adminId });
    return enrichPromo(data, disbursed);
  }

  /**
   * PATCH /api/admin/promos/:promoId/end
   * Permanently end a promo. Cannot be undone or resumed.
   * Valid from: active, paused, scheduled.
   */
  static async end(promoId: string, adminId: string) {
    const { data: existing, error } = await supabase
      .from('signup_promos')
      .select('id, status, claims_count, promo_amount')
      .eq('id', promoId)
      .single();

    if (error || !existing) throw new Error('Promo not found');
    if (existing.status === 'ended')       throw new Error('Promo is already ended');
    if (existing.status === 'deactivated') throw new Error('Promo is deactivated, not active');

    const { data, error: updateError } = await supabase
      .from('signup_promos')
      .update({ status: 'ended', updated_at: new Date().toISOString() })
      .eq('id', promoId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to end promo: ${updateError.message}`);

    const disbursed = parseFloat(existing.promo_amount) * (existing.claims_count ?? 0);
    logger.warn('Admin force-ended signup promo', { promoId, adminId });
    return enrichPromo(data, disbursed);
  }

  /**
   * PATCH /api/admin/promos/:promoId/activate
   * Manually activate a scheduled promo immediately — goes live right now
   * regardless of starts_at. Sets starts_at = now so computeEffectiveStatus
   * returns 'active' instantly.
   * Valid when stored status is 'scheduled'.
   */
  static async activate(promoId: string, adminId: string) {
    const { data: existing, error } = await supabase
      .from('signup_promos')
      .select('id, status, ends_at, promo_amount, claims_count')
      .eq('id', promoId)
      .single();

    if (error || !existing) throw new Error('Promo not found');
    if (existing.status !== 'scheduled') {
      throw new Error(`Only a scheduled promo can be manually activated. Current status: ${existing.status}`);
    }
    if (new Date(existing.ends_at) < new Date()) {
      throw new Error('Cannot activate an expired promo — the end date has already passed');
    }

    const now = new Date().toISOString();

    const { data, error: updateError } = await supabase
      .from('signup_promos')
      .update({ starts_at: now, updated_at: now })
      .eq('id', promoId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to activate promo: ${updateError.message}`);

    const disbursed = parseFloat(existing.promo_amount) * (existing.claims_count ?? 0);
    logger.info('Admin manually activated promo', { promoId, adminId });
    return enrichPromo(data, disbursed);
  }

  /**
   * PATCH /api/admin/promos/:promoId/reactivate
   * Restore a deactivated promo back to 'scheduled' so it can run again.
   * Only valid when status is 'deactivated' and ends_at is still in the future.
   */
  static async reactivate(promoId: string, adminId: string) {
    const { data: existing, error } = await supabase
      .from('signup_promos')
      .select('id, status, starts_at, ends_at, promo_amount, claims_count')
      .eq('id', promoId)
      .single();

    if (error || !existing) throw new Error('Promo not found');
    if (existing.status !== 'deactivated') throw new Error('Only a deactivated promo can be reactivated');
    if (new Date(existing.ends_at) < new Date()) throw new Error('Cannot reactivate an expired promo — the end date has already passed');

    const { data, error: updateError } = await supabase
      .from('signup_promos')
      .update({ status: 'scheduled', updated_at: new Date().toISOString() })
      .eq('id', promoId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to reactivate promo: ${updateError.message}`);

    const disbursed = parseFloat(existing.promo_amount) * (existing.claims_count ?? 0);
    logger.info('Admin reactivated deactivated promo', { promoId, adminId });
    return enrichPromo(data, disbursed);
  }

  /**
   * PATCH /api/admin/promos/:promoId/deactivate
   * Cancel a promo that never actually ran (zero claims).
   * Valid when stored status is 'scheduled' regardless of whether starts_at has passed,
   * as long as no claims have been made against it.
   */
  static async deactivate(promoId: string, adminId: string) {
    const { data: existing, error } = await supabase
      .from('signup_promos')
      .select('id, status, starts_at, ends_at, promo_amount, total_budget_cap, claims_count')
      .eq('id', promoId)
      .single();

    if (error || !existing) throw new Error('Promo not found');

    // Only allow deactivating if the stored status is 'scheduled'
    // (i.e. admin never explicitly paused/ended it) and no claims were made.
    // This covers both future-scheduled AND past-date promos that were never used.
    if (existing.status !== 'scheduled') {
      throw new Error(
        `Cannot deactivate a promo with status: ${existing.status}. Use 'pause' or 'end' instead.`
      );
    }

    if (Number(existing.claims_count ?? 0) > 0) {
      throw new Error(
        `Cannot deactivate a promo that already has ${existing.claims_count} claim(s). Use 'end' to stop it instead.`
      );
    }

    const { data, error: updateError } = await supabase
      .from('signup_promos')
      .update({ status: 'deactivated', updated_at: new Date().toISOString() })
      .eq('id', promoId)
      .select()
      .single();

    if (updateError) throw new Error(`Failed to deactivate promo: ${updateError.message}`);

    logger.info('Admin deactivated scheduled promo', { promoId, adminId });
    return enrichPromo(data, 0);
  }

  /**
   * DELETE /api/admin/promos/:promoId
   * Hard-delete a promo. Allowed for any status.
   * If the promo has claims, those claim records are also deleted (cascade).
   */
  static async delete(promoId: string, adminId: string) {
    const { data: existing, error } = await supabase
      .from('signup_promos')
      .select('id, status, name, claims_count')
      .eq('id', promoId)
      .single();

    if (error || !existing) throw new Error('Promo not found');

    const { error: deleteError } = await supabase
      .from('signup_promos')
      .delete()
      .eq('id', promoId);

    if (deleteError) throw new Error(`Failed to delete promo: ${deleteError.message}`);

    logger.warn('Admin deleted signup promo', { promoId, adminId, status: existing.status, name: existing.name });
    return { deleted: true };
  }

  /**
   * GET /api/admin/promos/:promoId/claims
   * Paginated list of users who claimed a specific promo.
   */
  static async getClaims(promoId: string, filters: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const { data: claims, count, error } = await supabase
      .from('promo_signup_claims')
      .select('id, user_id, amount, phone_hash, device_id, ip_address, claimed_at', { count: 'exact' })
      .eq('promo_id', promoId)
      .order('claimed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch claims: ${error.message}`);

    const rows = claims ?? [];
    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const userMap = new Map<string, { first_name: string; last_name: string; email: string; phone: string }>();

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, phone')
        .in('id', userIds);
      for (const u of users ?? []) userMap.set(u.id, u);
    }

    const formatted = rows.map((c, idx) => {
      const user = userMap.get(c.user_id);
      return {
        sn:       offset + idx + 1,
        id:       c.id,
        user:     user
          ? { id: c.user_id, name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(), email: user.email, phone: user.phone }
          : { id: c.user_id, name: 'Unknown', email: null, phone: null },
        amount:    parseFloat(c.amount),
        claimedAt: c.claimed_at,
      };
    });

    return {
      claims: formatted,
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    };
  }

  /**
   * GET /api/admin/promos/active
   * Returns the currently effective-active promo (if any).
   * Used by auth-service to decide whether to award a credit on signup.
   * No DB status filter needed — uses date window + stored_status exclusions.
   */
  static async getActivePromo() {
    const now = new Date().toISOString();

    // Find promos that are within date range and not admin-overridden to stop
    const { data, error } = await supabase
      .from('signup_promos')
      .select('*')
      .not('status', 'in', '("ended","deactivated","paused")')
      .lte('starts_at', now)
      .gt('ends_at', now)
      .order('starts_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.error('getActivePromo error', { error: error.message });
      return null;
    }

    if (!data) return null;

    const promoAmount = parseFloat(data.promo_amount);
    const disbursed   = promoAmount * (data.claims_count ?? 0);
    const remaining   = parseFloat(data.total_budget_cap) - disbursed;

    // Budget exhausted
    if (remaining < promoAmount) return null;

    return {
      id:           data.id,
      promo_amount: promoAmount,
      ends_at:      data.ends_at,
    };
  }
}
