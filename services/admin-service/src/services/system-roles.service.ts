import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { PLATFORM_SECTIONS, SectionPermissions } from '../constants/rbac';

export interface CreateRoleInput {
  name:        string;
  description?: string;
  permissions: Partial<SectionPermissions>[];
}

export class SystemRolesService {

  // ── Create ────────────────────────────────────────────────────────────────

  static async createRole(input: CreateRoleInput, superAdminId: string) {
    const { name, description, permissions } = input;

    if (!name?.trim()) throw new Error('Role name is required');

    // Create the role
    const { data: role, error: roleErr } = await supabase
      .from('admin_system_roles')
      .insert({ name: name.trim(), description: description?.trim() ?? null, created_by: superAdminId })
      .select()
      .single();

    if (roleErr) {
      if (roleErr.message.includes('unique')) throw new Error('A role with this name already exists');
      throw new Error(`Failed to create role: ${roleErr.message}`);
    }

    // Insert permissions for all provided sections
    await this._upsertPermissions(role.id, permissions);

    return this.getRoleById(role.id);
  }

  // ── List ─────────────────────────────────────────────────────────────────

  static async listRoles() {
    const { data, error } = await supabase
      .from('admin_system_roles')
      .select(`
        id, name, description, is_active, created_at,
        permissions:admin_role_permissions(section, can_view, can_create, can_edit, can_delete)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to list roles: ${error.message}`);

    return (data ?? []).map((r: any) => ({
      ...r,
      endpoint_count: (r.permissions as any[]).filter((p: any) =>
        p.can_view || p.can_create || p.can_edit || p.can_delete
      ).length,
    }));
  }

  // ── Get by ID ─────────────────────────────────────────────────────────────

  static async getRoleById(roleId: string) {
    const { data, error } = await supabase
      .from('admin_system_roles')
      .select(`
        id, name, description, is_active, created_at, updated_at,
        permissions:admin_role_permissions(section, can_view, can_create, can_edit, can_delete)
      `)
      .eq('id', roleId)
      .single();

    if (error || !data) return null;

    // Build a full permission matrix — include all sections even if not stored
    const stored: Record<string, any> = {};
    for (const p of (data.permissions as any[]) ?? []) stored[p.section] = p;

    const fullMatrix = PLATFORM_SECTIONS.map(section => ({
      section,
      can_view:   stored[section]?.can_view   ?? false,
      can_create: stored[section]?.can_create ?? false,
      can_edit:   stored[section]?.can_edit   ?? false,
      can_delete: stored[section]?.can_delete ?? false,
    }));

    return { ...data, permissions: fullMatrix };
  }

  // ── Update ────────────────────────────────────────────────────────────────

  static async updateRole(roleId: string, input: Partial<CreateRoleInput>) {
    const { name, description, permissions } = input;

    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (name !== undefined)        updatePayload.name        = name.trim();
    if (description !== undefined) updatePayload.description = description?.trim() ?? null;

    if (Object.keys(updatePayload).length > 1) {
      const { error } = await supabase
        .from('admin_system_roles')
        .update(updatePayload)
        .eq('id', roleId);

      if (error) {
        if (error.message.includes('unique')) throw new Error('A role with this name already exists');
        throw new Error(`Failed to update role: ${error.message}`);
      }
    }

    if (permissions && permissions.length > 0) {
      await this._upsertPermissions(roleId, permissions);
    }

    return this.getRoleById(roleId);
  }

  // ── Delete (soft) ─────────────────────────────────────────────────────────

  static async deleteRole(roleId: string) {
    const { error } = await supabase
      .from('admin_system_roles')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', roleId);

    if (error) throw new Error(`Failed to delete role: ${error.message}`);
  }

  // ── Assign role to admin ──────────────────────────────────────────────────

