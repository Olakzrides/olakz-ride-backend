import { Request, Response } from 'express';
import { VendorOrderService } from '../services/vendor-order.service';
import { StoreService } from '../services/store.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class VendorOrderController {
  private static async getStoreId(req: Request, res: Response): Promise<string | null> {
    const ownerId = (req as AuthRequest).user!.id;
    const store = await StoreService.getByOwnerId(ownerId);
    if (!store) {
      ResponseUtil.notFound(res, 'No store found for this vendor');
      return null;
    }
    return store.id;
  }

  getOrders = async (req: Request, res: Response): Promise<Response> => {
    try {
      const storeId = await VendorOrderController.getStoreId(req, res);
      if (!storeId) return res as any;
      const { status, date_from, date_to, limit, page } = req.query;
      const result = await VendorOrderService.getOrders(storeId, {
        status: status as string | undefined,
        dateFrom: date_from as string | undefined,
        dateTo: date_to as string | undefined,
        limit: limit ? parseInt(limit as string) : 20,
        page: page ? parseInt(page as string) : 1,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const storeId = await VendorOrderController.getStoreId(req, res);
      if (!storeId) return res as any;
      const order = await VendorOrderService.getOrder(req.params.id, storeId);
      if (!order) return ResponseUtil.notFound(res, 'Order not found');
      return ResponseUtil.success(res, { order });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  acceptOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = (req as AuthRequest).user!.id;
      const storeId = await VendorOrderController.getStoreId(req, res);
      if (!storeId) return res as any;
      await VendorOrderService.acceptOrder(req.params.id, storeId, vendorId);
      return ResponseUtil.success(res, null, 'Order accepted');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot accept')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  rejectOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = (req as AuthRequest).user!.id;
      const storeId = await VendorOrderController.getStoreId(req, res);
      if (!storeId) return res as any;
      const { rejection_reason } = req.body;
      if (!rejection_reason) return ResponseUtil.badRequest(res, 'rejection_reason is required');
      await VendorOrderService.rejectOrder(req.params.id, storeId, vendorId, rejection_reason);
      return ResponseUtil.success(res, null, 'Order rejected and customer refunded');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot reject')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  markReady = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = (req as AuthRequest).user!.id;
      const storeId = await VendorOrderController.getStoreId(req, res);
      if (!storeId) return res as any;
      await VendorOrderService.markReady(req.params.id, storeId, vendorId);
      return ResponseUtil.success(res, null, 'Order marked as ready for pickup');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
