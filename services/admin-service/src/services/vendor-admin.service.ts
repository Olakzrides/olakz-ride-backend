import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import axios from 'axios';

// ─── Registration step helpers ────────────────────────────────────────────────

/**
 * Determine how far along a vendor's registration is.
 * Step 1: Basic info submitted (business_name, business_type, email, phone)
 * Step 2: Documents submitted (at least one of nin_number, cac_document_url, logo_url)
 * Step 3: Submitted for review (verification_status = 'pending')
 */
function resolveRegistrationProgress(v: Record<string, unknown>) {
  const hasBasicInfo = !!(v.business_name && v.business_type && v.email && v.phone);
  const hasDocuments = !!(v.nin_number || v.cac_document_url || v.logo_url || v.profile_picture_url);
  const hasAddress   = !!(v.city || v.state || v.address);

  const steps = [
    {
      key:         'basic_info',
      label:       'Business Information',
      completed:   hasBasicInfo,
      fields:      { business_name: v.business_name ?? null, business_type: v.business_type ?? null, email: v.email ?? null, phone: v.phone ?? null, gender: v.gender ?? null },
    },
    {
      key:         'address',
      label:       'Address Details',
      completed:   hasAddress,
      fields:      { city: v.city ?? null, state: v.state ?? null, address: v.address ?? null },
    },
    {
      key:         'documents',
      label:       'Documents & Media',
      completed:   hasDocuments,
      fields:      { logo_url: v.logo_url ?? null, profile_picture_url: v.profile_picture_url ?? null, nin_number: v.nin_number ? '***provided***' : null, cac_document_url: v.cac_document_url ?? null, store_images: v.store_images ?? null },
    },
  ];

  const completedCount = steps.filter(s => s.completed).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  const currentStep = !hasBasicInfo ? 'basic_info'
    : !hasAddress                   ? 'address'
    : !hasDocuments                 ? 'documents'
    : 'review';

  const currentStepLabel = steps.find(s => s.key === currentStep)?.label ?? 'Submitted for Review';

  return { steps, completedCount, progressPercent, currentStep, currentStepLabel };
}

