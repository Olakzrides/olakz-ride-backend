import { Request, Response } from 'express';
import { SparePartsMatchingService } from '../services/spare-parts-matching.service';
import { RiderDeliveryService } from '../services/rider-delivery.service';
import { ResponseUtil } from '../utils/response.util';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabase } from '../config/database';

export class RiderController {
  // ── Helper: resolve drivers.id from JWT user id ──────────────────────────

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

  // ── GET /api/spare-parts/rider/available ─────────────────────────────────

  getAvailableOrders = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      const orders = await RiderDeliveryService.getAvailableOrders(driverId);
      return ResponseUtil.success(res, { orders });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── GET /api/spare-parts/rider/active ────────────────────────────────────

  getActiveOrders = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      const orders = await RiderDeliveryService.getActiveOrders(driverId);
      return ResponseUtil.success(res, { orders });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── GET /api/spare-parts/rider/history ───────────────────────────────────
  // Query: status, date_from, date_to, limit, page

  getHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { status, date_from, date_to, limit, page } = req.query;
      const result = await RiderDeliveryService.getHistory(driverId, {
        status:    status    as string | undefined,
        date_from: date_from as string | undefined,
        date_to:   date_to   as string | undefined,
        limit:     limit     ? parseInt(limit as string) : 20,
        page:      page      ? parseInt(page  as string) : 1,
      });

      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── GET /api/spare-parts/rider/earnings ──────────────────────────────────
  // Query: date_from, date_to

  getEarnings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { date_from, date_to } = req.query;
      const result = await RiderDeliveryService.getEarnings(driverId, {
        date_from: date_from as string | undefined,
        date_to:   date_to   as string | undefined,
      });

      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/location ─────────────────────────────────
  // Body: { order_id, lat, lng, heading?, speed? }

  updateLocation = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { order_id, lat, lng, heading, speed } = req.body;
      if (!order_id || lat == null || lng == null) {
        return ResponseUtil.badRequest(res, 'order_id, lat and lng are required');
      }

      await RiderDeliveryService.updateLocation(
        driverId, order_id, parseFloat(lat), parseFloat(lng),
        heading ? parseFloat(heading) : undefined,
        speed   ? parseFloat(speed)   : undefined
      );

      return ResponseUtil.success(res, null, 'Location updated');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/accept ───────────────────────────────
  // Body: { estimated_arrival_minutes? }

  acceptOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId   = (req as AuthRequest).user!.id;
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { estimated_arrival_minutes } = req.body;
      await SparePartsMatchingService.riderAccept(
        req.params.id, driverId, userId, estimated_arrival_minutes
      );

      return ResponseUtil.success(res, null, 'Order accepted');
    } catch (err: any) {
      if (err.message?.includes('no longer available')) return ResponseUtil.badRequest(res, err.message);
      if (err.message === 'Order not found')            return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/reject ───────────────────────────────
  // Body: { reason? }

  rejectOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { reason } = req.body;
      await SparePartsMatchingService.riderReject(req.params.id, driverId, reason);
      return ResponseUtil.success(res, null, 'Order rejected');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/cancel ───────────────────────────────
  // Body: { reason }

  cancelOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      const { reason } = req.body;
      if (!reason) return ResponseUtil.badRequest(res, 'reason is required');

      await SparePartsMatchingService.riderCancel(req.params.id, driverId, reason);
      return ResponseUtil.success(res, null, 'Order cancelled — searching for another rider');
    } catch (err: any) {
      if (err.message === 'Order not found')       return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot cancel'))  return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/heading-to-store ─────────────────────

  headingToStore = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      await RiderDeliveryService.headingToStore(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Marked as heading to store');
    } catch (err: any) {
      if (err.message === 'Order not found')          return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Unauthorized'))      return ResponseUtil.forbidden(res, err.message);
      if (err.message?.includes('Cannot mark'))       return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/picked-up ────────────────────────────

  pickedUp = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      await RiderDeliveryService.pickedUp(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Pickup confirmed');
    } catch (err: any) {
      if (err.message === 'Order not found')     return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Unauthorized')) return ResponseUtil.forbidden(res, err.message);
      if (err.message?.includes('Cannot mark'))  return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/heading-to-customer ──────────────────

  headingToCustomer = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      await RiderDeliveryService.headingToCustomer(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Marked as heading to customer');
    } catch (err: any) {
      if (err.message === 'Order not found')     return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Unauthorized')) return ResponseUtil.forbidden(res, err.message);
      if (err.message?.includes('Cannot mark'))  return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/arrived ──────────────────────────────

  arrived = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      await RiderDeliveryService.arrived(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Arrived at delivery address');
    } catch (err: any) {
      if (err.message === 'Order not found')    return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/delivered ────────────────────────────

  delivered = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      await RiderDeliveryService.delivered(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Order delivered successfully');
    } catch (err: any) {
      if (err.message === 'Order not found')    return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── POST /api/spare-parts/rider/:id/confirm-cash ─────────────────────────
  // Cash orders only — confirms cash received from customer

  confirmCash = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;

      await RiderDeliveryService.confirmCash(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Cash payment confirmed');
    } catch (err: any) {
      if (err.message === 'Order not found')          return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('only for cash')
        || err.message?.includes('must be delivered')
        || err.message?.includes('already confirmed')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
