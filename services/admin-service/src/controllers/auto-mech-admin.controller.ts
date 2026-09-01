import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { AutoMechAdminService } from '../services/auto-mech-admin.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AutoMechAdminController {
  // ─── Dashboard ────────────────────────────────────────────────────────────

  getDashboard = async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await AutoMechAdminService.getDashboardStats();
      ResponseUtil.success(res, stats);
    } catch (err: unknown) {
      logger.error('autoMech getDashboard error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  // ─── Vendors ──────────────────────────────────────────────────────────────

  getVendors = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, city, page, limit } = req.query;
      const result = await AutoMechAdminService.getVendors({
        status: status as string | undefined,
        city:   city   as string | undefined,
        page:   page   ? parseInt(page   as string, 10) : 1,
        limit:  limit  ? parseInt(limit  as string, 10) : 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('autoMech getVendors error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getVendorById = async (req: Request, res: Response): Promise<void> => {
    try {
      const vendor = await AutoMechAdminService.getVendorById(req.params.id);
      ResponseUtil.success(res, { vendor });
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Auto mech vendor not found') { ResponseUtil.notFound(res, 'Auto mech vendor'); return; }
      logger.error('autoMech getVendorById error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  approveVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const vendor = await AutoMechAdminService.approveVendor(req.params.id, adminId);
      ResponseUtil.success(res, { vendor }, 'Auto mech vendor approved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Auto mech vendor not found') { ResponseUtil.notFound(res, 'Auto mech vendor'); return; }
      logger.error('autoMech approveVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  rejectVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { reason } = req.body;
      if (!reason) { ResponseUtil.badRequest(res, 'reason is required'); return; }
      const vendor = await AutoMechAdminService.rejectVendor(req.params.id, adminId, reason);
      ResponseUtil.success(res, { vendor }, 'Auto mech vendor rejected');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Auto mech vendor not found') { ResponseUtil.notFound(res, 'Auto mech vendor'); return; }
      logger.error('autoMech rejectVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  suspendVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { reason } = req.body;
      const vendor = await AutoMechAdminService.suspendVendor(req.params.id, adminId, reason ?? null);
      ResponseUtil.success(res, { vendor }, 'Auto mech vendor suspended');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Auto mech vendor not found') { ResponseUtil.notFound(res, 'Auto mech vendor'); return; }
      logger.error('autoMech suspendVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  reactivateVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const vendor = await AutoMechAdminService.reactivateVendor(req.params.id, adminId);
      ResponseUtil.success(res, { vendor }, 'Auto mech vendor reactivated');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Auto mech vendor not found') { ResponseUtil.notFound(res, 'Auto mech vendor'); return; }
      logger.error('autoMech reactivateVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  // ─── Vendor wallet & booking history ──────────────────────────────────────

  getVendorWalletBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await AutoMechAdminService.getVendorWalletBalance(req.params.id);
      ResponseUtil.success(res, result, 'Wallet balance retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Auto mech vendor not found') { ResponseUtil.notFound(res, 'Auto mech vendor'); return; }
      logger.error('autoMech getVendorWalletBalance error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  getVendorBookings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, from, to, page, limit } = req.query;
      const result = await AutoMechAdminService.getVendorBookings(req.params.id, {
        status: status as string | undefined,
        from:   from   as string | undefined,
        to:     to     as string | undefined,
        page:   page   ? parseInt(page  as string, 10) : 1,
        limit:  limit  ? parseInt(limit as string, 10) : 20,
      });
      ResponseUtil.success(res, result, 'Vendor booking history retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Auto mech vendor not found') { ResponseUtil.notFound(res, 'Auto mech vendor'); return; }
      logger.error('autoMech getVendorBookings error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  // ─── Bookings ──────────────────────────────────────────────────────────────

  getBookingStatusCounts = async (req: Request, res: Response): Promise<void> => {
    try {
      const { vendor_id, from, to } = req.query;
      const counts = await AutoMechAdminService.getBookingStatusCounts({
        vendor_id: vendor_id as string | undefined,
        from:      from      as string | undefined,
        to:        to        as string | undefined,
      });
      ResponseUtil.success(res, counts, 'Auto mech booking status counts retrieved');
    } catch (err: unknown) {
      logger.error('autoMech getBookingStatusCounts error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  getBookingById = async (req: Request, res: Response): Promise<void> => {
    try {
      const booking = await AutoMechAdminService.getBookingById(req.params.bookingId);
      ResponseUtil.success(res, { booking }, 'Auto mech booking detail retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Booking not found') { ResponseUtil.notFound(res, 'Booking'); return; }
      logger.error('autoMech getBookingById error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  getBookings = async (req: Request, res: Response): Promise<void> => {
    try {
      const { status, vendor_id, from, to, page, limit } = req.query;
      const result = await AutoMechAdminService.getBookings({
        status:    status    as string | undefined,
        vendor_id: vendor_id as string | undefined,
        from:      from      as string | undefined,
        to:        to        as string | undefined,
        page:      page      ? parseInt(page  as string, 10) : 1,
        limit:     limit     ? parseInt(limit as string, 10) : 20,
      });
      ResponseUtil.success(res, result);
    } catch (err: unknown) {
      logger.error('autoMech getBookings error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };
}
