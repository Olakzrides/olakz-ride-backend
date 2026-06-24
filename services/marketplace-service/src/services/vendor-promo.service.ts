import { supabase } from '../config/database';
import logger from '../utils/logger';

export type VendorPromoStatus = 'scheduled' | 'active' | 'paused' | 'ended';

export interface CreateVendorPromoInput {
  vendorId:           string;
  storeId:            string;
  code:               string;
  discountPercent:    number;
  maxDiscountAmount?: number;
  minOrderAmount?:    number;
  totalUsesLimit?:    number;
  perUserLimit?:      number;
  startsAt:           string;
  endsAt:             string;
}

export interface UpdateVendorPromoInput {
  discountPercent?:   number;
  maxDiscountAmount?: number;
  minOrderAmount?:    number;
  totalUsesLimit?:    number;
  perUserLimit?:      number;
  startsAt?:          string;
  endsAt?:            string;
}

export interface ValidatePromoResult {
  valid:            boolean;
  promoId?:         string;
  discountAmount?:  number;
  discountPercent?: number;
  message:          string;
}

export class VendorPromoService {

  static async getAll(storeId: string, filters: {
    status?: string; page?: number; limit?: number;
  } = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('vendor_promos')
      .select('*', { count: 'exact' })
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const { data, count, error } = await query;
    if (error) throw new Error(`Failed to fetch promos: ${error.message}`);

    return {
      promos:     (data ?? []).map(p => this.format(p)),
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    };
  }

  static async getById(promoId: string, vendorId: string) {
    const { data, error } = await supabase
      .from('vendor_promos').select('*')
      .eq('id', promoId).eq('vendor_id', vendorId).single();
    if (error || !data) return null;
    return this.format(data);
  }