export class VendorAdminService {
  static async getAll(filters: {
    status?: string;
    business_type?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, business_type, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('vendors')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('verification_status', status);
    if (business_type) query = query.eq('business_type', business_type);

    const { data: vendors, count, error } = await query;
    if (error) throw new Error(`Failed to get vendors: ${error.message}`);

    return { vendors: vendors || [], total: count || 0, page, limit };
  }

  static async approve(vendorId: string, adminId: string) {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .update({
        verification_status: 'approved',
        approved_by: adminId,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error || !vendor) throw new Error('Vendor not found');

    const v = vendor as Record<string, unknown>;

    // Auto-provision food_restaurants for restaurant-type vendors (non-blocking)
    if (v.business_type === 'restaurant') {
      const foodServiceUrl = process.env.FOOD_SERVICE_URL || 'http://localhost:3005';
      const internalKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
      axios.post(
        `${foodServiceUrl}/api/internal/vendor/provision`,
        {
          user_id: v.user_id,
          business_name: v.business_name,
          address: v.address || '',
          city: v.city,
          state: v.state,
          phone: v.phone,
          email: v.email,
          logo_url: v.logo_url,
        },
        { headers: { 'x-internal-api-key': internalKey }, timeout: 8000 }
      ).then(() => {
        logger.info('Restaurant provisioned for vendor', { userId: v.user_id });
      }).catch((err: unknown) => {
        logger.error('Failed to provision restaurant (non-fatal)', { error: err instanceof Error ? err.message : String(err) });
      });
    }

    // Auto-provision marketplace_stores for marketplace-type vendors (non-blocking)
    if (v.business_type === 'marketplace') {
      const marketplaceServiceUrl = process.env.MARKETPLACE_SERVICE_URL || 'http://localhost:3006';
      const internalKey = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';
      axios.post(
        `${marketplaceServiceUrl}/api/internal/marketplace/vendor/provision`,
        {
          owner_id: v.user_id,
          vendor_id: v.id,
          business_name: v.business_name,
          address: v.address || '',
          city: v.city,
          state: v.state,
          phone: v.phone,
          email: v.email,
          logo_url: v.logo_url,
        },
        { headers: { 'x-internal-api-key': internalKey }, timeout: 8000 }
      ).then(() => {
        logger.info('Marketplace store provisioned for vendor', { userId: v.user_id });
      }).catch((err: unknown) => {
        logger.error('Failed to provision marketplace store (non-fatal)', { error: err instanceof Error ? err.message : String(err) });
      });
    }

    return vendor;
  }

  static async reject(vendorId: string, adminId: string, reason: string) {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .update({
        verification_status: 'rejected',
        rejection_reason: reason,
        approved_by: adminId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vendorId)
      .select()
      .single();

    if (error || !vendor) throw new Error('Vendor not found');
    return vendor;
  }

  static async getById(vendorId: string) {
    // Try by vendor id first, then fall back to user_id
    let { data, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    // If not found by vendor id, try by user_id
    if (error || !data) {
      const fallback = await supabase
        .from('vendors')
        .select('*')
        .eq('user_id', vendorId)
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error || !data) return null;
    const v = data as Record<string, unknown>;

    // Fetch user details (name, phone, email, status)
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, status, email_verified')
      .eq('id', v.user_id as string)
      .single();

    const u = (user ?? {}) as Record<string, unknown>;

    // Wallet balance
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount')
      .eq('user_id', v.user_id as string)
      .eq('status', 'completed');

    const CREDIT_TYPES = new Set(['credit', 'topup', 'refund', 'tip_received', 'earning', 'tip_payment']);
    const DEBIT_TYPES  = new Set(['debit', 'hold', 'withdrawal', 'payment']);

    let walletBalance = 0;
    for (const tx of txns ?? []) {
      const t    = tx as Record<string, unknown>;
      const amt  = parseFloat(String(t.amount ?? 0));
      const type = String(t.transaction_type ?? '');
      if (CREDIT_TYPES.has(type))     walletBalance += amt;
      else if (DEBIT_TYPES.has(type)) walletBalance -= amt;
    }

    return {
      // Vendor record
      id: v.id,
      user_id: v.user_id,
      business_name: v.business_name,
      business_type: v.business_type,
      service_type: v.service_type,
      verification_status: v.verification_status,
      is_active: v.is_active,
      nin_number: v.nin_number,
      cac_document_url: v.cac_document_url,
      logo_url: v.logo_url,
      profile_picture_url: v.profile_picture_url,
      store_images: v.store_images,
      address: v.address,
      city: v.city,
      state: v.state,
      country: null,
      rejection_reason: v.rejection_reason,
      approved_by: v.approved_by,
      approved_at: v.approved_at,
      created_at: v.created_at,
      updated_at: v.updated_at,
      // User identity
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      email: u.email ?? v.email,
      phone: u.phone ?? v.phone,
      avatar_url: u.avatar_url ?? null,
      account_status: u.status ?? null,
      email_verified: u.email_verified ?? null,
      // Wallet
      wallet_balance: Math.max(0, walletBalance),
    };
  }

  /**
   * GET /api/admin/vendors/:id/view-wallet-balance
   * Returns only the wallet balance for a specific vendor.
   */
  static async getVendorWalletBalance(vendorId: string) {
    // Try by vendor id first, then fall back to user_id
    let { data, error } = await supabase
      .from('vendors')
      .select('id, user_id, business_name, business_type, service_type, verification_status, is_active')
      .eq('id', vendorId)
      .single();

    // If not found by vendor id, try by user_id
    if (error || !data) {
      const fallback = await supabase
        .from('vendors')
        .select('id, user_id, business_name, business_type, service_type, verification_status, is_active')
        .eq('user_id', vendorId)
        .single();
      data = fallback.data;
      error = fallback.error;
    }

    if (error || !data) return null;
    const v = data as Record<string, unknown>;

    // Fetch user details
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone')
      .eq('id', v.user_id as string)
      .single();

    const u = (user ?? {}) as Record<string, unknown>;

    // Calculate wallet balance
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount')
      .eq('user_id', v.user_id as string)
      .eq('status', 'completed');

    const CREDIT_TYPES_V = new Set(['credit', 'topup', 'refund', 'tip_received', 'earning', 'tip_payment']);
    const DEBIT_TYPES_V  = new Set(['debit', 'hold', 'withdrawal', 'payment']);

    let walletBalance = 0;
    for (const tx of txns ?? []) {
      const t    = tx as Record<string, unknown>;
      const amt  = parseFloat(String(t.amount ?? 0));
      const type = String(t.transaction_type ?? '');
      if (CREDIT_TYPES_V.has(type))     walletBalance += amt;
      else if (DEBIT_TYPES_V.has(type)) walletBalance -= amt;
    }

    return {
      vendor_id: v.id,
      user_id: v.user_id,
      business_name: v.business_name,
      business_type: v.business_type,
      service_type: v.service_type,
      verification_status: v.verification_status,
      is_active: v.is_active,
      first_name: u.first_name ?? null,
      last_name: u.last_name ?? null,
      email: u.email ?? v.email,
      phone: u.phone ?? v.phone,
      wallet_balance: Math.max(0, walletBalance),
      currency_code: 'NGN',
      formatted_balance: `₦${Math.max(0, walletBalance).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    };
  }

  // ─── Vendor order history ─────────────────────────────────────────────────

  static async getVendorOrders(vendorId: string, filters: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Get vendor to find user_id and business_type — try vendor id then user_id
    let { data: vendor, error: vendorError } = await supabase
      .from('vendors')
      .select('id, user_id, business_type')
      .eq('id', vendorId)
      .single();

    if (vendorError || !vendor) {
      const fallback = await supabase
        .from('vendors')
        .select('id, user_id, business_type')
        .eq('user_id', vendorId)
        .single();
      vendor = fallback.data;
      vendorError = fallback.error;
    }

    if (vendorError || !vendor) throw new Error('Vendor not found');
    const v = vendor as Record<string, unknown>;

    const statusMap: Record<string, string> = {
      delivered: 'Completed', completed: 'Completed',
      cancelled: 'Cancelled', pending: 'Pending',
      accepted: 'In Progress', preparing: 'In Progress',
      ready: 'In Progress', picked_up: 'In Progress',
      shipped: 'In Progress', arrived: 'In Progress',
      rejected: 'Cancelled', courier_not_found: 'Pending',
    };

    const formatDate = (iso: string) =>
      new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const formatTime = (iso: string) =>
      new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

    type OrderRow = {
      id: string; status: string; created_at: string;
      items: Array<{ name: string; quantity: number; rating: number | null }>;
    };

    let allOrders: OrderRow[] = [];

    // ── Marketplace orders ──────────────────────────────────────────────────
    const { data: mpStore } = await supabase
      .from('marketplace_stores')
      .select('id')
      .eq('owner_id', v.user_id as string)
      .single();

    if (mpStore) {
      const storeId = (mpStore as Record<string, unknown>).id as string;
      let mpQ = supabase
        .from('marketplace_orders')
        .select(`
          id, status, created_at,
          orderItems:marketplace_order_items(product_name, quantity),
          reviews:marketplace_reviews(store_rating)
        `)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false });

      if (filters.status && filters.status.toLowerCase() !== 'all') {
        const raw = Object.entries(statusMap)
          .filter(([, v2]) => v2.toLowerCase() === filters.status!.toLowerCase())
          .map(([k]) => k);
        if (raw.length) mpQ = mpQ.in('status', raw);
      }
      if (filters.from) mpQ = mpQ.gte('created_at', filters.from);
      if (filters.to) {
        const toEnd = new Date(filters.to); toEnd.setHours(23, 59, 59, 999);
        mpQ = mpQ.lte('created_at', toEnd.toISOString());
      }

      const { data: mpOrders } = await mpQ;
      for (const o of mpOrders ?? []) {
        const row = o as Record<string, unknown>;
        const items = (row.orderItems as Array<Record<string, unknown>> ?? []).map((i) => ({
          name: i.product_name as string,
          quantity: i.quantity as number,
          rating: null as number | null,
        }));
        const reviews = row.reviews as Array<Record<string, unknown>> ?? [];
        const rating = reviews.length ? Number(reviews[0].store_rating) : null;
        if (items.length > 0) items[0].rating = rating;
        allOrders.push({ id: row.id as string, status: row.status as string, created_at: row.created_at as string, items });
      }
    }

    // ── Food orders ─────────────────────────────────────────────────────────
    const { data: restaurant } = await supabase
      .from('food_restaurants')
      .select('id')
      .eq('owner_id', v.user_id as string)
      .single();

    if (restaurant) {
      const restaurantId = (restaurant as Record<string, unknown>).id as string;
      let foodQ = supabase
        .from('food_orders')
        .select(`
          id, status, created_at,
          orderItems:food_order_items(item_name, quantity)
        `)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false });

      if (filters.status && filters.status.toLowerCase() !== 'all') {
        const raw = Object.entries(statusMap)
          .filter(([, v2]) => v2.toLowerCase() === filters.status!.toLowerCase())
          .map(([k]) => k);
        if (raw.length) foodQ = foodQ.in('status', raw);
      }
      if (filters.from) foodQ = foodQ.gte('created_at', filters.from);
      if (filters.to) {
        const toEnd = new Date(filters.to); toEnd.setHours(23, 59, 59, 999);
        foodQ = foodQ.lte('created_at', toEnd.toISOString());
      }

      const { data: foodOrders } = await foodQ;
      for (const o of foodOrders ?? []) {
        const row = o as Record<string, unknown>;
        const items = (row.orderItems as Array<Record<string, unknown>> ?? []).map((i) => ({
          name: i.item_name as string,
          quantity: i.quantity as number,
          rating: null,
        }));
        allOrders.push({ id: row.id as string, status: row.status as string, created_at: row.created_at as string, items });
      }
    }

    // Sort newest first
    allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = allOrders.length;
    const paginated = allOrders.slice(offset, offset + limit);

    const orders = paginated.map((o, idx) => ({
      sn: offset + idx + 1,
      id: o.id,
      items_sold: o.items.map((i) => i.name).join(', '),
      quantity: o.items.reduce((sum, i) => sum + i.quantity, 0),
      rating: o.items[0]?.rating ?? null,
      date: formatDate(o.created_at),
      time: formatTime(o.created_at),
      status: statusMap[o.status?.toLowerCase()] ?? o.status,
    }));

    return { orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ─── Suspend / reactivate vendor ─────────────────────────────────────────

  static async toggleSuspend(vendorId: string, adminId: string) {
    let { data: existing, error } = await supabase
      .from('vendors')
      .select('id, user_id, verification_status')
      .eq('id', vendorId)
      .single();

    if (error || !existing) {
      const fallback = await supabase
        .from('vendors')
        .select('id, user_id, verification_status')
        .eq('user_id', vendorId)
        .single();
      existing = fallback.data;
      error = fallback.error;
    }

    if (error || !existing) throw new Error('Vendor not found');

    const v = existing as Record<string, unknown>;
    if (v.verification_status === 'terminated') throw new Error('ACCOUNT_TERMINATED');

    const newStatus = v.verification_status === 'suspended' ? 'approved' : 'suspended';

    const { data: updated, error: updateError } = await supabase
      .from('vendors')
      .update({ verification_status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', vendorId)
      .select('id, user_id, verification_status, updated_at')
      .single();

    if (updateError || !updated) throw new Error('Failed to update vendor status');

    // Suspend only affects vendors.verification_status — users.status is NOT touched.
    // A suspended vendor can still use the platform as a regular user
    // (place orders, use wallet, etc.) but cannot operate their store
    // or receive any vendor orders/updates until reactivated.

    logger.info('Admin toggled vendor suspension', { adminId, vendorId, from: v.verification_status, to: newStatus });
    return { vendor: updated, action: newStatus === 'suspended' ? 'suspended' : 'reactivated' };
  }

  // ─── Terminate vendor account ─────────────────────────────────────────────

  static async terminateAccount(vendorId: string, adminId: string, reason?: string) {
    let { data: existing, error } = await supabase
      .from('vendors')
      .select('id, user_id, verification_status')
      .eq('id', vendorId)
      .single();

    if (error || !existing) {
      const fallback = await supabase
        .from('vendors')
        .select('id, user_id, verification_status')
        .eq('user_id', vendorId)
        .single();
      existing = fallback.data;
      error = fallback.error;
    }

    if (error || !existing) throw new Error('Vendor not found');

    const v = existing as Record<string, unknown>;
    if (v.verification_status === 'terminated') throw new Error('ALREADY_TERMINATED');

    const { data: updated, error: updateError } = await supabase
      .from('vendors')
      .update({ verification_status: 'terminated', is_active: false, updated_at: new Date().toISOString() })
      .eq('id', vendorId)
      .select('id, user_id, verification_status, updated_at')
      .single();

    if (updateError || !updated) throw new Error('Failed to terminate vendor account');

    // Mirror on users table — data preserved
    await supabase
      .from('users')
      .update({ status: 'terminated', updated_at: new Date().toISOString() })
      .eq('id', v.user_id as string);

    logger.warn('Admin terminated vendor account', { adminId, vendorId, previousStatus: v.verification_status, reason: reason ?? 'No reason provided' });
    return updated;
  }

  // ─── Incomplete registrations ─────────────────────────────────────────────

  /**
   * GET /api/admin/vendors/registrations
   * Returns vendors that have NOT completed registration.
   * Excludes: approved, terminated.
   * Includes: pending, rejected, and vendors with incomplete profiles.
   * Query: status (pending|rejected|incomplete), search, page, limit
   */
  static async getIncompleteRegistrations(filters: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  } = {}) {
    const { status, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Never show approved or terminated — those are complete or closed
    let query = supabase
      .from('vendors')
      .select('*', { count: 'exact' })
      .not('verification_status', 'in', '("approved","terminated")')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== 'all') {
      query = query.eq('verification_status', status.toLowerCase());
    }

    const { data: vendors, count, error } = await query;

    if (error) {
      logger.warn('getIncompleteRegistrations error', { error: error.message });
      throw new Error(`Failed to fetch incomplete vendor registrations: ${error.message}`);
    }

    const rows = vendors ?? [];

    // Enrich with user details
    const userIds = [...new Set(rows.map(r => (r as Record<string, unknown>).user_id as string).filter(Boolean))];
    const userMap = new Map<string, Record<string, unknown>>();

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, phone, avatar_url')
        .in('id', userIds);
      for (const u of users ?? []) {
        userMap.set((u as Record<string, unknown>).id as string, u as Record<string, unknown>);
      }
    }

    let formatted = rows.map((vendor, idx) => {
      const v    = vendor as Record<string, unknown>;
      const user = userMap.get(v.user_id as string) ?? {} as Record<string, unknown>;
      const progress = resolveRegistrationProgress(v);

      return {
        sn: offset + idx + 1,
        id: v.id,
        user: {
          id:        v.user_id,
          name:      `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unknown',
          email:     user.email ?? v.email ?? null,
          phone:     user.phone ?? v.phone ?? null,
          avatarUrl: user.avatar_url ?? null,
        },
        business_name:       v.business_name       ?? null,
        business_type:       v.business_type       ?? null,
        service_type:        v.service_type        ?? null,
        verification_status: v.verification_status,
        rejection_reason:    v.rejection_reason    ?? null,
        progressPercent:     progress.progressPercent,
        currentStep:         progress.currentStep,
        currentStepLabel:    progress.currentStepLabel,
        stepsCompleted:      progress.completedCount,
        totalSteps:          progress.steps.length,
        createdAt:           v.created_at,
        updatedAt:           v.updated_at,
      };
    });

    // Search by name or email after enrichment
    if (search) {
      const sq = search.toLowerCase();
      formatted = formatted.filter(r =>
        r.user.name.toLowerCase().includes(sq) ||
        (r.user.email as string ?? '').toLowerCase().includes(sq) ||
        (r.business_name as string ?? '').toLowerCase().includes(sq)
      );
    }

    return {
      vendors: formatted,
      pagination: {
        page,
        limit,
        total: search ? formatted.length : (count ?? 0),
        pages: Math.ceil((search ? formatted.length : (count ?? 0)) / limit),
      },
    };
  }

  /**
   * GET /api/admin/vendors/registrations/:vendorId
   * Full detail of a single incomplete vendor registration — all steps, fields, progress.
   * Returns null if vendor doesn't exist.
   * Returns __completed sentinel if vendor is already approved.
   */
  static async getIncompleteRegistrationById(vendorId: string) {
    const { data: vendor, error } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', vendorId)
      .single();

    if (error || !vendor) return null;

    const v = vendor as Record<string, unknown>;

    // Approved vendors belong in the main vendors list, not here
    if (v.verification_status === 'approved') {
      return { __completed: true } as { __completed: boolean };
    }

    // Enrich with user details
    const { data: user } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, status, email_verified')
      .eq('id', v.user_id as string)
      .single();

    const u = (user ?? {}) as Record<string, unknown>;
    const progress = resolveRegistrationProgress(v);

    return {
      id: v.id,
      user: {
        id:            v.user_id,
        name:          `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown',
        email:         u.email ?? v.email ?? null,
        phone:         u.phone ?? v.phone ?? null,
        avatarUrl:     u.avatar_url ?? null,
        accountStatus: u.status ?? null,
        emailVerified: u.email_verified ?? null,
      },
      verification_status: v.verification_status,
      rejection_reason:    v.rejection_reason ?? null,
      approved_by:         v.approved_by      ?? null,
      approved_at:         v.approved_at      ?? null,
      // Progress overview
      progressPercent:  progress.progressPercent,
      currentStep:      progress.currentStep,
      currentStepLabel: progress.currentStepLabel,
      stepsCompleted:   progress.completedCount,
      totalSteps:       progress.steps.length,
      // Per-step breakdown with field values
      steps: progress.steps,
      // Raw fields for admin detail view
      business_name:       v.business_name       ?? null,
      business_type:       v.business_type       ?? null,
      service_type:        v.service_type        ?? null,
      gender:              v.gender              ?? null,
      city:                v.city                ?? null,
      state:               v.state               ?? null,
      address:             v.address             ?? null,
      logo_url:            v.logo_url            ?? null,
      profile_picture_url: v.profile_picture_url ?? null,
      nin_number:          v.nin_number          ? '***provided***' : null,
      cac_document_url:    v.cac_document_url    ?? null,
      store_images:        v.store_images        ?? null,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
    };
  }
}