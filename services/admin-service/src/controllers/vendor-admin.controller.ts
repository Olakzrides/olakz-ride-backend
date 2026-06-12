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

  /**
   * GET /api/admin/vendors/:id/view-wallet-balance
   * Returns only the wallet balance for a specific vendor.
   */
  getVendorWalletBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await VendorAdminService.getVendorWalletBalance(id);
      
      if (!result) {
        ResponseUtil.notFound(res, 'Vendor not found');
        return;
      }
      
      ResponseUtil.success(res, result, 'Vendor wallet balance retrieved');
    } catch (err: unknown) {
      logger.error('getVendorWalletBalance error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err));
    }
  };

  /**
   * GET /api/admin/vendors/:id/view-order-history
   * Vendor order history across marketplace and food services.
   * Called when admin clicks "View History".
   * Query: status, from, to, page, limit
   */
  getVendorOrders = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { status, from, to, page, limit } = req.query;
      const result = await VendorAdminService.getVendorOrders(req.params.id, {
        status: status as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });
      ResponseUtil.success(res, result, 'Vendor order history retrieved');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Vendor not found') { ResponseUtil.notFound(res, 'Vendor'); return; }
      logger.error('getVendorOrders error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  /**
   * PATCH /api/admin/vendors/:id/suspend
   * Toggle suspension — approved→suspended or suspended→approved.
   * No body needed. Terminated accounts are blocked.
   */
  suspendVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const result = await VendorAdminService.toggleSuspend(req.params.id, adminId);
      const message = result.action === 'suspended'
        ? 'Vendor account suspended successfully'
        : 'Vendor account reactivated successfully';
      ResponseUtil.success(res, { vendor: result.vendor, action: result.action }, message);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Vendor not found') { ResponseUtil.notFound(res, 'Vendor'); return; }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated', 'ACCOUNT_TERMINATED'); return;
      }
      logger.error('suspendVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
    }
  };

  /**
   * PATCH /api/admin/vendors/:id/terminate
   * Permanently disable vendor account. Data preserved, nothing deleted.
   * Body (optional): { "reason": "..." }
   */
  terminateVendor = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { reason } = req.body;
      const vendor = await VendorAdminService.terminateAccount(req.params.id, adminId, reason);
      ResponseUtil.success(res, { vendor }, 'Vendor account permanently terminated. All data has been preserved.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Vendor not found') { ResponseUtil.notFound(res, 'Vendor'); return; }
      if (msg === 'ALREADY_TERMINATED') {
        ResponseUtil.badRequest(res, 'This vendor account is already terminated', 'ALREADY_TERMINATED'); return;
      }
      logger.error('terminateVendor error', { error: msg });
      ResponseUtil.serverError(res, msg);
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

  /**
   * GET /api/admin/vendors/registrations
   * Incomplete vendor registrations — pending, rejected, or profile not fully filled.
   * Excludes approved and terminated vendors.
   * Query: status (pending|rejected), search, page, limit
   */
  getIncompleteRegistrations = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));

      const result = await VendorAdminService.getIncompleteRegistrations({
        status: req.query.status as string | undefined,
        search: req.query.search as string | undefined,
        page,
        limit,
      });

      ResponseUtil.success(res, result, 'Incomplete vendor registrations retrieved');
    } catch (err: unknown) {
      logger.error('getIncompleteRegistrations error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve incomplete vendor registrations', 'VENDOR_REGISTRATIONS_ERROR');
    }
  };

  /**
   * GET /api/admin/vendors/registrations/:vendorId
   * Full detail of a single incomplete vendor registration — steps, fields, progress.
   * Returns 400 if vendor is already approved (use GET /vendors/:id instead).
   */
  getIncompleteRegistrationById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { vendorId } = req.params;
      const result = await VendorAdminService.getIncompleteRegistrationById(vendorId);

      if (!result) {
        ResponseUtil.notFound(res, 'Vendor registration');
        return;
      }

      if ((result as Record<string, unknown>).__completed) {
        ResponseUtil.badRequest(
          res,
          'This vendor registration is complete. The vendor appears in GET /api/admin/vendors.',
          'VENDOR_REGISTRATION_ALREADY_COMPLETED'
        );
        return;
      }

      ResponseUtil.success(res, { vendor: result }, 'Vendor registration detail retrieved');
    } catch (err: unknown) {
      logger.error('getIncompleteRegistrationById error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve vendor registration', 'VENDOR_REGISTRATION_FETCH_ERROR');
    }
  };
}