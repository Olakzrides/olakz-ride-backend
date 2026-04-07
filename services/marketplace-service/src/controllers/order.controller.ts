import { Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { RiderDeliveryService } from '../services/rider-delivery.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class OrderController {
  estimate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { store_id, items, delivery_address } = req.body;
      if (!store_id || !items || !delivery_address) return ResponseUtil.badRequest(res, 'store_id, items and delivery_address are required');
      const result = await OrderService.estimateTotal({ storeId: store_id, items, deliveryAddress: delivery_address });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      if (err.message === 'Store not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  placeOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const { store_id, items, delivery_address, payment_method = 'wallet', special_instructions } = req.body;
      if (!store_id || !items || !delivery_address) return ResponseUtil.badRequest(res, 'store_id, items and delivery_address are required');
      if (payment_method !== 'wallet') return ResponseUtil.badRequest(res, 'Only wallet payment is supported');

      const order = await OrderService.placeOrder({ customerId, storeId: store_id, items, deliveryAddress: delivery_address, paymentMethod: 'wallet', specialInstructions: special_instructions });
      return ResponseUtil.created(res, { order }, 'Order placed successfully');
    } catch (err: any) {
      if (err.message?.includes('Insufficient')) return ResponseUtil.badRequest(res, err.message);
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('closed') || err.message?.includes('not active') || err.message?.includes('not available') || err.message?.includes('not configured') || err.message?.includes('at least one')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const order = await OrderService.getOrder(req.params.id, userId, 'customer');
      if (!order) return ResponseUtil.notFound(res, 'Order not found');
      return ResponseUtil.success(res, { order });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const { status, limit, page } = req.query;
      const result = await OrderService.getCustomerHistory({
        customerId,
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string) : 10,
        page: page ? parseInt(page as string) : 1,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  cancelOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const { reason } = req.body;
      if (!reason) return ResponseUtil.badRequest(res, 'reason is required');
      const result = await OrderService.cancelOrder(req.params.id, customerId, reason);
      return ResponseUtil.success(res, result, 'Order cancelled');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot cancel') || err.message === 'Unauthorized') return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}

// These methods are added to the OrderController class via module augmentation
// They are exported as standalone functions and wired in routes

export const getTracking = async (req: Request, res: Response): Promise<Response> => {
  try {
    const tracking = await RiderDeliveryService.getTracking(req.params.id);
    if (!tracking) return ResponseUtil.notFound(res, 'Order not found');
    return ResponseUtil.success(res, tracking);
  } catch (err: any) {
    return ResponseUtil.serverError(res, err.message);
  }
};

export const getReceipt = async (req: Request, res: Response): Promise<Response> => {
  try {
    const receipt = await RiderDeliveryService.getReceipt(req.params.id);
    if (!receipt) return ResponseUtil.notFound(res, 'Order not found');
    return ResponseUtil.success(res, receipt);
  } catch (err: any) {
    return ResponseUtil.serverError(res, err.message);
  }
};
