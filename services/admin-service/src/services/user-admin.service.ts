import { supabase } from '../config/database';
import { logger } from '../utils/logger';

const VALID_ROLES = ['customer', 'driver', 'vendor', 'admin', 'super_admin'];

export class UserAdminService {
  static async getUsers(filters: {
    role?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { role, status, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select(
        'id, email, first_name, last_name, username, roles, active_role, phone, status, email_verified, created_at, updated_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (role) query = query.contains('roles', [role]);
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);

    const { data: users, count, error } = await query;
    if (error) throw new Error(`Failed to get users: ${error.message}`);

    return { users: users || [], total: count || 0, page, limit };
  }

  static async getUserById(userId: string) {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, username, roles, active_role, phone, status, email_verified, avatar_url, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !user) return null;
    return user;
  }

  static async updateRoles(userId: string, roles: string[], activeRole?: string) {
    // Validate roles
    const invalidRoles = roles.filter(r => !VALID_ROLES.includes(r));
    if (invalidRoles.length > 0) {
      throw new Error(`Invalid roles: ${invalidRoles.join(', ')}. Valid roles: ${VALID_ROLES.join(', ')}`);
    }

    if (activeRole && !roles.includes(activeRole)) {
      throw new Error('activeRole must be one of the assigned roles');
    }

    const updateData: Record<string, unknown> = {
      roles,
      updated_at: new Date().toISOString(),
    };
    if (activeRole) updateData.active_role = activeRole;

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select('id, email, roles, active_role, status')
      .single();

    if (error || !user) throw new Error('User not found');

    logger.info('User roles updated by admin', { userId, roles, activeRole });
    return user;
  }

  static async setUserStatus(userId: string, status: 'active' | 'suspended' | 'banned') {
    const { data: user, error } = await supabase
      .from('users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select('id, email, status')
      .single();

    if (error || !user) throw new Error('User not found');

    logger.info('User status updated by admin', { userId, status });
    return user;
  }

  static async getPlatformStats() {
    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: totalDrivers },
      { count: approvedDrivers },
      { count: totalVendors },
      { count: approvedVendors },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('drivers').select('*', { count: 'exact', head: true }),
      supabase.from('drivers').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('vendors').select('*', { count: 'exact', head: true }),
      supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('verification_status', 'approved'),
    ]);

    return {
      users: { total: totalUsers || 0, active: activeUsers || 0 },
      drivers: { total: totalDrivers || 0, approved: approvedDrivers || 0 },
      vendors: { total: totalVendors || 0, approved: approvedVendors || 0 },
    };
  }
}