  static async assignRoleToAdmin(userId: string, roleId: string, superAdminId: string) {
    // Verify role exists and is active
    const { data: role } = await supabase
      .from('admin_system_roles')
      .select('id, name, is_active')
      .eq('id', roleId)
      .eq('is_active', true)
      .single();

    if (!role) throw new Error('Role not found or inactive');

    // Upsert — one role per admin at a time
    const { error } = await supabase
      .from('admin_user_roles')
      .upsert(
        { user_id: userId, role_id: roleId, assigned_by: superAdminId, assigned_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) throw new Error(`Failed to assign role: ${error.message}`);

    // ── Full Admin promotion ───────────────────────────────────────────────────
    // If the assigned role has full permissions on every section, the admin
    // is effectively a super_admin. Promote their active_role so the RBAC
    // middleware bypasses all checks and they get identical access.
    const isFullAccess = await SystemRolesService._isFullAccessRole(roleId);
    await SystemRolesService._syncUserAdminLevel(userId, isFullAccess);

    logger.info('Admin system role assigned', {
      userId,
      roleId,
      roleName:      (role as any).name,
      promotedToSuperAdmin: isFullAccess,
      assignedBy:    superAdminId,
    });

    return { user_id: userId, role_id: roleId, role_name: (role as any).name, is_full_access: isFullAccess };
  }

  // ── Unassign role from admin ──────────────────────────────────────────────

  static async unassignRoleFromAdmin(userId: string) {
    const { error } = await supabase
      .from('admin_user_roles')
      .delete()
      .eq('user_id', userId);

    if (error) throw new Error(`Failed to unassign role: ${error.message}`);

    // Always demote back to plain admin when role is removed
    await SystemRolesService._syncUserAdminLevel(userId, false);

    logger.info('Admin system role unassigned', { userId });
  }

  // ── Get admin's permissions (for /me/permissions endpoint) ───────────────

  static async getAdminPermissions(userId: string) {
    // Always read active_role and roles from DB — never from JWT
    const { data: userRow } = await supabase
      .from('users')
      .select('active_role, roles')
      .eq('id', userId)
      .single();

    const activeRole = userRow?.active_role ?? 'admin';
    const roles: string[] = (userRow?.roles as string[]) ?? [];

    // super_admin → full access on everything, no system role check needed
    const isSuperAdmin = activeRole === 'super_admin' || roles.includes('super_admin');
    if (isSuperAdmin) {
      return {
        role_name:      'super_admin',
        is_super_admin: true,
        has_role:       true,
        permissions: PLATFORM_SECTIONS.map(section => ({
          section, can_view: true, can_create: true, can_edit: true, can_delete: true,
        })),
      };
    }

    // Step 1 — find which role_id this admin is assigned
    const { data: userRoleRow } = await supabase
      .from('admin_user_roles')
      .select('role_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!userRoleRow) {
      return {
        role_name:      null,
        is_super_admin: false,
        has_role:       false,
        permissions: PLATFORM_SECTIONS.map(section => ({
          section, can_view: false, can_create: false, can_edit: false, can_delete: false,
        })),
      };
    }

    // Step 2 — verify the role is still active
    const { data: roleRow } = await supabase
      .from('admin_system_roles')
      .select('id, name, is_active')
      .eq('id', userRoleRow.role_id)
      .maybeSingle();

    if (!roleRow || !roleRow.is_active) {
      return {
        role_name:      null,
        is_super_admin: false,
        has_role:       false,
        permissions: PLATFORM_SECTIONS.map(section => ({
          section, can_view: false, can_create: false, can_edit: false, can_delete: false,
        })),
      };
    }

    // Step 3 — fetch the permissions directly for this role_id
    const { data: permRows } = await supabase
      .from('admin_role_permissions')
      .select('section, can_view, can_create, can_edit, can_delete')
      .eq('role_id', userRoleRow.role_id);

    const stored: Record<string, any> = {};
    for (const p of permRows ?? []) stored[p.section] = p;

    const permissions = PLATFORM_SECTIONS.map(section => ({
      section,
      can_view:   stored[section]?.can_view   ?? false,
      can_create: stored[section]?.can_create ?? false,
      can_edit:   stored[section]?.can_edit   ?? false,
      can_delete: stored[section]?.can_delete ?? false,
    }));

    return {
      role_name:      roleRow.name,
      is_super_admin: false,
      has_role:       true,
      permissions,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Returns true if the role has all four permissions (view, create, edit, delete)
   * on every platform section — i.e. it is effectively a "Full Admin" role.
   */
  private static async _isFullAccessRole(roleId: string): Promise<boolean> {
    const { data: perms } = await supabase
      .from('admin_role_permissions')
      .select('section, can_view, can_create, can_edit, can_delete')
      .eq('role_id', roleId);

    if (!perms || perms.length === 0) return false;

    // Build a set of sections that have full permissions
    const fullSections = new Set(
      perms
        .filter((p: any) => p.can_view && p.can_create && p.can_edit && p.can_delete)
        .map((p: any) => p.section)
    );

    // Check that every platform section is fully covered
    return PLATFORM_SECTIONS.every(s => fullSections.has(s));
  }

  /**
   * Sync the user's active_role and roles array based on whether they
   * have been given full access.
   *
   *  Full access → promote to super_admin
   *  Not full    → demote/keep as plain admin
   *
   * Token revocation is NOT done here — the RBAC middleware reads active_role
   * from the DB on every request so changes take effect immediately without
   * forcing a re-login.
   */
  private static async _syncUserAdminLevel(userId: string, isFullAccess: boolean): Promise<void> {
    const targetRole = isFullAccess ? 'super_admin' : 'admin';

    // Read current roles array so we don't lose other roles (e.g. driver, customer)
    const { data: userRow } = await supabase
      .from('users')
      .select('roles')
      .eq('id', userId)
      .single();

    const currentRoles: string[] = (userRow?.roles as string[]) ?? [];

    // Build new roles array: remove both admin tiers, then add the correct one
    const otherRoles = currentRoles.filter(r => r !== 'admin' && r !== 'super_admin');
    const newRoles   = [...otherRoles, targetRole];

    const { error } = await supabase
      .from('users')
      .update({
        roles:       newRoles,
        active_role: targetRole,
        role:        targetRole,   // legacy field kept in sync
        updated_at:  new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      logger.error(`_syncUserAdminLevel: failed to update user ${userId} to ${targetRole}`, { error: error.message });
    } else {
      logger.info(`_syncUserAdminLevel: user ${userId} active_role set to ${targetRole}`);
    }
  }

  private static async _upsertPermissions(roleId: string, permissions: Partial<SectionPermissions>[]) {
    if (!permissions || permissions.length === 0) return;

    const rows = permissions
      .filter(p => p.section && PLATFORM_SECTIONS.includes(p.section as any))
      .map(p => ({
        role_id:    roleId,
        section:    p.section,
        can_view:   p.can_view   ?? false,
        can_create: p.can_create ?? false,
        can_edit:   p.can_edit   ?? false,
        can_delete: p.can_delete ?? false,
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) return;

    const { error } = await supabase
      .from('admin_role_permissions')
      .upsert(rows, { onConflict: 'role_id,section' });

    if (error) throw new Error(`Failed to save permissions: ${error.message}`);
  }
}
