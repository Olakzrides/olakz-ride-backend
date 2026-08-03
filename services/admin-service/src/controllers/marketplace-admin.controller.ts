import { Request, Response } from 'express';
import { MarketplaceAdminService } from '../services/marketplace-admin.service';
import { ResponseUtil } from '../utils/response';
import { emptyIfNoRole } from '../middleware/rbac.middleware';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class MarketplaceAdminController {
  getStores = async (req: Request, res: Response): Promise<void> => {
    if (emptyIfNoRole(req as any, res, { stores: [], total: 0, page: 1, limit: 20, totalPages: 0 })) return;
    try {
      const result = await MarketplaceAdminService.getStores({
        status: req.query.status as string,
        categoryId: req.query.category_id as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('getStores error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await MarketplaceAdminService.getOrders({
        status: req.query.status as string,
        storeId: req.query.store_id as string,
        dateFrom: req.query.date_from as string,
        dateTo: req.query.date_to as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('getOrders error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getOrderStatusCounts = async (req: Request, res: Response): Promise<void> => {
    try {
      const counts = await MarketplaceAdminService.getStatusCounts({
        storeId:  req.query.store_id  as string | undefined,
        dateFrom: req.query.date_from as string | undefined,
        dateTo:   req.query.date_to   as string | undefined,
      });
      ResponseUtil.success(res, counts, 'Marketplace order status counts retrieved');
    } catch (err: unknown) {
      logger.error('getOrderStatusCounts error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getOrderById = async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await MarketplaceAdminService.getOrderById(req.params.id);
      ResponseUtil.success(res, { order }, 'Marketplace order detail retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Order not found') { ResponseUtil.notFound(res, 'Order'); return; }
      logger.error('getOrderById error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  setStoreStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { is_active } = req.body;
      if (is_active === undefined) { ResponseUtil.badRequest(res, 'is_active is required'); return; }
      await MarketplaceAdminService.setStoreStatus(req.params.id, is_active);
      ResponseUtil.success(res, null, `Store ${is_active ? 'activated' : 'deactivated'}`);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Store not found') { ResponseUtil.notFound(res, 'Store'); return; }
      logger.error('setStoreStatus error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  getAnalytics = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await MarketplaceAdminService.getAnalytics(
        req.query.date_from as string,
        req.query.date_to as string
      );
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('getAnalytics error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
