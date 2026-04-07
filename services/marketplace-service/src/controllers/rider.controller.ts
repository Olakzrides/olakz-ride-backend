import { Request, Response } from 'express';
import { MarketplaceMatchingService } from '../services/marketplace-matching.service';
import { RiderDeliveryService } from '../services/rider-delivery.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabase } from '../config/database';
import { prisma } from '../config/database';

export class RiderController {
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

  acceptOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { estimated_arrival_minutes } = req.body;
      await MarketplaceMatchingService.riderAccept(req.params.id, driverId, userId, estimated_arrival_minutes);
      return ResponseUtil.success(res, null, 'Order accepted');
    } catch (err: any) {
      if (err.message?.includes('no longer available')) return ResponseUtil.badRequest(res, err.message);
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  rejectOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { reason } = req.body;
      await MarketplaceMatchingService.riderReject(req.params.id, driverId, reason);
      return ResponseUtil.success(res, null, 'Order rejected');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  cancelOrder = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { reason } = req.body;
      if (!reason) return ResponseUtil.badRequest(res, 'reason is required');
      await MarketplaceMatchingService.riderCancel(req.params.id, driverId, reason);
      return ResponseUtil.success(res, null, 'Order cancelled — searching for another rider');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot cancel')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

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

  pickedUp = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      await RiderDeliveryService.pickedUp(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Pickup confirmed');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Unauthorized')) return ResponseUtil.forbidden(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  arrived = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      await RiderDeliveryService.arrived(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Arrived at delivery address');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  delivered = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      await RiderDeliveryService.delivered(req.params.id, driverId);
      return ResponseUtil.success(res, null, 'Order delivered successfully');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('Cannot mark')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  updateLocation = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { order_id, lat, lng, heading, speed } = req.body;
      if (!order_id || !lat || !lng) return ResponseUtil.badRequest(res, 'order_id, lat and lng are required');
      await RiderDeliveryService.updateLocation(driverId, order_id, lat, lng, heading, speed);
      return ResponseUtil.success(res, null, 'Location updated');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { status, date_from, date_to, limit, page } = req.query;
      const take = parseInt(limit as string) || 20;
      const skip = ((parseInt(page as string) || 1) - 1) * take;

      const where: any = { riderId: driverId };
      if (status) where.status = status;
      else where.status = { in: ['delivered', 'cancelled'] };
      if (date_from) where.createdAt = { ...where.createdAt, gte: new Date(date_from as string) };
      if (date_to) where.createdAt = { ...where.createdAt, lte: new Date(date_to as string) };

      const [orders, total] = await Promise.all([
        prisma.marketplaceOrder.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: { store: { select: { id: true, name: true } }, orderItems: true },
        }),
        prisma.marketplaceOrder.count({ where }),
      ]);

      return ResponseUtil.success(res, { orders, total, page: parseInt(page as string) || 1, limit: take });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getEarnings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const driverId = await RiderController.getDriverId(req, res);
      if (!driverId) return res as any;
      const { date_from, date_to } = req.query;

      const where: any = { riderId: driverId };
      if (date_from) where.createdAt = { ...where.createdAt, gte: new Date(date_from as string) };
      if (date_to) where.createdAt = { ...where.createdAt, lte: new Date(date_to as string) };

      const earnings = await prisma.marketplaceRiderEarning.findMany({ where, orderBy: { createdAt: 'desc' } });
      const total = earnings.reduce((acc, e) => acc + parseFloat(e.totalEarned.toString()), 0);

      return ResponseUtil.success(res, {
        total_deliveries: earnings.length,
        total_earned: total,
        earnings,
      });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
