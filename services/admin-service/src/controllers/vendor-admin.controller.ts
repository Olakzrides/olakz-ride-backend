import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { VendorAdminService } from '../services/vendor-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class VendorAdminController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, business_type, page, limit } = req.query;
      const result = await VendorAdminService.getAll({
        status: status as string,
        business_type: business_type as string,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });
      ResponseUtil.success(res, result, 'Vendors retrieved');
    } catch (err: unknown) {
      logger.error('getAll vendors error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendor = await VendorAdminService.getById(req.params.id);
      if (!vendor) { ResponseUtil.notFound(res, 'Vendor'); return; }
      ResponseUtil.success(res, { vendor }, 'Vendor retrieved');
    } catch (err: unknown) {
      logger.error('getById vendor error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  approve = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const vendor = await VendorAdminService.approve(req.params.id, adminId);
      ResponseUtil.success(res, { vendor }, 'Vendor approved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Vendor not found') { ResponseUtil.notFound(res, 'Vendor'); return; }
      logger.error('approve vendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  reject = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { reason } = req.body;
      if (!reason) { ResponseUtil.badRequest(res, 'reason is required'); return; }
      const vendor = await VendorAdminService.reject(req.params.id, adminId, reason);
      ResponseUtil.success(res, { vendor }, 'Vendor rejected');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Vendor not found') { ResponseUtil.notFound(res, 'Vendor'); return; }
      logger.error('reject vendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };
}
