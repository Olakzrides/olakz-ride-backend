import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { PromoAdminService } from '../services/promo-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isValidationError(msg: string): boolean {
  return (
    msg.includes('required') ||
    msg.includes('must be') ||
    msg.includes('positive') ||
    msg.includes('after') ||
    msg.includes('overlaps') ||
    msg.includes('Cannot') ||
    msg.includes('Only') ||
    msg.includes('already')
  );
}

export class PromoAdminController {

  /**
   * GET /api/admin/promos
   * List all signup promo campaigns.
   *
   * Query params:
   *   status - scheduled | active | paused | ended | deactivated | all
   *   page   - default 1
   *   limit  - default 20
   */
  getAll = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const status = req.query.status as string | undefined;

      const result = await PromoAdminService.getAll({ status, page, limit });
      ResponseUtil.success(res, result, 'Promo campaigns retrieved');
    } catch (err: unknown) {
      logger.error('getAll promos error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch promos', 'PROMOS_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/promos/active
   * Returns the currently effective-active promo (if any).
   */
  getActive = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const promo = await PromoAdminService.getActivePromo();
      ResponseUtil.success(
        res,
        { promo: promo ?? null },
        promo ? 'Active promo retrieved' : 'No active promo at this time'
      );
    } catch (err: unknown) {
      logger.error('getActivePromo error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch active promo', 'PROMO_ACTIVE_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/promos/:promoId
   * Single promo detail with claim stats and effective_status.
   */
  getById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const promo = await PromoAdminService.getById(req.params.promoId);
      if (!promo) { ResponseUtil.notFound(res, 'Promo'); return; }
      ResponseUtil.success(res, { promo }, 'Promo retrieved');
    } catch (err: unknown) {
      logger.error('getById promo error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch promo', 'PROMO_FETCH_ERROR');
    }
  };

  /**
   * POST /api/admin/promos
   * Create a new signup promo. Starts as 'scheduled' — auto-activates on starts_at.
   *
   * Body: { name, promo_amount, total_budget_cap, starts_at, ends_at }
   */
  create = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res, 'Admin authentication required'); return; }

      const { name, promo_amount, total_budget_cap, starts_at, ends_at } = req.body;
      const promo = await PromoAdminService.create({
        name, promo_amount, total_budget_cap, starts_at, ends_at, created_by: adminId,
      });

      logger.info('Admin created promo campaign', { adminId, promoId: (promo as any).id });
      ResponseUtil.created(res, { promo },
        'Promo campaign created. It will activate automatically when starts_at is reached.'
      );
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg, 'PROMO_VALIDATION_ERROR'); return; }
      logger.error('create promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to create promo', 'PROMO_CREATE_ERROR');
    }
  };

  /**
   * PATCH /api/admin/promos/:promoId
   * Update promo metadata. Allowed when scheduled or paused.
   *
   * Body (all optional): { name, promo_amount, total_budget_cap, starts_at, ends_at }
   */
  update = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res, 'Admin authentication required'); return; }

      const { name, promo_amount, total_budget_cap, starts_at, ends_at } = req.body;
      const promo = await PromoAdminService.update(
        req.params.promoId,
        { name, promo_amount, total_budget_cap, starts_at, ends_at },
        adminId
      );
      ResponseUtil.success(res, { promo }, 'Promo campaign updated');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg, 'PROMO_UPDATE_ERROR'); return; }
      logger.error('update promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to update promo', 'PROMO_UPDATE_ERROR');
    }
  };

  /**
   * PATCH /api/admin/promos/:promoId/pause
   * Temporarily pause a running promo. New signups won't receive the credit while paused.
   * Can be resumed.
   */
  pause = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res, 'Admin authentication required'); return; }

      const promo = await PromoAdminService.pause(req.params.promoId, adminId);
      ResponseUtil.success(res, { promo }, 'Promo campaign paused. New signups will not receive the credit until resumed.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg, 'PROMO_PAUSE_ERROR'); return; }
      logger.error('pause promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to pause promo', 'PROMO_PAUSE_ERROR');
    }
  };

  /**
   * PATCH /api/admin/promos/:promoId/resume
   * Resume a paused promo. Returns to auto-active state based on date window.
   */
  resume = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res, 'Admin authentication required'); return; }

      const promo = await PromoAdminService.resume(req.params.promoId, adminId);
      ResponseUtil.success(res, { promo }, 'Promo campaign resumed. New signups will receive the credit again.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg, 'PROMO_RESUME_ERROR'); return; }
      logger.error('resume promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to resume promo', 'PROMO_RESUME_ERROR');
    }
  };

  /**
   * PATCH /api/admin/promos/:promoId/end
   * Permanently end a promo. Cannot be undone.
   * Valid from active, paused, or scheduled.
   */
  end = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res, 'Admin authentication required'); return; }

      const promo = await PromoAdminService.end(req.params.promoId, adminId);
      ResponseUtil.success(res, { promo }, 'Promo campaign ended permanently.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg, 'PROMO_END_ERROR'); return; }
      logger.error('end promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to end promo', 'PROMO_END_ERROR');
    }
  };

  /**
   * PATCH /api/admin/promos/:promoId/deactivate
   * Cancel a scheduled (not-yet-started) promo.
   * Use this before the promo starts. After it starts, use pause or end.
   */
  deactivate = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res, 'Admin authentication required'); return; }

      const promo = await PromoAdminService.deactivate(req.params.promoId, adminId);
      ResponseUtil.success(res, { promo }, 'Promo campaign deactivated before it started.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg, 'PROMO_DEACTIVATE_ERROR'); return; }
      logger.error('deactivate promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to deactivate promo', 'PROMO_DEACTIVATE_ERROR');
    }
  };

  /**
   * DELETE /api/admin/promos/:promoId
   * Hard-delete a promo (only if deactivated or scheduled with zero claims).
   */
  delete = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res, 'Admin authentication required'); return; }

      await PromoAdminService.delete(req.params.promoId, adminId);
      ResponseUtil.success(res, { deleted: true }, 'Promo campaign deleted');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg, 'PROMO_DELETE_ERROR'); return; }
      logger.error('delete promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to delete promo', 'PROMO_DELETE_ERROR');
    }
  };

  /**
   * GET /api/admin/promos/:promoId/claims
   * Paginated list of users who claimed this promo.
   */
  getClaims = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
      const result = await PromoAdminService.getClaims(req.params.promoId, { page, limit });
      ResponseUtil.success(res, result, 'Promo claims retrieved');
    } catch (err: unknown) {
      logger.error('getClaims error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch promo claims', 'PROMO_CLAIMS_FETCH_ERROR');
    }
  };
}
