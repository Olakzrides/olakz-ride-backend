/**
 * RBAC Middleware — enforces role-based permissions on every admin API request.
 *
 * Behaviour:
 *  - super_admin → always full access, bypass all checks
 *  - admin with no role assigned → request allowed but req.hasNoRole = true
 *    (controllers return empty data — no 403)
 *  - admin with role assigned → check section + HTTP method permission
 *    → allowed: pass through
 *    → denied:  403 Forbidden
 *
 * active_role is read from the DB on every request (not from JWT)
 * so promotions take effect immediately without forcing re-login.
 */

import { Response, NextFunction } from 'express';
import { AdminRequest } from './auth.middleware';
import { supabase } from '../config/database';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';
import { pathToSection, methodToAction } from '../constants/rbac';

export interface RbacRequest extends AdminRequest {
  hasNoRole?: boolean;           // true = admin has no role assigned yet
  sectionPermissions?: Record<string, {
    can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean;
  }>;
}

/**
 * Returns an empty success response when the admin has no role assigned.
 * Controllers call this at the start of any data-returning method.
 *
 * Usage:
 *   if (emptyIfNoRole(req, res, { rides: [], pagination: { total: 0 } })) return;
 */
export function emptyIfNoRole(req: RbacRequest, res: Response, emptyData: unknown): boolean {
  if ((req as any).hasNoRole) {
    const { ResponseUtil } = require('../utils/response');
    ResponseUtil.success(res, emptyData, 'Welcome to your admin dashboard');
    return true;
  }
  return false;
}

export const rbacMiddleware = async (
  req: RbacRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;
    if (!user) { ResponseUtil.unauthorized(res); return; }

    // 1. Read active_role from DB (not JWT) so promotions are instant
    const { data: userRow } = await supabase
      .from('users')
      .select('active_role, roles')
      .eq('id', user.id)
      .single();

    const activeRole = userRow?.active_role ?? 'customer';
    const roles: string[] = userRow?.roles ?? [];

    // 2. super_admin bypasses all RBAC checks — full access always
    if (activeRole === 'super_admin' || roles.includes('super_admin')) {
      req.hasNoRole = false;
      next();
      return;
    }

    // 3. Determine which section this request targets
    const section = pathToSection(req.path);
    const action  = methodToAction(req.method);

    // 4. Fetch the admin's assigned role_id from admin_user_roles
    const { data: userRoleRow } = await supabase
      .from('admin_user_roles')
      .select('role_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // 5. No role assigned → allow request but flag it; controllers return empty data
    if (!userRoleRow) {
      req.hasNoRole = true;
      next();
      return;
    }

    // 5b. Verify the role is still active
    const { data: roleRow } = await supabase
      .from('admin_system_roles')
      .select('id, name, is_active')
      .eq('id', userRoleRow.role_id)
      .maybeSingle();

    if (!roleRow || !roleRow.is_active) {
      req.hasNoRole = true;
      next();
      return;
    }

    // 5c. Fetch permissions directly for this role_id
    const { data: permRows } = await supabase
      .from('admin_role_permissions')
      .select('section, can_view, can_create, can_edit, can_delete')
      .eq('role_id', userRoleRow.role_id);

    // Build permissions map for easy lookup
    const permissions: Record<string, any> = {};
    for (const p of permRows ?? []) {
      permissions[p.section] = p;
    }
    req.sectionPermissions = permissions;
    req.hasNoRole = false;

    // 6. No section match (e.g. health check, root) → allow
    if (!section) { next(); return; }

    const sectionPerm = permissions[section];

    // 7. Section not in role at all → deny
    if (!sectionPerm) {
      ResponseUtil.forbidden(res, `You do not have access to the ${section} section`, 'RBAC_DENIED');
      return;
    }

    // 8. Check specific action permission
    if (!sectionPerm[action]) {
      const actionLabel = action.replace('can_', '');
      ResponseUtil.forbidden(
        res,
        `Your role does not have permission to ${actionLabel} in the ${section} section`,
        'RBAC_ACTION_DENIED'
      );
      return;
    }

    next();
  } catch (err: any) {
    logger.error('RBAC middleware error', { error: err.message });
    // Fail open — don't block admin if RBAC check itself fails
    next();
  }
};
