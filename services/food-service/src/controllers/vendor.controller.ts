import { Request, Response } from 'express';
import { VendorOrderService } from '../services/vendor-order.service';
import { VendorProfileService } from '../services/vendor-profile.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class VendorController {
  /**
   * Middleware helper — get restaurant for authenticated vendor
   */
  private static async getVendorRestaurant(req: Request, res: Response) {
    const vendorId = (req as AuthRequest).user!.id;
    const restaurant = await VendorProfileService.getByOwnerId(vendorId);
    if (!restaurant) {
      ResponseUtil.notFound(res, 'No restaurant found for this vendor');
      return null;
    }
    return restaurant;
  }

  // ─── Profile (4.1) ───────────────────────────────────────────────────────────

  getProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const profile = await VendorProfileService.getProfile(ownerId);
      if (!profile) return ResponseUtil.notFound(res, 'Restaurant not found');
      return ResponseUtil.success(res, { profile });
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  updateProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const updated = await VendorProfileService.updateProfile(ownerId, req.body);
      return ResponseUtil.success(res, { profile: updated }, 'Profile updated');
    } catch (e: any) {
      if (e.message === 'Restaurant not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  getStoreDetails = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const details = await VendorProfileService.getStoreDetails(ownerId);
      if (!details) return ResponseUtil.notFound(res, 'Restaurant not found');
      return ResponseUtil.success(res, { store_details: details });
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  updateStoreDetails = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const updated = await VendorProfileService.updateStoreDetails(ownerId, req.body);
      return ResponseUtil.success(res, { store_details: updated }, 'Store details updated');
    } catch (e: any) {
      if (e.message === 'Restaurant not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  getStoreOperations = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const ops = await VendorProfileService.getStoreOperations(ownerId);
      if (!ops) return ResponseUtil.notFound(res, 'Restaurant not found');
      return ResponseUtil.success(res, { store_operations: ops });
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  updateStoreOperations = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const updated = await VendorProfileService.updateStoreOperations(ownerId, req.body);
      return ResponseUtil.success(res, { store_operations: updated }, 'Store operations updated');
    } catch (e: any) {
      if (e.message === 'Restaurant not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  getStatistics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const stats = await VendorProfileService.getStatistics(ownerId);
      if (!stats) return ResponseUtil.notFound(res, 'Restaurant not found');
      return ResponseUtil.success(res, { statistics: stats });
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  // ─── Orders ──────────────────────────────────────────────────────────────────

  getOrders = async (req: Request, res: Response): Promise<Response> => {
    try {
      const restaurant = await VendorController.getVendorRestaurant(req, res);
      if (!restaurant) return res as any;

      const { status, date_from, date_to, limit, page } = req.query;

      const result = await VendorOrderService.getOrders({
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

  getOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const restaurant = await VendorController.getVendorRestaurant(req, res);
      if (!restaurant) return res as any;

      const order = await VendorOrderService.getOrder(req.params.id, restaurant.id);
      if (!order) return ResponseUtil.notFound(res, 'Order not found');
      return ResponseUtil.success(res, { order });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  acceptOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = (req as AuthRequest).user!.id;
      const restaurant = await VendorController.getVendorRestaurant(req, res);
      if (!restaurant) return res as any;

      const { estimated_preparation_time } = req.body;
      await VendorOrderService.acceptOrder(req.params.id, restaurant.id, vendorId, estimated_preparation_time);
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
      const restaurant = await VendorController.getVendorRestaurant(req, res);
      if (!restaurant) return res as any;

      const { rejection_reason } = req.body;
      if (!rejection_reason) return ResponseUtil.badRequest(res, 'rejection_reason is required');

      await VendorOrderService.rejectOrder(req.params.id, restaurant.id, vendorId, rejection_reason);
      return ResponseUtil.success(res, null, 'Order rejected and customer refunded');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot reject')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  updateStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendorId = (req as AuthRequest).user!.id;
      const restaurant = await VendorController.getVendorRestaurant(req, res);
      if (!restaurant) return res as any;

      const { status, estimated_preparation_time } = req.body;
      if (!status) return ResponseUtil.badRequest(res, 'status is required');

      await VendorOrderService.updateStatus(req.params.id, restaurant.id, vendorId, status, estimated_preparation_time);
      return ResponseUtil.success(res, null, `Order status updated to ${status}`);
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot transition')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  updatePrepTime = async (req: Request, res: Response): Promise<Response> => {
    try {
      const restaurant = await VendorController.getVendorRestaurant(req, res);
      if (!restaurant) return res as any;

      const { estimated_minutes } = req.body;
      if (!estimated_minutes || estimated_minutes < 1) {
        return ResponseUtil.badRequest(res, 'estimated_minutes must be a positive number');
      }

      await VendorOrderService.updatePrepTime(req.params.id, restaurant.id, estimated_minutes);
      return ResponseUtil.success(res, null, 'Prep time updated');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
