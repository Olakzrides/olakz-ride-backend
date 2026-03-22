import { Request, Response } from 'express';
import { FoodMatchingService } from '../services/food-matching.service';
import { CourierDeliveryService } from '../services/courier-delivery.service';
import { CourierHistoryService } from '../services/courier-history.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabase } from '../config/database';

export class CourierController {
  /**
   * Helper — get driver record for authenticated user
   */
  private static async getDriverId(req: Request, res: Response): Promise<string | null> {
    const userId = (req as AuthRequest).user!.id;
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!driver) {
      ResponseUtil.notFound(res, 'Driver profile not found');
      return null;
    }
    return driver.id;
  }

  // ── Food delivery endpoints ─────────────────────────────────────────────────

  /**
   * GET /api/food/courier/available
   * List food orders currently in searching_courier state near courier
   */
  getAvailableDeliveries = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { lat, lng, radius = '15' } = req.query;

      const { data: orders, error } = await supabase
        .from('food_orders')
        .select(`
          id, status, delivery_fee, total_amount, delivery_address, created_at,
          restaurant:food_restaurants(id, name, address, latitude, longitude)
        `)
        .eq('status', 'searching_courier')
        .not('excluded_courier_ids', 'cs', `{${driverId}}`);

      if (error) return ResponseUtil.serverError(res, error.message);

      return ResponseUtil.success(res, { orders: orders || [] });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/accept
   */
  acceptDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { estimated_arrival_time } = req.body;
      await FoodMatchingService.courierAccept(req.params.id, driverId, estimated_arrival_time);

      return ResponseUtil.success(res, null, 'Delivery accepted');
    } catch (err: any) {
      if (err.message?.includes('no longer available')) return ResponseUtil.badRequest(res, err.message);
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/reject
   */
  rejectDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { reason } = req.body;
      await FoodMatchingService.courierReject(req.params.id, driverId, reason);

      return ResponseUtil.success(res, null, 'Delivery rejected');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/cancel
   * Courier cancels AFTER accepting — triggers re-queuing
   */
  cancelDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { reason } = req.body;
      if (!reason) return ResponseUtil.badRequest(res, 'reason is required');

      await FoodMatchingService.courierCancelAfterAccept(req.params.id, driverId, reason);

      return ResponseUtil.success(res, null, 'Delivery cancelled — searching for another courier');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/food/courier/active
   * Courier's active food deliveries
   */
  getActiveDeliveries = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { data: orders, error } = await supabase
        .from('food_orders')
        .select(`
          id, status, delivery_fee, total_amount, delivery_address, created_at, accepted_at,
          restaurant:food_restaurants(id, name, address, latitude, longitude, phone)
        `)
        .eq('courier_id', driverId)
        .in('status', ['accepted', 'preparing', 'ready_for_pickup', 'arrived_vendor', 'picked_up']);

      if (error) return ResponseUtil.serverError(res, error.message);

      return ResponseUtil.success(res, { orders: orders || [] });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── Phase 3: Delivery execution ─────────────────────────────────────────────

  /**
   * POST /api/food/courier/:id/arrived-vendor
   */
  arrivedAtVendor = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      await CourierDeliveryService.arrivedAtVendor(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Arrived at restaurant');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Unauthorized')) return ResponseUtil.forbidden(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/verify-pickup
   */
  verifyPickupCode = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { pickup_code } = req.body;
      if (!pickup_code) return ResponseUtil.badRequest(res, 'pickup_code is required');
      await CourierDeliveryService.verifyPickupCode(req.params.id, driverId, pickup_code);
      return ResponseUtil.success(res, { verified: true }, 'Pickup code verified');
    } catch (err: any) {
      if (err.message === 'Invalid pickup code') return ResponseUtil.badRequest(res, err.message);
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/picked-up
   */
  confirmPickedUp = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      await CourierDeliveryService.confirmPickedUp(req.params.id, driverId, req.file);
      return ResponseUtil.success(res, null, 'Order picked up');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot confirm')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/arrived-delivery
   */
  arrivedAtDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      await CourierDeliveryService.arrivedAtDelivery(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Arrived at delivery address');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/verify-delivery
   */
  verifyDeliveryCode = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { delivery_code } = req.body;
      if (!delivery_code) return ResponseUtil.badRequest(res, 'delivery_code is required');
      await CourierDeliveryService.verifyDeliveryCode(req.params.id, driverId, delivery_code);
      return ResponseUtil.success(res, { verified: true }, 'Delivery code verified');
    } catch (err: any) {
      if (err.message === 'Invalid delivery code') return ResponseUtil.badRequest(res, err.message);
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/delivered
   */
  markDelivered = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      await CourierDeliveryService.markDelivered(req.params.id, driverId, req.file);
      return ResponseUtil.success(res, null, 'Order delivered successfully');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/:id/upload-photo
   */
  uploadPhoto = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      if (!req.file) return ResponseUtil.badRequest(res, 'photo file is required');
      const { photo_type } = req.body;
      if (!['pickup', 'delivery'].includes(photo_type)) {
        return ResponseUtil.badRequest(res, 'photo_type must be pickup or delivery');
      }
      const url = await CourierDeliveryService.uploadPhoto(req.params.id, driverId, photo_type, req.file);
      return ResponseUtil.success(res, { url }, 'Photo uploaded');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/courier/location
   */
  updateLocation = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { order_id, lat, lng, heading, speed } = req.body;
      if (!order_id || !lat || !lng) return ResponseUtil.badRequest(res, 'order_id, lat and lng are required');
      await CourierDeliveryService.updateLocation(driverId, order_id, lat, lng, heading, speed);
      return ResponseUtil.success(res, null, 'Location updated');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── Phase 3: History & Earnings ─────────────────────────────────────────────

  /**
   * GET /api/food/courier/history
   */
  getDeliveryHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { status, date_from, date_to, limit, page } = req.query;
      const result = await CourierHistoryService.getHistory({
        driverId,
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
   * GET /api/food/courier/earnings
   */
  getEarnings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await CourierController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { date_from, date_to } = req.query;
      const result = await CourierHistoryService.getEarnings({
        driverId,
        dateFrom: date_from as string | undefined,
        dateTo: date_to as string | undefined,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
