import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';
import { supabase } from '../config/database';

function toMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class PromoteController {

  /**
   * POST /api/admin/users/:userId/promote-to-admin
   *
   * Instantly promotes a customer to admin.
   * - Adds 'admin' to their roles array
   * - Sets active_role = 'admin' immediately (takes effect on next API call)
   * - Does NOT change their password — they use their existing app password
   * - No role assigned yet — they see empty data until super admin assigns one
   */
  promoteToAdmin = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const superAdminId = req.user!.id;

      // Prevent super admin from promoting themselves (already admin)
      if (userId === superAdminId) {
        ResponseUtil.badRequest(res, 'You cannot promote yourself');
        return;
      }

      // Fetch the user
      const { data: user, error: fetchErr } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, roles, active_role, status')
        .eq('id', userId)
        .single();

      if (fetchErr || !user) {
        ResponseUtil.notFound(res, 'User');
        return;
      }

      const u = user as Record<string, any>;

      if (u.status === 'account_deleted') {
        ResponseUtil.badRequest(res, 'Cannot promote a deleted account');
        return;
      }

      if (u.status === 'suspended') {
        ResponseUtil.badRequest(res, 'Cannot promote a suspended account. Unsuspend first.');
        return;
      }

      const currentRoles: string[] = u.roles ?? ['customer'];

      // Already an admin — no-op
      if (currentRoles.includes('admin') || currentRoles.includes('super_admin')) {
        ResponseUtil.badRequest(res, 'This user already has an admin role', 'ALREADY_ADMIN');
        return;
      }

      // Add 'admin' role, change active_role to 'admin' immediately
      const newRoles = [...new Set([...currentRoles, 'admin'])];

      const { data: updated, error: updateErr } = await supabase
        .from('users')
        .update({
          roles:       newRoles,
          active_role: 'admin',
          role:        'admin',    // legacy field
          updated_at:  new Date().toISOString(),
        })
        .eq('id', userId)
        .select('id, email, first_name, last_name, roles, active_role, status')
        .single();

      if (updateErr || !updated) {
        throw new Error(`Failed to promote user: ${updateErr?.message}`);
      }

      logger.info('User promoted to admin', { userId, promotedBy: superAdminId });

      ResponseUtil.success(res, {
        user: updated,
        message: `${(u.first_name ?? '').trim()} ${(u.last_name ?? '').trim()} has been promoted to admin. Assign a role to grant them access.`,
      }, 'User promoted to admin successfully');
    } catch (err) {
      logger.error('promoteToAdmin error', { error: toMsg(err) });
      ResponseUtil.serverError(res, 'Failed to promote user to admin');
    }
  };
}
