import { Request, Response } from 'express';
import { FoodAdminService } from '../services/food-admin.service';
import { ResponseUtil } from '../utils/response';

export class FoodAdminController {
  getOrders = async (req: Request, res: Response): Promise<Response> => {
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
      return ResponseUtil.success(res, result);
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  updateOrderStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const adminId = (req as any).user!.id;
      const { status } = req.body;
      if (!status) return ResponseUtil.badRequest(res, 'status is required');
      const order = await FoodAdminService.updateOrderStatus(req.params.id, status, adminId);
      return ResponseUtil.success(res, { order }, 'Order status updated');
    } catch (e: any) {
      if (e.message === 'Order not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  getVendors = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { is_verified, is_active, page, limit } = req.query;
      const result = await FoodAdminService.getVendors({
        is_verified: is_verified !== undefined ? is_verified === 'true' : undefined,
        is_active: is_active !== undefined ? is_active === 'true' : undefined,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });
      return ResponseUtil.success(res, result);
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  approveVendor = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendor = await FoodAdminService.approveVendor(req.params.id);
      return ResponseUtil.success(res, { vendor }, 'Vendor approved');
    } catch (e: any) {
      if (e.message === 'Restaurant not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  suspendVendor = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { reason } = req.body;
      const vendor = await FoodAdminService.suspendVendor(req.params.id, reason);
      return ResponseUtil.success(res, { vendor }, 'Vendor suspended');
    } catch (e: any) {
      if (e.message === 'Restaurant not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  getCouriers = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { page, limit } = req.query;
      const result = await FoodAdminService.getCouriers({
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });
      return ResponseUtil.success(res, result);
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  getAnalytics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const data = await FoodAdminService.getAnalytics();
      return ResponseUtil.success(res, data);
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };
}
