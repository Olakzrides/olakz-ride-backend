import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { OrdersAdminService } from '../services/orders-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class OrdersAdminController {

  /**
   * GET /api/admin/orders
   */
  getAllOrders = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { search, status, service, date_preset, from, to, page, limit } = req.query;

      const result = await OrdersAdminService.getAllOrders({
        search: search as string | undefined,
        status: status as string | undefined,
        service: service as string | undefined,
        date_preset: date_preset as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      ResponseUtil.success(res, result, 'Orders retrieved successfully');
    } catch (err: unknown) {
      logger.error('getAllOrders error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve orders', 'ORDERS_FETCH_ERROR');
    }
  };


  /**
   * GET /api/admin/orders/filter/by-status
   */
  filterByStatus = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { status, service, page, limit } = req.query;

      if (!status) {
        ResponseUtil.badRequest(res, 'status query param is required', 'STATUS_REQUIRED');
        return;
      }

      // "all" is valid — returns orders of every status
      const result = await OrdersAdminService.filterByStatus({
        status: status as string,
        service: service as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      ResponseUtil.success(res, result, `Orders filtered by status: ${status}`);
    } catch (err: unknown) {
      logger.error('filterByStatus error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to filter orders by status', 'FILTER_STATUS_ERROR');
    }
  };


  /**
   * GET /api/admin/orders/filter/by-service
   */
  filterByService = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { service, status, page, limit } = req.query;

      if (!service) {
        ResponseUtil.badRequest(res, 'service query param is required', 'SERVICE_REQUIRED');
        return;
      }

      const result = await OrdersAdminService.filterByService({
        service: service as string,
        status: status as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      ResponseUtil.success(res, result, `Orders filtered by service: ${service}`);
    } catch (err: unknown) {
      logger.error('filterByService error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to filter orders by service', 'FILTER_SERVICE_ERROR');
    }
  };


  /**
   * GET /api/admin/orders/filter/by-date
   */
  filterByDate = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { date_preset, from, to, service, status, page, limit } = req.query;

      if (!date_preset && !from && !to) {
        ResponseUtil.badRequest(
          res,
          'Provide date_preset or from/to query params',
          'DATE_FILTER_REQUIRED'
        );
        return;
      }

      const result = await OrdersAdminService.filterByDate({
        date_preset: date_preset as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        service: service as string | undefined,
        status: status as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      ResponseUtil.success(res, result, 'Orders filtered by date');
    } catch (err: unknown) {
      logger.error('filterByDate error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to filter orders by date', 'FILTER_DATE_ERROR');
    }
  };


  /**
   * GET /api/admin/orders/filter/newly-registered
   */
  filterNewlyRegistered = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { role, date_preset, from, to, page, limit } = req.query;

      // Treat empty string the same as "all" — no role filter
      const roleValue = role && (role as string).trim() !== '' ? (role as string) : undefined;

      const result = await OrdersAdminService.filterNewlyRegistered({
        role: roleValue,
        date_preset: date_preset as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      const roleLabel = roleValue && roleValue.toLowerCase() !== 'all' ? roleValue : 'all roles';
      ResponseUtil.success(res, result, `Newly registered users retrieved (${roleLabel})`);
    } catch (err: unknown) {
      logger.error('filterNewlyRegistered error', { error: toMessage(err) });
      ResponseUtil.serverError(
        res,
        'Failed to retrieve newly registered users',
        'FILTER_REGISTERED_ERROR'
      );
    }
  };


  /**
   * GET /api/admin/orders/summary
   * Order counts grouped by status across all services.
   */
  getOrderSummary = async (_req: AdminRequest, res: Response): Promise<void> => {
    try {
      const summary = await OrdersAdminService.getOrderStatusSummary();
      ResponseUtil.success(res, summary, 'Order summary retrieved successfully');
    } catch (err: unknown) {
      logger.error('getOrderSummary error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve order summary', 'ORDER_SUMMARY_ERROR');
    }
  };

}
