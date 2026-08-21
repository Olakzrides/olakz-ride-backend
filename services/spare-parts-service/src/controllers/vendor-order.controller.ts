import { Request, Response } from 'express';
import { VendorOrderService } from '../services/vendor-order.service';
import { ResponseUtil } from '../utils/response.util';

export class VendorOrderController {
  // GET /api/spare-parts/vendor/orders
  // Query: status, limit, page
  getOrders = async (req: Request, res: Response): Promise<Response> => {
    try {
      const storeId          = (req as any).storeId as string;
      const { status, limit, page } = req.query;

      const result = await VendorOrderService.listOrders(storeId, {
        status: status as string | undefined,
        limit:  limit  ? parseInt(limit as string) : 20,
        page:   page   ? parseInt(page  as string) : 1,
      });

      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/vendor/orders/:id
  getOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const storeId = (req as any).storeId as string;
      const order   = await VendorOrderService.getOrder(req.params.id, storeId);
      if (!order) return ResponseUtil.notFound(res, 'Order not found');
      return ResponseUtil.success(res, { order });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // POST /api/spare-parts/vendor/orders/:id/accept
  acceptOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const storeId = (req as any).storeId as string;
      const result  = await VendorOrderService.acceptOrder(req.params.id, storeId);
      return ResponseUtil.success(res, result, 'Order accepted');
    } catch (err: any) {
      if (err.message === 'Order not found')        return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot accept'))   return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // POST /api/spare-parts/vendor/orders/:id/reject
  // Body: { reason }
  rejectOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const storeId      = (req as any).storeId as string;
      const { reason }   = req.body;

      if (!reason) {
        return ResponseUtil.badRequest(res, 'reason is required');
      }

      const result = await VendorOrderService.rejectOrder(req.params.id, storeId, reason);
      return ResponseUtil.success(res, result, 'Order rejected');
    } catch (err: any) {
      if (err.message === 'Order not found')        return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot reject'))   return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // PUT /api/spare-parts/vendor/orders/:id/ready
  markReady = async (req: Request, res: Response): Promise<Response> => {
    try {
      const storeId = (req as any).storeId as string;
      const result  = await VendorOrderService.markReady(req.params.id, storeId);
      return ResponseUtil.success(res, result, 'Order marked as ready for pickup');
    } catch (err: any) {
      if (err.message === 'Order not found')          return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot mark ready')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
