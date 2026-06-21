import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { PromoAdminService } from '../services/promo-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class PromoAdminController {

  /**
   * GET /api/admin/promos
   * List all signup promo campaigns.
   *
   * Query params:
   *   is_active - true | false (optional)
   *   page      - default 1
   *   limit     - default 20
   */
  getAll = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      let is_active: boolean | undefined;
      if (req.query.is_active === 'true')  is_active = true;
      if (req.query.is_active === 'false') is_active = false;

      const result = await PromoAdminService.getAll({ is_active, page, limit });
      ResponseUtil.success(res, result, 'Promo campaigns retrieved');
    } catch (err: unknown) {
      logger.error('getAll promos error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch promos', 'PROMOS_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/promos/active
   * Returns the currently active promo (if any).
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
   * Single promo detail with claim stats.
   */
  getById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { promoId } = req.params;
      const promo = await PromoAdminService.getById(promoId);
      if (!promo) {
        ResponseUtil.notFound(res, 'Promo');
        return;
      }
      ResponseUtil.success(res, { promo }, 'Promo retrieved');
    } catch (err: unknown) {
      logger.error('getById promo error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch promo', 'PROMO_FETCH_ERROR');
    }
  };

  /**
   * POST /api/admin/promos
   * Create a new signup promo campaign.
   *
   * Body: { name, promo_amount, total_budget_cap, starts_at, ends_at }
   */
  create = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const { name, promo_amount, total_budget_cap, starts_at, ends_at } = req.body;

      const promo = await PromoAdminService.create({
        name,
        promo_amount,
        total_budget_cap,
        starts_at,
        ends_at,
        created_by: adminId,
      });

      logger.info('Admin created promo campaign', { adminId, promoId: promo.id, name });
      ResponseUtil.created(res, { promo }, 'Promo campaign created successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (
        msg.includes('required') ||
        msg.includes('must be') ||
        msg.includes('positive') ||
        msg.includes('after')
      ) {
        ResponseUtil.badRequest(res, msg, 'PROMO_VALIDATION_ERROR');
        return;
      }
      logger.error('create promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to create promo', 'PROMO_CREATE_ERROR');
    }
  };

  /**
   * PATCH /api/admin/promos/:promoId
   * Update promo metadata (must be inactive).
   *
   * Body (all optional): { name, promo_amount, total_budget_cap, starts_at, ends_at }
   */
  update = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const { promoId } = req.params;
      const { name, promo_amount, total_budget_cap, starts_at, ends_at } = req.body;

      const promo = await PromoAdminService.update(promoId, {
        name,
        promo_amount,
        total_budget_cap,
        starts_at,
        ends_at,
      }, adminId);

      ResponseUtil.success(res, { promo }, 'Promo campaign updated successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (
        msg.includes('active') ||
        msg.includes('must be') ||
        msg.includes('after')
      ) {
        ResponseUtil.badRequest(res, msg, 'PROMO_UPDATE_ERROR');
        return;
      }
      logger.error('update promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to update promo', 'PROMO_UPDATE_ERROR');
    }
  };

  /**
   * PATCH /api/admin/promos/:promoId/activate
   * Activate a promo campaign. Only one can be active at a time.
   */
  activate = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const { promoId } = req.params;
      const promo = await PromoAdminService.activate(promoId, adminId);

      ResponseUtil.success(res, { promo }, 'Promo campaign activated. New signups will receive the promo credit.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (
        msg.includes('already active') ||
        msg.includes('Another promo') ||
        msg.includes('expired')
      ) {
        ResponseUtil.badRequest(res, msg, 'PROMO_ACTIVATE_ERROR');
        return;
      }
      logger.error('activate promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to activate promo', 'PROMO_ACTIVATE_ERROR');
    }
  };

  /**
   * PATCH /api/admin/promos/:promoId/deactivate
   * Deactivate a promo campaign.
   */
  deactivate = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const { promoId } = req.params;
      const promo = await PromoAdminService.deactivate(promoId, adminId);

      ResponseUtil.success(res, { promo }, 'Promo campaign deactivated');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (msg.includes('already inactive')) {
        ResponseUtil.badRequest(res, msg, 'PROMO_DEACTIVATE_ERROR');
        return;
      }
      logger.error('deactivate promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to deactivate promo', 'PROMO_DEACTIVATE_ERROR');
    }
  };

  /**
   * DELETE /api/admin/promos/:promoId
   * Hard-delete a promo (only if inactive and zero claims).
   */
  delete = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const { promoId } = req.params;
      await PromoAdminService.delete(promoId, adminId);

      ResponseUtil.success(res, { deleted: true }, 'Promo campaign deleted');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (msg.includes('active') || msg.includes('claimed')) {
        ResponseUtil.badRequest(res, msg, 'PROMO_DELETE_ERROR');
        return;
      }
      logger.error('delete promo error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to delete promo', 'PROMO_DELETE_ERROR');
    }
  };

  /**
   * GET /api/admin/promos/:promoId/claims
   * Paginated list of users who claimed this promo.
   *
   * Query params:
   *   page  - default 1
   *   limit - default 20
   */
  getClaims = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { promoId } = req.params;
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await PromoAdminService.getClaims(promoId, { page, limit });
      ResponseUtil.success(res, result, 'Promo claims retrieved');
    } catch (err: unknown) {
      logger.error('getClaims error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch promo claims', 'PROMO_CLAIMS_FETCH_ERROR');
    }
  };
}
