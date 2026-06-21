import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export interface CreatePromoInput {
  name: string;
  promo_amount: number;
  total_budget_cap: number;
  starts_at: string;   // ISO date string
  ends_at: string;     // ISO date string
  created_by: string;  // admin user id
}

export interface UpdatePromoInput {
  name?: string;
  promo_amount?: number;
  total_budget_cap?: number;
  starts_at?: string;
  ends_at?: string;
}

export class PromoAdminService {

  /**
   * GET /api/admin/promos
   * Paginated list of all signup promo campaigns.
   */
  static async getAll(filters: {
    is_active?: boolean;
    page?: number;
    limit?: number;
  } = {}) {
    const { is_active, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('signup_promos')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (typeof is_active === 'boolean') {
      query = query.eq('is_active', is_active);
    }

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch promos: ${error.message}`);

    // Enrich with total amount disbursed and remaining budget
    const rows = data ?? [];
    const promoIds = rows.map(r => r.id);
    const disbursedMap = new Map<string, number>();

    if (promoIds.length > 0) {
      const { data: claims } = await supabase
        .from('promo_signup_claims')
        .select('promo_id, amount')
        .in('promo_id', promoIds);

      for (const c of claims ?? []) {
        const existing = disbursedMap.get(c.promo_id) ?? 0;
        disbursedMap.set(c.promo_id, existing + parseFloat(c.amount));
      }
    }

    const promos = rows.map(p => ({
      ...p,
      promo_amount:     parseFloat(p.promo_amount),
      total_budget_cap: parseFloat(p.total_budget_cap),
      disbursed_amount: disbursedMap.get(p.id) ?? 0,
      remaining_budget: Math.max(
        0,
        parseFloat(p.total_budget_cap) - (disbursedMap.get(p.id) ?? 0)
      ),
    }));

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

    // Claim stats
    const { data: claims, count: claimsCount } = await supabase
      .from('promo_signup_claims')
      .select('amount', { count: 'exact' })
      .eq('promo_id', promoId);

    const disbursedAmount = (claims ?? []).reduce(
      (sum, c) => sum + parseFloat(c.amount),
      0
    );

    return {
      ...promo,
      promo_amount:     parseFloat(promo.promo_amount),
      total_budget_cap: parseFloat(promo.total_budget_cap),
      claims_count:     claimsCount ?? 0,
      disbursed_amount: disbursedAmount,
      remaining_budget: Math.max(0, parseFloat(promo.total_budget_cap) - disbursedAmount),
    };
  }

  /**
   * POST /api/admin/promos
   * Create a new signup promo campaign.
   *
   * Business rules:
   * - starts_at must be before ends_at
   * - total_budget_cap must be >= promo_amount
   * - Only one promo can be active at a time (enforced by DB partial unique index)
   */
  static async create(input: CreatePromoInput) {
    const { name, promo_amount, total_budget_cap, starts_at, ends_at, created_by } = input;

    if (!name?.trim())                 throw new Error('Promo name is required');
    if (!promo_amount || promo_amount <= 0)          throw new Error('promo_amount must be positive');
    if (!total_budget_cap || total_budget_cap <= 0)  throw new Error('total_budget_cap must be positive');
    if (total_budget_cap < promo_amount)             throw new Error('total_budget_cap must be >= promo_amount');
    if (!starts_at || !ends_at)        throw new Error('starts_at and ends_at are required');
    if (new Date(ends_at) <= new Date(starts_at))   throw new Error('ends_at must be after starts_at');

    const { data, error } = await supabase
      .from('signup_promos')
      .insert({
        name:             name.trim(),
        promo_amount,
        total_budget_cap,
        starts_at,
        ends_at,
        is_active:        false,   // starts inactive; admin must activate explicitly
        claims_count:     0,
        created_by,
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create promo', { error: error.message, input });
      throw new Error(`Failed to create promo: ${error.message}`);
    }

    logger.info('Admin created signup promo', { promoId: data.id, name, promo_amount, created_by });
    return data;
  }

  /**
   * PATCH /api/admin/promos/:promoId
   * Update a promo's metadata (cannot update while active).
   */
  static async update(promoId: string, updates: UpdatePromoInput, adminId: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('signup_promos')
      .select('id, is_active, starts_at, ends_at, promo_amount, total_budget_cap')
      .eq('id', promoId)
      .single();

    if (fetchError || !existing) throw new Error('Promo not found');
    if (existing.is_active) throw new Error('Cannot update an active promo. Deactivate it first.');

    // Validate if provided
    const newPromoAmt = updates.promo_amount ?? parseFloat(existing.promo_amount);
    const newBudget   = updates.total_budget_cap ?? parseFloat(existing.total_budget_cap);
    if (newBudget < newPromoAmt) throw new Error('total_budget_cap must be >= promo_amount');

    const newStart = updates.starts_at ?? existing.starts_at;
    const newEnd   = updates.ends_at   ?? existing.ends_at;
    if (new Date(newEnd) <= new Date(newStart)) throw new Error('ends_at must be after starts_at');

    const { data, error } = await supabase
      .from('signup_promos')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', promoId)
      .select()
      .single();

    if (error) throw new Error(`Failed to update promo: ${error.message}`);

    logger.info('Admin updated signup promo', { promoId, adminId, updates });
    return data;
  }

  /**
   * PATCH /api/admin/promos/:promoId/activate
   * Activate a promo.
   * Enforced by DB: only one active promo at a time (partial unique index on is_active=true).
   */
  static async activate(promoId: string, adminId: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('signup_promos')
      .select('id, is_active, ends_at')
      .eq('id', promoId)
      .single();

    if (fetchError || !existing) throw new Error('Promo not found');
    if (existing.is_active) throw new Error('Promo is already active');
    if (new Date(existing.ends_at) < new Date()) throw new Error('Cannot activate an expired promo');

    const { data, error } = await supabase
      .from('signup_promos')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', promoId)
      .select()
      .single();

    if (error) {
      // DB constraint fires when another promo is already active
      if (error.message.includes('unique') || error.code === '23505') {
        throw new Error('Another promo is already active. Deactivate it before activating this one.');
      }
      throw new Error(`Failed to activate promo: ${error.message}`);
    }

    logger.info('Admin activated signup promo', { promoId, adminId });
    return data;
  }

  /**
   * PATCH /api/admin/promos/:promoId/deactivate
   * Deactivate a promo without deleting it.
   */
  static async deactivate(promoId: string, adminId: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('signup_promos')
      .select('id, is_active')
      .eq('id', promoId)
      .single();

    if (fetchError || !existing) throw new Error('Promo not found');
    if (!existing.is_active) throw new Error('Promo is already inactive');

    const { data, error } = await supabase
      .from('signup_promos')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', promoId)
      .select()
      .single();

    if (error) throw new Error(`Failed to deactivate promo: ${error.message}`);

    logger.info('Admin deactivated signup promo', { promoId, adminId });
    return data;
  }

  /**
   * DELETE /api/admin/promos/:promoId
   * Hard-delete a promo. Only allowed when inactive and no claims have been made.
   */
  static async delete(promoId: string, adminId: string) {
    const { data: existing, error: fetchError } = await supabase
      .from('signup_promos')
      .select('id, is_active, claims_count')
      .eq('id', promoId)
      .single();

    if (fetchError || !existing) throw new Error('Promo not found');
    if (existing.is_active)    throw new Error('Cannot delete an active promo. Deactivate it first.');
    if (existing.claims_count > 0) throw new Error('Cannot delete a promo that has been claimed. Deactivate it instead.');

    const { error } = await supabase
      .from('signup_promos')
      .delete()
      .eq('id', promoId);

    if (error) throw new Error(`Failed to delete promo: ${error.message}`);

    logger.warn('Admin deleted signup promo', { promoId, adminId });
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

    // Enrich with user names
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
        sn: offset + idx + 1,
        id: c.id,
        user: user
          ? {
              id:    c.user_id,
              name:  `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim(),
              email: user.email,
              phone: user.phone,
            }
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
   * Returns the currently active promo (if any), including budget remaining.
   * Used by the auth service to determine the promo amount for new signups.
   */
  static async getActivePromo() {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('signup_promos')
      .select('*')
      .eq('is_active', true)
      .lte('starts_at', now)
      .gt('ends_at', now)
      .maybeSingle();

    if (error) {
      logger.error('getActivePromo error', { error: error.message });
      return null;
    }

    if (!data) return null;

    const disbursed = parseFloat(data.promo_amount) * (data.claims_count ?? 0);
    const remaining = parseFloat(data.total_budget_cap) - disbursed;

    // Budget exhausted — treat as no active promo
    if (remaining < parseFloat(data.promo_amount)) return null;

    return {
      id:           data.id,
      promo_amount: parseFloat(data.promo_amount),
      ends_at:      data.ends_at,
    };
  }
}