  static async create(input: CreateVendorPromoInput) {
    const {
      vendorId, storeId, code, discountPercent, maxDiscountAmount,
      minOrderAmount, totalUsesLimit, perUserLimit = 1, startsAt, endsAt,
    } = input;

    if (!code?.trim())                                throw new Error('Promo code is required');
    if (discountPercent <= 0 || discountPercent > 100) throw new Error('discount_percent must be between 1 and 100');
    if (!startsAt || !endsAt)                          throw new Error('starts_at and ends_at are required');
    if (new Date(endsAt) <= new Date(startsAt))        throw new Error('ends_at must be after starts_at');

    const upperCode = code.trim().toUpperCase();

    const { data: existing } = await supabase
      .from('vendor_promos').select('id')
      .eq('store_id', storeId).eq('code', upperCode).not('status', 'eq', 'ended').maybeSingle();
    if (existing) throw new Error(`Promo code "${upperCode}" already exists for this store.`);

    const initialStatus: VendorPromoStatus =
      new Date(startsAt) <= new Date() ? 'active' : 'scheduled';

    const { data, error } = await supabase
      .from('vendor_promos')
      .insert({
        vendor_id:           vendorId,
        store_id:            storeId,
        service_type:        'marketplace',
        code:                upperCode,
        discount_percent:    discountPercent,
        max_discount_amount: maxDiscountAmount ?? null,
        min_order_amount:    minOrderAmount ?? 0,
        total_uses_limit:    totalUsesLimit ?? null,
        per_user_limit:      perUserLimit,
        uses_count:          0,
        status:              initialStatus,
        starts_at:           startsAt,
        ends_at:             endsAt,
        created_at:          new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .select().single();

    if (error) throw new Error(`Failed to create promo: ${error.message}`);
    logger.info('Vendor created marketplace promo', { vendorId, promoId: data.id, code: upperCode, initialStatus });
    return this.format(data);
  }

  static async update(promoId: string, vendorId: string, updates: UpdateVendorPromoInput) {
    const { data: existing, error } = await supabase
      .from('vendor_promos').select('id, status, starts_at, ends_at')
      .eq('id', promoId).eq('vendor_id', vendorId).single();

    if (error || !existing) throw new Error('Promo not found');
    if (existing.status === 'active') throw new Error('Cannot edit a running promo. Pause it first.');
    if (existing.status === 'ended')  throw new Error('Cannot edit an ended promo.');

    if (updates.discountPercent !== undefined &&
        (updates.discountPercent <= 0 || updates.discountPercent > 100)) {
      throw new Error('discount_percent must be between 1 and 100');
    }
    const newStart = updates.startsAt ?? existing.starts_at;
    const newEnd   = updates.endsAt   ?? existing.ends_at;
    if (new Date(newEnd) <= new Date(newStart)) throw new Error('ends_at must be after starts_at');

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (updates.discountPercent   !== undefined) patch.discount_percent    = updates.discountPercent;
    if (updates.maxDiscountAmount !== undefined) patch.max_discount_amount = updates.maxDiscountAmount;
    if (updates.minOrderAmount    !== undefined) patch.min_order_amount    = updates.minOrderAmount;
    if (updates.totalUsesLimit    !== undefined) patch.total_uses_limit    = updates.totalUsesLimit;
    if (updates.perUserLimit      !== undefined) patch.per_user_limit      = updates.perUserLimit;
    if (updates.startsAt          !== undefined) patch.starts_at           = updates.startsAt;
    if (updates.endsAt            !== undefined) patch.ends_at             = updates.endsAt;

    const { data, error: updateError } = await supabase
      .from('vendor_promos').update(patch).eq('id', promoId).select().single();
    if (updateError) throw new Error(`Failed to update promo: ${updateError.message}`);
    return this.format(data);
  }

  static async pause(promoId: string, vendorId: string) {
    const { data: existing, error } = await supabase
      .from('vendor_promos').select('id, status').eq('id', promoId).eq('vendor_id', vendorId).single();
    if (error || !existing) throw new Error('Promo not found');
    if (existing.status !== 'active') throw new Error(`Only an active promo can be paused. Current status: ${existing.status}`);
    const { data, error: updateError } = await supabase
      .from('vendor_promos').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', promoId).select().single();
    if (updateError) throw new Error(`Failed to pause promo: ${updateError.message}`);
    return this.format(data);
  }

  static async resume(promoId: string, vendorId: string) {
    const { data: existing, error } = await supabase
      .from('vendor_promos').select('id, status, ends_at').eq('id', promoId).eq('vendor_id', vendorId).single();
    if (error || !existing) throw new Error('Promo not found');
    if (existing.status !== 'paused') throw new Error('Only a paused promo can be resumed');
    if (new Date(existing.ends_at) < new Date()) throw new Error('Cannot resume an expired promo');
    const { data, error: updateError } = await supabase
      .from('vendor_promos').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', promoId).select().single();
    if (updateError) throw new Error(`Failed to resume promo: ${updateError.message}`);
    return this.format(data);
  }

  static async end(promoId: string, vendorId: string) {
    const { data: existing, error } = await supabase
      .from('vendor_promos').select('id, status').eq('id', promoId).eq('vendor_id', vendorId).single();
    if (error || !existing) throw new Error('Promo not found');
    if (existing.status === 'ended') throw new Error('Promo is already ended');
    const { data, error: updateError } = await supabase
      .from('vendor_promos').update({ status: 'ended', updated_at: new Date().toISOString() }).eq('id', promoId).select().single();
    if (updateError) throw new Error(`Failed to end promo: ${updateError.message}`);
    return this.format(data);
  }

  static async delete(promoId: string, vendorId: string) {
    const { data: existing, error } = await supabase
      .from('vendor_promos').select('id, status, uses_count').eq('id', promoId).eq('vendor_id', vendorId).single();
    if (error || !existing) throw new Error('Promo not found');
    if ((existing.uses_count ?? 0) > 0) throw new Error('Cannot delete a promo that has been used. Use "end" instead.');
    if (existing.status === 'active') throw new Error('Cannot delete a running promo. End it first.');
    const { error: deleteError } = await supabase.from('vendor_promos').delete().eq('id', promoId);
    if (deleteError) throw new Error(`Failed to delete promo: ${deleteError.message}`);
    return { deleted: true };
  }

  static async validateCode(params: {
    code: string; storeId: string; customerId: string; subtotal: number;
  }): Promise<ValidatePromoResult> {
    const { code, storeId, customerId, subtotal } = params;
    const upperCode = code.trim().toUpperCase();

    const { data: promo, error } = await supabase
      .from('vendor_promos').select('*').eq('store_id', storeId).eq('code', upperCode).maybeSingle();

    if (error || !promo) return { valid: false, message: 'Invalid promo code.' };

    if (promo.status === 'scheduled') return { valid: false, message: `This promo hasn't started yet. It starts on ${new Date(promo.starts_at).toLocaleDateString('en-NG')}.` };
    if (promo.status === 'paused')    return { valid: false, message: 'This promo is currently paused by the vendor.' };
    if (promo.status === 'ended')     return { valid: false, message: 'This promo has ended.' };

    const minOrder = parseFloat(promo.min_order_amount ?? 0);
    if (subtotal < minOrder) {
      return { valid: false, message: `Minimum order of ₦${minOrder.toLocaleString('en-NG')} required to use this code.` };
    }

    const perUserLimit = promo.per_user_limit ?? 1;
    const { count: userUses } = await supabase
      .from('vendor_promo_uses').select('id', { count: 'exact', head: true })
      .eq('promo_id', promo.id).eq('user_id', customerId);

    if ((userUses ?? 0) >= perUserLimit) {
      return { valid: false, message: perUserLimit === 1 ? 'You have already used this promo code.' : `You have reached the maximum of ${perUserLimit} uses for this promo.` };
    }

    const percent        = parseFloat(promo.discount_percent);
    const rawDiscount    = (subtotal * percent) / 100;
    const maxCap         = promo.max_discount_amount ? parseFloat(promo.max_discount_amount) : null;
    const discountAmount = maxCap !== null ? Math.min(rawDiscount, maxCap) : rawDiscount;

    return {
      valid: true, promoId: promo.id,
      discountAmount: Math.round(discountAmount * 100) / 100, discountPercent: percent,
      message: `${percent}% off applied${maxCap ? ` (max ₦${maxCap.toLocaleString('en-NG')})` : ''}. You save ₦${discountAmount.toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`,
    };
  }

  static async recordUse(params: {
    promoId: string; userId: string; orderId: string; discountAmount: number;
  }): Promise<void> {
    try {
      await supabase.from('vendor_promo_uses').insert({
        promo_id:        params.promoId,
        user_id:         params.userId,
        order_id:        params.orderId,
        service_type:    'marketplace',
        discount_amount: params.discountAmount,
        used_at:         new Date().toISOString(),
      });
      await supabase.rpc('increment_vendor_promo_uses', { promo_id_param: params.promoId });
    } catch (err: any) {
      logger.error('Failed to record marketplace promo use (non-fatal)', { error: err.message, ...params });
    }
  }

  static async getUses(promoId: string, vendorId: string, filters: { page?: number; limit?: number } = {}) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    const { data: promo } = await supabase.from('vendor_promos').select('id').eq('id', promoId).eq('vendor_id', vendorId).single();
    if (!promo) throw new Error('Promo not found');

    const { data: uses, count, error } = await supabase
      .from('vendor_promo_uses').select('id, user_id, order_id, discount_amount, used_at', { count: 'exact' })
      .eq('promo_id', promoId).order('used_at', { ascending: false }).range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to fetch uses: ${error.message}`);

    const userIds = [...new Set((uses ?? []).map(u => u.user_id))];
    const userMap = new Map<string, { first_name: string; last_name: string }>();
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, first_name, last_name').in('id', userIds);
      for (const u of users ?? []) userMap.set(u.id, u);
    }

    return {
      uses: (uses ?? []).map((u, idx) => {
        const user = userMap.get(u.user_id);
        return {
          sn: offset + idx + 1, id: u.id,
          user: user ? { id: u.user_id, name: `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() } : { id: u.user_id, name: 'Unknown' },
          orderId: u.order_id, discountAmount: parseFloat(u.discount_amount), usedAt: u.used_at,
        };
      }),
      pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) },
    };
  }

  /**
   * Sync promo statuses — called on startup and every minute.
   */
  static async syncStatuses(): Promise<void> {
    const now = new Date().toISOString();

    await supabase.from('vendor_promos').update({ status: 'active', updated_at: now })
      .eq('status', 'scheduled').eq('service_type', 'marketplace').lte('starts_at', now).gt('ends_at', now);

    await supabase.from('vendor_promos').update({ status: 'ended', updated_at: now })
      .in('status', ['active', 'scheduled']).eq('service_type', 'marketplace').lte('ends_at', now);

    const { data: exhausted } = await supabase
      .from('vendor_promos').select('id, uses_count, total_uses_limit')
      .eq('status', 'active').eq('service_type', 'marketplace').not('total_uses_limit', 'is', null);

    const ids = (exhausted ?? []).filter(p => (p.uses_count ?? 0) >= (p.total_uses_limit ?? Infinity)).map(p => p.id);
    if (ids.length > 0) {
      await supabase.from('vendor_promos').update({ status: 'ended', updated_at: now }).in('id', ids);
    }
  }

  private static format(p: Record<string, any>): Record<string, any> {
    return {
      ...p,
      discount_percent:    parseFloat(p.discount_percent),
      max_discount_amount: p.max_discount_amount ? parseFloat(p.max_discount_amount) : null,
      min_order_amount:    parseFloat(p.min_order_amount ?? 0),
    };
  }
}
