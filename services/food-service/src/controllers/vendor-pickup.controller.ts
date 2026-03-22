import { Request, Response } from 'express';
import { VendorPickupService } from '../services/vendor-pickup.service';
import { RestaurantService } from '../services/restaurant.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class VendorPickupController {
  private static async getRestaurant(req: Request, res: Response) {
    const vendorId = (req as AuthRequest).user!.id;
    const restaurant = await RestaurantService.getByOwnerId(vendorId);
    if (!restaurant) {
      ResponseUtil.notFound(res, 'No restaurant found for this vendor');
      return null;
    }
    return restaurant;
  }

  /**
   * POST /api/vendor-pickup/request
   * Vendor creates a pickup request for a ready order
   */
  createPickup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = (req as AuthRequest).user!.id;
      const restaurant = await VendorPickupController.getRestaurant(req, res);
      if (!restaurant) return res as any;

      const { order_id, special_instructions } = req.body;
      if (!order_id) return ResponseUtil.badRequest(res, 'order_id is required');

      const pickup = await VendorPickupService.createPickup(order_id, vendorId, restaurant.id, special_instructions);

      return ResponseUtil.created(res, { pickup }, 'Pickup request created');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/vendor-pickup/vendor/requests
   */
  getPickups = async (req: Request, res: Response): Promise<Response> => {
    try {
      const restaurant = await VendorPickupController.getRestaurant(req, res);
      if (!restaurant) return res as any;

      const { status, date_from, date_to, limit, page } = req.query;

      const result = await VendorPickupService.getVendorPickups({
        restaurantId: restaurant.id,
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

  /**
   * GET /api/vendor-pickup/:id
   */
  getPickup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const pickup = await VendorPickupService.getPickup(req.params.id);
      if (!pickup) return ResponseUtil.notFound(res, 'Pickup not found');
      return ResponseUtil.success(res, { pickup });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PUT /api/vendor-pickup/:id/ready
   */
  markReady = async (req: Request, res: Response): Promise<Response> => {
    try {
      const restaurant = await VendorPickupController.getRestaurant(req, res);
      if (!restaurant) return res as any;

      const { special_instructions } = req.body;
      await VendorPickupService.markReady(req.params.id, restaurant.id, special_instructions);

      return ResponseUtil.success(res, null, 'Pickup marked as ready');
    } catch (err: any) {
      if (err.message === 'Pickup not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/vendor-pickup/:id/cancel
   */
  cancelPickup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = (req as AuthRequest).user!.id;
      const restaurant = await VendorPickupController.getRestaurant(req, res);
      if (!restaurant) return res as any;

      const { reason } = req.body;
      if (!reason) return ResponseUtil.badRequest(res, 'reason is required');

      await VendorPickupService.cancelPickup(req.params.id, restaurant.id, reason, 'vendor');

      return ResponseUtil.success(res, null, 'Pickup cancelled');
    } catch (err: any) {
      if (err.message === 'Pickup not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
