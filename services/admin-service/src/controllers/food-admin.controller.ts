import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { FoodAdminService } from '../services/food-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class FoodAdminController {
  getOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, restaurant_id, from, to, page, limit } = req.query;
      const result = await FoodAdminService.getOrders({
        status: status as string,
        restaurant_id: restaurant_id as string,
        from: from as string,
        to: to as string,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('getOrders error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  updateOrderStatus = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { status } = req.body;
      if (!status) { ResponseUtil.badRequest(res, 'status is required'); return; }
      const order = await FoodAdminService.updateOrderStatus(req.params.id, status, adminId);
      ResponseUtil.success(res, { order }, 'Order status updated');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Order not found') { ResponseUtil.notFound(res, 'Order'); return; }
      logger.error('updateOrderStatus error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  getVendors = async (req: Request, res: Response): Promise<void> => {
    try {
      const { is_verified, is_active, page, limit } = req.query;
      const result = await FoodAdminService.getVendors({
        is_verified: is_verified !== undefined ? is_verified === 'true' : undefined,
        is_active: is_active !== undefined ? is_active === 'true' : undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('getVendors error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  approveVendor = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendor = await FoodAdminService.approveVendor(req.params.id);
      ResponseUtil.success(res, { vendor }, 'Vendor approved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Restaurant not found') { ResponseUtil.notFound(res, 'Restaurant'); return; }
      logger.error('approveVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  suspendVendor = async (req: Request, res: Response): Promise<void> => {
    try {
      const { reason } = req.body;
      const vendor = await FoodAdminService.suspendVendor(req.params.id, reason);
      ResponseUtil.success(res, { vendor }, 'Vendor suspended');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Restaurant not found') { ResponseUtil.notFound(res, 'Restaurant'); return; }
      logger.error('suspendVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  getCouriers = async (req: Request, res: Response): Promise<void> => {
    try {
      const { page, limit } = req.query;
      const result = await FoodAdminService.getCouriers({
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('getCouriers error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getAnalytics = async (_req: Request, res: Response): Promise<void> => {
    try {
      const data = await FoodAdminService.getAnalytics();
      ResponseUtil.success(res, data);
    } catch (err: unknown) {
      logger.error('getAnalytics error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getOrderTrends = async (req: Request, res: Response): Promise<void> => {
    try {
      const { from, to, restaurant_id } = req.query;
      const data = await FoodAdminService.getOrderTrends({
        from: from as string,
        to: to as string,
        restaurant_id: restaurant_id as string,
      });
      ResponseUtil.success(res, data);
    } catch (err: unknown) {
      logger.error('getOrderTrends error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
