import { Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { FoodRatingService } from '../services/rating.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class OrderController {
  estimateTotal = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { restaurant_id, items, delivery_address } = req.body;

      if (!restaurant_id || !items?.length || !delivery_address?.lat || !delivery_address?.lng) {
        return ResponseUtil.badRequest(res, 'restaurant_id, items, and delivery_address (lat, lng) are required');
      }

      const estimate = await OrderService.estimateTotal({
        restaurantId: restaurant_id,
        items,
        deliveryAddress: delivery_address,
      });

      return ResponseUtil.success(res, estimate);
    } catch (err: any) {
      if (err.message === 'Restaurant not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  placeOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const {
        restaurant_id, items, delivery_address, payment_method = 'wallet', special_instructions,
      } = req.body;

      if (!restaurant_id) return ResponseUtil.badRequest(res, 'restaurant_id is required');
      if (!items?.length) return ResponseUtil.badRequest(res, 'items are required');
      if (!delivery_address?.lat || !delivery_address?.lng || !delivery_address?.address) {
        return ResponseUtil.badRequest(res, 'delivery_address with address, lat, lng is required');
      }

      const order = await OrderService.placeOrder({
        customerId,
        restaurantId: restaurant_id,
        items,
        deliveryAddress: delivery_address,
        paymentMethod: payment_method,
        specialInstructions: special_instructions,
      });

      return ResponseUtil.created(res, { order }, 'Order placed successfully');
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('not available') || err.message?.includes('closed') || err.message?.includes('Insufficient')) {
        return ResponseUtil.badRequest(res, err.message);
      }
      if (err.message?.includes('not yet implemented')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = (req as AuthRequest).user!;
      const order = await OrderService.getOrder(req.params.id, user.id, 'customer');
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
      if (err.message?.includes('Cannot cancel')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/orders/:id/rate
   */
  rateOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const { restaurant_rating, delivery_rating, comment } = req.body;

      if (!restaurant_rating) return ResponseUtil.badRequest(res, 'restaurant_rating is required');
      if (restaurant_rating < 1 || restaurant_rating > 5) {
        return ResponseUtil.badRequest(res, 'restaurant_rating must be between 1 and 5');
      }

      await FoodRatingService.rateOrder({
        orderId: req.params.id,
        customerId,
        restaurantRating: parseInt(restaurant_rating),
        deliveryRating: delivery_rating ? parseInt(delivery_rating) : undefined,
        comment,
      });

      return ResponseUtil.success(res, null, 'Rating submitted');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('already rated') || err.message?.includes('Can only rate')) {
        return ResponseUtil.badRequest(res, err.message);
      }
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
