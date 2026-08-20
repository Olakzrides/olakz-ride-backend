import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { CarWashAdminService } from '../services/car-wash-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class CarWashAdminController {
  // ─── Dashboard ────────────────────────────────────────────────────────────

  getDashboard = async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await CarWashAdminService.getDashboardStats();
      ResponseUtil.success(res, stats);
    } catch (err: unknown) {
      logger.error('carWash getDashboard error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  // ─── Vendors ──────────────────────────────────────────────────────────────

  getVendors = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, city, page, limit } = req.query;
      const result = await CarWashAdminService.getVendors({
        status: status as string | undefined,
        city:   city   as string | undefined,
        page:   page   ? parseInt(page   as string, 10) : 1,
        limit:  limit  ? parseInt(limit  as string, 10) : 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('carWash getVendors error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getVendorById = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendor = await CarWashAdminService.getVendorById(req.params.id);
      ResponseUtil.success(res, { vendor });
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Car wash vendor not found') { ResponseUtil.notFound(res, 'Car wash vendor'); return; }
      logger.error('carWash getVendorById error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  approveVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const vendor = await CarWashAdminService.approveVendor(req.params.id, adminId);
      ResponseUtil.success(res, { vendor }, 'Car wash vendor approved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Car wash vendor not found') { ResponseUtil.notFound(res, 'Car wash vendor'); return; }
      logger.error('carWash approveVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  rejectVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { reason } = req.body;
      if (!reason) { ResponseUtil.badRequest(res, 'reason is required'); return; }
      const vendor = await CarWashAdminService.rejectVendor(req.params.id, adminId, reason);
      ResponseUtil.success(res, { vendor }, 'Car wash vendor rejected');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Car wash vendor not found') { ResponseUtil.notFound(res, 'Car wash vendor'); return; }
      logger.error('carWash rejectVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  suspendVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { reason } = req.body;
      if (!reason) { ResponseUtil.badRequest(res, 'reason is required'); return; }
      const vendor = await CarWashAdminService.suspendVendor(req.params.id, adminId, reason);
      ResponseUtil.success(res, { vendor }, 'Car wash vendor suspended');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Car wash vendor not found') { ResponseUtil.notFound(res, 'Car wash vendor'); return; }
      logger.error('carWash suspendVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  reactivateVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const vendor = await CarWashAdminService.reactivateVendor(req.params.id, adminId);
      ResponseUtil.success(res, { vendor }, 'Car wash vendor reactivated');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Car wash vendor not found') { ResponseUtil.notFound(res, 'Car wash vendor'); return; }
      logger.error('carWash reactivateVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  // ─── Vendor wallet & order history ────────────────────────────────────────

  getVendorWalletBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await CarWashAdminService.getVendorWalletBalance(req.params.id);
      ResponseUtil.success(res, result, 'Wallet balance retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Car wash vendor not found') { ResponseUtil.notFound(res, 'Car wash vendor'); return; }
      logger.error('carWash getVendorWalletBalance error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  getVendorBookings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, from, to, page, limit } = req.query;
      const result = await CarWashAdminService.getVendorBookings(req.params.id, {
        status: status as string | undefined,
        from:   from   as string | undefined,
        to:     to     as string | undefined,
        page:   page   ? parseInt(page  as string, 10) : 1,
        limit:  limit  ? parseInt(limit as string, 10) : 20,
      });
      ResponseUtil.success(res, result, 'Vendor booking history retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Car wash vendor not found') { ResponseUtil.notFound(res, 'Car wash vendor'); return; }
      logger.error('carWash getVendorBookings error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  // ─── Bookings ──────────────────────────────────────────────────────────────

  getBookings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, vendor_id, from, to, page, limit } = req.query;
      const result = await CarWashAdminService.getBookings({
        status:    status    as string | undefined,
        vendor_id: vendor_id as string | undefined,
        from:      from      as string | undefined,
        to:        to        as string | undefined,
        page:      page      ? parseInt(page  as string, 10) : 1,
        limit:     limit     ? parseInt(limit as string, 10) : 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('carWash getBookings error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
