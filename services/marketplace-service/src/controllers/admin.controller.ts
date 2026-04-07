import { Request, Response } from 'express';
import { AdminService } from '../services/admin.service';
import { AnalyticsService } from '../services/analytics.service';
import { ResponseUtil } from '../utils/response';

export class AdminController {
  getStores = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await AdminService.getStores({
        status: req.query.status as string,
        categoryId: req.query.category_id as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getOrders = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await AdminService.getOrders({
        status: req.query.status as string,
        storeId: req.query.store_id as string,
        dateFrom: req.query.date_from as string,
        dateTo: req.query.date_to as string,
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  setStoreStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { is_active } = req.body;
      if (is_active === undefined) return ResponseUtil.badRequest(res, 'is_active is required');
      await AdminService.setStoreStatus(req.params.id, is_active);
      return ResponseUtil.success(res, null, `Store ${is_active ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      if (err.message === 'Store not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getAnalytics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const result = await AnalyticsService.adminAnalytics(
        req.query.date_from as string,
        req.query.date_to as string
      );
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
