import { Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { ResponseUtil } from '../utils/response.util';
import { AuthRequest } from '../middleware/auth.middleware';

export class OrderController {
  // POST /api/spare-parts/payment/estimate
  // Body: { store_id, items, delivery_address, vehicle_type? }
  estimate = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { store_id, items, delivery_address, vehicle_type } = req.body;

      if (!store_id || !items || !delivery_address) {
        return ResponseUtil.badRequest(
          res,
          'store_id, items and delivery_address are required'
        );
      }

      const result = await OrderService.estimateTotal({
        storeId:         store_id,
        items,
        deliveryAddress: delivery_address,
        vehicleType:     vehicle_type,
      });

      return ResponseUtil.success(res, result);
    } catch (err: any) {
      if (err.message === 'Store not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // POST /api/spare-parts/orders
  // Body: { store_id, items, delivery_address, payment_method, special_instructions?, vehicle_type? }
  placeOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const {
        store_id, items, delivery_address,
        payment_method = 'wallet',
        special_instructions,
        vehicle_type,
      } = req.body;

      if (!store_id || !items || !delivery_address) {
        return ResponseUtil.badRequest(
          res,
          'store_id, items and delivery_address are required'
        );
      }

      if (!['wallet', 'cash'].includes(payment_method)) {
        return ResponseUtil.badRequest(
          res,
          'payment_method must be wallet or cash'
        );
      }

      const order = await OrderService.placeOrder({
        customerId,
        storeId:             store_id,
        items,
        deliveryAddress:     delivery_address,
        paymentMethod:       payment_method as 'wallet' | 'cash',
        specialInstructions: special_instructions,
        vehicleType:         vehicle_type,
      });

      return ResponseUtil.created(res, { order }, 'Order placed successfully');
    } catch (err: any) {
      if (err.message?.includes('Insufficient'))   return ResponseUtil.badRequest(res, err.message);
      if (err.message?.includes('not found'))      return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('closed')
        || err.message?.includes('not active')
        || err.message?.includes('not available')
        || err.message?.includes('not configured')
        || err.message?.includes('at least one')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/orders/:id
  getOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const order  = await OrderService.getOrder(req.params.id, userId, 'customer');
      if (!order) return ResponseUtil.notFound(res, 'Order not found');
      return ResponseUtil.success(res, { order });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/orders/history
  // Query: status, limit, page
  getHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId    = (req as AuthRequest).user!.id;
      const { status, limit, page } = req.query;

      const result = await OrderService.getCustomerHistory({
        customerId,
        status: status as string | undefined,
        limit:  limit  ? parseInt(limit as string)  : 10,
        page:   page   ? parseInt(page  as string)  : 1,
      });

      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // POST /api/spare-parts/orders/:id/cancel
  // Body: { reason }
  cancelOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId  = (req as AuthRequest).user!.id;
      const { reason }  = req.body;

      if (!reason) {
        return ResponseUtil.badRequest(res, 'reason is required');
      }

      const result = await OrderService.cancelOrder(req.params.id, customerId, reason);
      return ResponseUtil.success(res, result, 'Order cancelled');
    } catch (err: any) {
      if (err.message === 'Order not found')       return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot cancel')
        || err.message === 'Unauthorized')         return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/orders/:id/tracking
  getTracking = async (req: Request, res: Response): Promise<Response> => {
    try {
      const tracking = await OrderService.getTracking(req.params.id);
      if (!tracking) return ResponseUtil.notFound(res, 'Order not found');
      return ResponseUtil.success(res, tracking);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/orders/:id/receipt
  getReceipt = async (req: Request, res: Response): Promise<Response> => {
    try {
      const receipt = await OrderService.getReceipt(req.params.id);
      if (!receipt) return ResponseUtil.notFound(res, 'Order not found');
      return ResponseUtil.success(res, receipt);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // POST /api/spare-parts/orders/:id/review
  // Body: { store_rating, comment?, product_ratings: [{product_id, rating}] }
  submitReview = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const { store_rating, comment, product_ratings = [] } = req.body;

      if (!store_rating) {
        return ResponseUtil.badRequest(res, 'store_rating is required');
      }
      if (store_rating < 1 || store_rating > 5) {
        return ResponseUtil.badRequest(res, 'store_rating must be between 1 and 5');
      }

      const review = await OrderService.submitReview({
        orderId:        req.params.id,
        customerId,
        storeRating:    parseInt(store_rating),
        comment,
        productRatings: product_ratings,
      });

      return ResponseUtil.created(res, { review }, 'Review submitted successfully');
    } catch (err: any) {
      if (err.message === 'Order not found')             return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Unauthorized')
        || err.message?.includes('Can only review')
        || err.message?.includes('already been reviewed')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
