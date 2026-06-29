import bcrypt from 'bcryptjs';
import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { adminEmailService } from './admin-email.service';

// ─── Token revocation helper ──────────────────────────────────────────────────

/**
 * Write a revocation record for a user.
 * The adminAuthMiddleware rejects any JWT whose iat is before this timestamp,
 * giving instant forced-logout even for long-lived access tokens.
 *
 * Also marks all refresh_tokens rows as revoked so no new access tokens
 * can be minted for this user via the refresh flow.
 */
async function revokeUserTokens(userId: string): Promise<void> {
  const now = new Date().toISOString();

  // ── 1. Write revocation timestamp ─────────────────────────────────────────
  // Upsert so repeated calls are idempotent (always updates to latest time).
  const { error: revErr } = await supabase
    .from('admin_token_revocations')
    .upsert(
      { user_id: userId, revoked_at: now },
      { onConflict: 'user_id' }
    );

  if (revErr) {
    logger.error('revokeUserTokens: failed to write revocation record', {
      userId, error: revErr.message,
    });
  }

  // ── 2. Revoke all refresh tokens (prevents new access token minting) ──────
  const { error: rtErr } = await supabase
    .from('refresh_tokens')
    .update({ revoked: true })
    .eq('user_id', userId)
    .eq('revoked', false);

  if (rtErr) {
    logger.warn('revokeUserTokens: failed to revoke refresh tokens (non-fatal)', {
      userId, error: rtErr.message,
    });
  }

  logger.info('User tokens revoked', { userId });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateSubAdminInput {
  first_name: string;
  last_name:  string;
  email:      string;
  phone:      string;
  role:       'admin' | 'super_admin';
  status:     'pending' | 'active';
  password:   string;
  created_by: string; // super admin's userId
}

export interface ListAdminsFilters {
  role?:     string;
  status?:   string;
  search?:   string;
  from?:     string;
  to?:       string;
  page?:     number;
  limit?:    number;
}

// ─── Wallet helpers (reused from user-admin pattern) ─────────────────────────

const CREDIT_TYPES = new Set(['credit', 'topup', 'refund', 'tip_received', 'earning', 'tip_payment']);
const DEBIT_TYPES  = new Set(['debit', 'hold', 'withdrawal', 'payment']);

async function getWalletBalance(userId: string): Promise<number> {
  const { data: txns } = await supabase
    .from('wallet_transactions')
    .select('transaction_type, amount, status')
    .eq('user_id', userId)
    .eq('status', 'completed');

  let balance = 0;
  for (const tx of txns ?? []) {
    const row  = tx as Record<string, unknown>;
    const amt  = parseFloat(String(row.amount ?? 0));
    const type = String(row.transaction_type ?? '');
    if (CREDIT_TYPES.has(type))     balance += amt;
    else if (DEBIT_TYPES.has(type)) balance -= amt;
  }
  return Math.max(0, balance);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SubAdminService {

  /**
   * Create a new sub-admin account.
   * Only super admin can call this.
   * Password is set by super admin — the sub admin has no password management rights.
   */
  static async create(input: CreateSubAdminInput) {
    const { first_name, last_name, email, phone, role, status, password, created_by } = input;

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!first_name?.trim()) throw new Error('first_name is required');
    if (!last_name?.trim())  throw new Error('last_name is required');
    if (!email?.trim())      throw new Error('email is required');
    if (!phone?.trim())      throw new Error('phone is required');
    if (!password?.trim())   throw new Error('password is required');
    if (password.length < 8) throw new Error('password must be at least 8 characters');

    const validRoles = ['admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      throw new Error(`role must be one of: ${validRoles.join(', ')}`);
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    // ── Check email not already taken ─────────────────────────────────────────
    const { data: existing } = await supabase
      .from('users')
      .select('id, email, status, roles')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      const ex = existing as Record<string, unknown>;
      // If the existing account is terminated (soft-deleted), we can recycle it
      // by updating in place rather than blocking with EMAIL_ALREADY_EXISTS.
      if ((ex.status as string) !== 'terminated') {
        throw new Error('EMAIL_ALREADY_EXISTS');
      }
      // Fall through — will be handled as a reactivation below
    }

    // ── Check phone not already taken ─────────────────────────────────────────
    const { data: existingPhone } = await supabase
      .from('users')
      .select('id, phone, status')
      .eq('phone', normalizedPhone)
      .maybeSingle();

    if (existingPhone) {
      const ep = existingPhone as Record<string, unknown>;
      if ((ep.status as string) !== 'terminated') {
        throw new Error('PHONE_ALREADY_EXISTS');
      }
    }

    // ── Hash password ─────────────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash(password, 12);
    const now          = new Date().toISOString();

    // ── Reactivate terminated account OR create fresh ─────────────────────────
    let newAdmin: Record<string, unknown>;

    if (existing && (existing as Record<string, unknown>).status === 'terminated') {
      // Recycle the existing row — update it with the new details
      const { data: recycled, error: recycleError } = await supabase
        .from('users')
        .update({
          first_name:     first_name.trim(),
          last_name:      last_name.trim(),
          phone:          normalizedPhone,
          password_hash:  passwordHash,
          roles:          [role],
          active_role:    role,
          role:           role,
          status:         status === 'pending' ? 'pending' : 'active',
          email_verified: status !== 'pending',
          updated_at:     now,
        })
        .eq('email', normalizedEmail)
        .select('id, first_name, last_name, email, phone, roles, active_role, status, email_verified, created_at')
        .single();

      if (recycleError || !recycled) {
        logger.error('SubAdminService.create recycle error', { error: recycleError?.message });
        throw new Error(`Failed to recreate admin account: ${recycleError?.message}`);
      }

      // Clear any old revocation record so the recycled account is not blocked
      await supabase
        .from('admin_token_revocations')
        .delete()
        .eq('user_id', (recycled as Record<string, unknown>).id);

      newAdmin = recycled as Record<string, unknown>;
      logger.info('Terminated sub-admin account recycled by super admin', {
        adminId:   newAdmin.id,
        email:     normalizedEmail,
        role,
        createdBy: created_by,
      });
    } else {
      // Fresh insert
      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert({
          first_name:     first_name.trim(),
          last_name:      last_name.trim(),
          email:          normalizedEmail,
          phone:          normalizedPhone,
          password_hash:  passwordHash,
          roles:          [role],
          active_role:    role,
          role:           role,
          status:         status === 'pending' ? 'pending' : 'active',
          email_verified: status !== 'pending',
          provider:       'emailpass',
          created_at:     now,
          updated_at:     now,
        })
        .select('id, first_name, last_name, email, phone, roles, active_role, status, email_verified, created_at')
        .single();

      if (insertError || !inserted) {
        logger.error('SubAdminService.create insert error', { error: insertError?.message });
        throw new Error(`Failed to create admin account: ${insertError?.message}`);
      }

      newAdmin = inserted as Record<string, unknown>;
      logger.info('Sub-admin created by super admin', {
        newAdminId: newAdmin.id,
        email:      normalizedEmail,
        role,
        createdBy:  created_by,
      });
    }

    logger.info('Sub-admin created by super admin', {
      newAdminId: newAdmin.id,
      email:      normalizedEmail,
      role,
      createdBy:  created_by,
    });

    // ── Send notification email (non-blocking) ────────────────────────────────
    if (status === 'pending') {
      adminEmailService.sendPendingAccountEmail({
        to:        normalizedEmail,
        firstName: first_name.trim(),
        role,
        email:     normalizedEmail,
        password,
      }).catch(err =>
        logger.warn('Failed to send pending-account email (non-fatal)', { error: err?.message })
      );
    } else {
      adminEmailService.sendApprovalEmail({
        to:        normalizedEmail,
        firstName: first_name.trim(),
        role,
        email:     normalizedEmail,
        password,
      }).catch(err =>
        logger.warn('Failed to send approval email on create (non-fatal)', { error: err?.message })
      );
    }

    return newAdmin as unknown as {
      id: string; first_name: string; last_name: string; email: string;
      phone: string; roles: string[]; active_role: string;
      status: string; email_verified: boolean; created_at: string;
    };
  }

  /**
   * List all admin accounts (role = 'admin' or 'super_admin') with wallet balance.
   * Paginated, filterable by role, status, date range, and search.
   */
  static async listAdmins(filters: ListAdminsFilters) {
    const { role, status, search, from, to, page = 1, limit = 10 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select(
        'id, first_name, last_name, email, phone, roles, active_role, status, email_verified, created_at',
        { count: 'exact' }
      )
      // Only admin-level accounts
      .or('roles.cs.{"admin"},roles.cs.{"super_admin"}')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role)   query = query.contains('roles', [role]);
    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(
        `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }
    if (from) query = query.gte('created_at', new Date(from).toISOString());
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      query = query.lte('created_at', toEnd.toISOString());
    }

    const { data: admins, count, error } = await query;
    if (error) throw new Error(`Failed to list admins: ${error.message}`);

    // Attach wallet balance to each admin
    const adminList = await Promise.all(
      (admins ?? []).map(async (admin, idx) => {
        const a = admin as Record<string, unknown>;
        const walletBalance = await getWalletBalance(a.id as string);
        return {
          sn:             offset + idx + 1,
          id:             a.id,
          name:           `${a.first_name} ${a.last_name}`.trim(),
          first_name:     a.first_name,
          last_name:      a.last_name,
          email:          a.email,
          phone:          a.phone,
          roles:          a.roles,
          active_role:    a.active_role,
          status:         a.status,
          email_verified: a.email_verified,
          date_joined:    a.created_at,
          wallet_balance: walletBalance,
        };
      })
    );

    return {
      admins: adminList,
      pagination: {
        total:  count ?? 0,
        page,
        limit,
        pages:  Math.ceil((count ?? 0) / limit),
      },
    };
  }

  /**
   * Get full details of a single admin by ID, including wallet balance.
   */
  static async getAdminById(adminId: string) {
    const { data: admin, error } = await supabase
      .from('users')
      .select(
        'id, first_name, last_name, email, phone, roles, active_role, status, email_verified, avatar_url, created_at, updated_at'
      )
      .eq('id', adminId)
      // Must be an admin or super_admin
      .or('roles.cs.{"admin"},roles.cs.{"super_admin"}')
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch admin: ${error.message}`);
    if (!admin) return null;

    const a = admin as Record<string, unknown>;
    const walletBalance = await getWalletBalance(a.id as string);

    return {
      id:             a.id,
      name:           `${a.first_name} ${a.last_name}`.trim(),
      first_name:     a.first_name,
      last_name:      a.last_name,
      email:          a.email,
      phone:          a.phone,
      avatar_url:     a.avatar_url,
      roles:          a.roles,
      active_role:    a.active_role,
      status:         a.status,
      email_verified: a.email_verified,
      date_joined:    a.created_at,
      updated_at:     a.updated_at,
      wallet_balance: walletBalance,
    };
  }

  /**
   * Reset a sub-admin's password.
   * Only super admin can call this — sub admins cannot reset their own password.
   */
  static async resetPassword(adminId: string, newPassword: string, superAdminId: string) {
    if (!newPassword?.trim())   throw new Error('newPassword is required');
    if (newPassword.length < 8) throw new Error('password must be at least 8 characters');

    // Prevent super admin from accidentally resetting their own via this endpoint
    // (they would use a separate self-service flow)
    const { data: target, error: fetchError } = await supabase
      .from('users')
      .select('id, email, roles, active_role, status')
      .eq('id', adminId)
      .or('roles.cs.{"admin"},roles.cs.{"super_admin"}')
      .maybeSingle();

    if (fetchError || !target) throw new Error('Admin account not found');

    const t = target as Record<string, unknown>;
    if ((t.status as string) === 'terminated') throw new Error('ACCOUNT_TERMINATED');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq('id', adminId);

    if (updateError) throw new Error(`Failed to reset password: ${updateError.message}`);

    logger.info('Sub-admin password reset by super admin', {
      adminId,
      superAdminId,
    });

    return { id: adminId, email: t.email, message: 'Password reset successfully' };
  }

  /**
   * Suspend a sub-admin account (sets status = 'suspended').
   * Suspended admin cannot log in until reinstated.
   */
  static async suspend(adminId: string, superAdminId: string) {
    const { data: target, error: fetchError } = await supabase
      .from('users')
      .select('id, email, status, roles')
      .eq('id', adminId)
      .or('roles.cs.{"admin"},roles.cs.{"super_admin"}')
      .maybeSingle();

    if (fetchError || !target) throw new Error('Admin account not found');

    const t = target as Record<string, unknown>;
    if ((t.status as string) === 'terminated') throw new Error('ACCOUNT_TERMINATED');
    if ((t.status as string) === 'suspended')  throw new Error('ALREADY_SUSPENDED');

    const { data: updated, error } = await supabase
      .from('users')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', adminId)
      .select('id, email, status, updated_at')
      .single();

    if (error || !updated) throw new Error('Failed to suspend admin account');

    logger.warn('Sub-admin suspended by super admin', { adminId, superAdminId });
    return updated;
  }

  /**
   * Reinstate (unsuspend) a previously suspended sub-admin.
   */
  static async unsuspend(adminId: string, superAdminId: string) {
    const { data: target, error: fetchError } = await supabase
      .from('users')
      .select('id, email, status, roles')
      .eq('id', adminId)
      .or('roles.cs.{"admin"},roles.cs.{"super_admin"}')
      .maybeSingle();

    if (fetchError || !target) throw new Error('Admin account not found');

    const t = target as Record<string, unknown>;
    if ((t.status as string) === 'terminated') throw new Error('ACCOUNT_TERMINATED');
    if ((t.status as string) === 'active')     throw new Error('ALREADY_ACTIVE');

    const { data: updated, error } = await supabase
      .from('users')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', adminId)
      .select('id, email, status, updated_at')
      .single();

    if (error || !updated) throw new Error('Failed to reinstate admin account');

    logger.info('Sub-admin reinstated by super admin', { adminId, superAdminId });
    return updated;
  }

  /**
   * Remove admin role from a user.
   * Strips 'admin' (and 'super_admin') from their roles array.
   * Sets active_role back to 'customer' — they remain a regular user.
   * Their next login will produce a customer-scoped JWT.
   */
  static async removeAdminRole(adminId: string, superAdminId: string) {
    // Prevent super admin from removing their own admin role
    if (adminId === superAdminId) {
      throw new Error('CANNOT_REMOVE_OWN_ROLE');
    }

    const { data: target, error: fetchError } = await supabase
      .from('users')
      .select('id, email, roles, active_role, status')
      .eq('id', adminId)
      .or('roles.cs.{"admin"},roles.cs.{"super_admin"}')
      .maybeSingle();

    if (fetchError || !target) throw new Error('Admin account not found');

    const t = target as Record<string, unknown>;
    if ((t.status as string) === 'terminated') throw new Error('ACCOUNT_TERMINATED');

    // Strip admin-level roles, keep any other roles (e.g. driver, vendor)
    const currentRoles = (t.roles as string[]) ?? [];
    const newRoles = currentRoles.filter(r => r !== 'admin' && r !== 'super_admin');

    // If no other roles remain, fall back to customer
    if (newRoles.length === 0) newRoles.push('customer');

    const { data: updated, error } = await supabase
      .from('users')
      .update({
        roles:       newRoles,
        active_role: 'customer',
        role:        'customer',    // legacy field
        updated_at:  new Date().toISOString(),
      })
      .eq('id', adminId)
      .select('id, email, roles, active_role, status, updated_at')
      .single();

    if (error || !updated) throw new Error('Failed to remove admin role');

    // ── Revoke all active tokens immediately ──────────────────────────────────
    // Any JWT this user currently holds will be rejected on the next request
    // to any admin endpoint, even if the token hasn't expired yet.
    await revokeUserTokens(adminId);

    logger.warn('Admin role removed by super admin', {
      adminId,
      superAdminId,
      previousRoles: currentRoles,
      newRoles,
    });

    return updated;
  }

  /**
   * Approve a pending sub-admin account.
   * Sets status = 'active' and email_verified = true so the sub admin can log in.
   * Only valid when current status is 'pending'.
   */
  static async approve(adminId: string, superAdminId: string) {
    const { data: target, error: fetchError } = await supabase
      .from('users')
      .select('id, email, status, roles')
      .eq('id', adminId)
      .or('roles.cs.{"admin"},roles.cs.{"super_admin"}')
      .maybeSingle();

    if (fetchError || !target) throw new Error('Admin account not found');

    const t = target as Record<string, unknown>;
    const currentStatus = t.status as string;

    if (currentStatus === 'terminated') throw new Error('ACCOUNT_TERMINATED');
    if (currentStatus === 'active')     throw new Error('ALREADY_ACTIVE');
    if (currentStatus === 'suspended')  throw new Error('ACCOUNT_SUSPENDED');

    const { data: updated, error } = await supabase
      .from('users')
      .update({
        status:         'active',
        email_verified: true,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', adminId)
      .select('id, email, first_name, last_name, status, email_verified, roles, active_role, updated_at')
      .single();

    if (error || !updated) throw new Error('Failed to approve admin account');

    logger.info('Sub-admin account approved by super admin', { adminId, superAdminId });

    // ── Send approval welcome email (non-blocking) ────────────────────────────
    // We don't re-expose the password here — the admin already received it
    // in the pending email. The approval email confirms they can now log in.
    const t2 = updated as Record<string, unknown>;
    adminEmailService.sendApprovalEmail({
      to:        t2.email as string,
      firstName: (t2.first_name as string | undefined) ?? 'Admin',
      role:      (t2.active_role as string | undefined) ?? 'admin',
      email:     t2.email as string,
      password:  'Use the password provided when your account was created',
    }).catch(err =>
      logger.warn('Failed to send approval email (non-fatal)', { error: err?.message })
    );

    return updated;
  }

  /**
   * Soft-delete an admin account.
   * Mirrors the existing user terminate pattern — sets status = 'terminated',
   * strips admin roles, revokes all tokens, and preserves all data.
   * The account cannot be reactivated or modified after termination.
   */
  static async deleteAccount(adminId: string, superAdminId: string) {
    // Prevent super admin from deleting their own account via this endpoint
    if (adminId === superAdminId) {
      throw new Error('CANNOT_DELETE_OWN_ACCOUNT');
    }

    const { data: target, error: fetchError } = await supabase
      .from('users')
      .select('id, email, roles, status')
      .eq('id', adminId)
      .or('roles.cs.{"admin"},roles.cs.{"super_admin"}')
      .maybeSingle();

    if (fetchError || !target) throw new Error('Admin account not found');

    const t = target as Record<string, unknown>;

    // Idempotent — already terminated, return as-is
    if ((t.status as string) === 'terminated') {
      logger.info('deleteAccount: already terminated (idempotent)', { adminId, superAdminId });
      return { id: adminId, status: 'terminated', deleted: true };
    }

    // ── 1. Soft-delete: set status = 'terminated', strip admin roles ──────────
    const { data: updated, error } = await supabase
      .from('users')
      .update({
        status:      'terminated',
        roles:       ['customer'],   // strip admin role — no longer an admin
        active_role: 'customer',
        role:        'customer',     // legacy field
        updated_at:  new Date().toISOString(),
      })
      .eq('id', adminId)
      .select('id, email, status, roles, active_role, updated_at')
      .single();

    if (error || !updated) throw new Error(`Failed to delete admin account: ${error?.message}`);

    // ── 2. Revoke all active tokens immediately (forced logout) ───────────────
    await revokeUserTokens(adminId);

    logger.warn('Admin account soft-deleted (terminated) by super admin', {
      deletedAdminId: adminId,
      superAdminId,
      email: t.email,
    });

    return { id: adminId, email: t.email, status: 'terminated', deleted: true };
  }
}
