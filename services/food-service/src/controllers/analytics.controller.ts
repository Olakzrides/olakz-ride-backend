import { Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class AnalyticsController {
  /**
   * GET /api/analytics/vendor/dashboard
   */
  vendorDashboard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const data = await AnalyticsService.vendorDashboard(ownerId);
      if (!data) return ResponseUtil.notFound(res, 'Restaurant not found');
      return ResponseUtil.success(res, data);
    } catch (e: any) {
      if (e.message === 'Restaurant not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  /**
   * GET /api/analytics/courier/earnings
   * Courier sees own; admin can pass ?courier_id=
   */
  courierEarnings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const user = (req as AuthRequest).user!;
      const userRoles = user.roles?.length ? user.roles : [user.role];
      const isAdmin = userRoles.some((r) => ['admin', 'super_admin'].includes(r));

      // Admin can query any courier; courier can only query themselves
      const courierId = isAdmin && req.query.courier_id
        ? (req.query.courier_id as string)
        : user.id;

      const { from, to } = req.query as { from?: string; to?: string };
      const data = await AnalyticsService.courierEarnings(courierId, { from, to });
      return ResponseUtil.success(res, data);
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  /**
   * GET /api/analytics/orders/trends  (admin)
   */
  orderTrends = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { from, to, restaurant_id } = req.query as Record<string, string>;
      const data = await AnalyticsService.orderTrends({ from, to, restaurant_id });
      return ResponseUtil.success(res, data);
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  /**
   * GET /api/analytics/customer/behavior  (admin)
   */
  customerBehavior = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { from, to } = req.query as { from?: string; to?: string };
      const data = await AnalyticsService.customerBehavior({ from, to });
      return ResponseUtil.success(res, data);
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };
}
