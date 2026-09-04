import { Request, Response } from 'express';
import { SparePartsAdminService } from '../services/spare-parts-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class SparePartsAdminController {
  // ─── Stores ──────────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/spare-parts/stores
   * Query: status (active|inactive|verified|unverified), city, page, limit
   */
  getStores = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await SparePartsAdminService.getStores({
        status: req.query.status as string | undefined,
        city:   req.query.city   as string | undefined,
        page:   parseInt(req.query.page  as string) || 1,
        limit:  parseInt(req.query.limit as string) || 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('spareParts getStores error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/admin/spare-parts/stores/:id
   * Full store detail — owner, documents, wallet, stats
   */
  getStoreById = async (req: Request, res: Response): Promise<void> => {
    try {
      const store = await SparePartsAdminService.getStoreById(req.params.id);
      ResponseUtil.success(res, { store });
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Store not found') { ResponseUtil.notFound(res, 'Store'); return; }
      logger.error('spareParts getStoreById error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  /**
   * PATCH /api/admin/spare-parts/stores/:id/status
   * Body: { is_active: boolean }
   * Activate or deactivate a store
   */
  setStoreStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { is_active } = req.body;
      if (is_active === undefined) { ResponseUtil.badRequest(res, 'is_active is required'); return; }
      await SparePartsAdminService.setStoreStatus(req.params.id, Boolean(is_active));
      ResponseUtil.success(res, null, `Store ${is_active ? 'activated' : 'deactivated'}`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Store not found') { ResponseUtil.notFound(res, 'Store'); return; }
      logger.error('spareParts setStoreStatus error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  /**
   * PATCH /api/admin/spare-parts/stores/:id/verify
   * Body: { is_verified: boolean }
   * Approve or revoke store verification (equivalent to approve/reject for car-wash)
   */
  setStoreVerified = async (req: Request, res: Response): Promise<void> => {
    try {
      const { is_verified } = req.body;
      if (is_verified === undefined) { ResponseUtil.badRequest(res, 'is_verified is required'); return; }
      await SparePartsAdminService.setStoreVerified(req.params.id, Boolean(is_verified));
      ResponseUtil.success(res, null, `Store ${is_verified ? 'verified' : 'unverified'}`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Store not found') { ResponseUtil.notFound(res, 'Store'); return; }
      logger.error('spareParts setStoreVerified error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  /**
   * GET /api/admin/spare-parts/stores/:id/orders
   * Booking/order history for a specific store
   * Query: status, date_from, date_to, page, limit
   */
  getStoreOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await SparePartsAdminService.getStoreOrders(req.params.id, {
        status:   req.query.status    as string | undefined,
        dateFrom: req.query.date_from as string | undefined,
        dateTo:   req.query.date_to   as string | undefined,
        page:     parseInt(req.query.page  as string) || 1,
        limit:    parseInt(req.query.limit as string) || 20,
      });
      ResponseUtil.success(res, result, 'Store order history retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Store not found') { ResponseUtil.notFound(res, 'Store'); return; }
      logger.error('spareParts getStoreOrders error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  // ─── Orders ──────────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/spare-parts/orders/counts
   * Query: store_id, date_from, date_to
   */
  getOrderStatusCounts = async (req: Request, res: Response): Promise<void> => {
    try {
      const counts = await SparePartsAdminService.getOrderStatusCounts({
        storeId:  req.query.store_id  as string | undefined,
        dateFrom: req.query.date_from as string | undefined,
        dateTo:   req.query.date_to   as string | undefined,
      });
      ResponseUtil.success(res, counts, 'Spare parts order status counts retrieved');
    } catch (err: unknown) {
      logger.error('spareParts getOrderStatusCounts error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/admin/spare-parts/orders
   * Query: status, store_id, date_from, date_to, page, limit
   */
  getOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await SparePartsAdminService.getOrders({
        status:   req.query.status    as string | undefined,
        storeId:  req.query.store_id  as string | undefined,
        dateFrom: req.query.date_from as string | undefined,
        dateTo:   req.query.date_to   as string | undefined,
        page:     parseInt(req.query.page  as string) || 1,
        limit:    parseInt(req.query.limit as string) || 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('spareParts getOrders error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/admin/spare-parts/orders/:id
   */
  getOrderById = async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await SparePartsAdminService.getOrderById(req.params.id);
      ResponseUtil.success(res, { order }, 'Spare parts order detail retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Order not found') { ResponseUtil.notFound(res, 'Order'); return; }
      logger.error('spareParts getOrderById error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  // ─── Analytics ────────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/spare-parts/analytics
   * Query: date_from, date_to
   */
  getAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await SparePartsAdminService.getAnalytics(
        req.query.date_from as string | undefined,
        req.query.date_to   as string | undefined,
      );
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('spareParts getAnalytics error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
