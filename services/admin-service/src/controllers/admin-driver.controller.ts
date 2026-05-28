import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { AdminDriverService } from '../services/admin-driver.service';
import { DocumentService } from '../services/document.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AdminDriverController {
  private adminDriverService = new AdminDriverService();
  private documentService = new DocumentService();

  getPendingDrivers = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const result = await this.adminDriverService.getPendingDriverApplications(limit, (page - 1) * limit);
      ResponseUtil.success(res, {
        drivers: result.drivers,
        pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
      }, 'Pending driver applications retrieved successfully');
    } catch (err: unknown) {
      logger.error('getPendingDrivers error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to get pending driver applications', 'ADMIN_DRIVERS_FETCH_ERROR');
    }
  };

  getDriverForReview = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverId } = req.params;
      const driver = await this.adminDriverService.getDriverApplicationForReview(driverId);
      if (!driver) { ResponseUtil.notFound(res, 'Driver application'); return; }

      const driverRecord = driver as Record<string, unknown>;
      const documents = (driverRecord.documents as Array<Record<string, unknown>>) || [];
      const documentsWithUrls = await Promise.all(
        documents.map(async (doc) => {
          let signedUrl = null, signedUrlError = null;
          try {
            signedUrl = await this.documentService.getSecureDocumentUrl(
              doc.id as string, req.user?.id || 'admin', 24 * 60 * 60, req.ip, req.get('User-Agent')
            );
          } catch (e: unknown) { signedUrlError = toMessage(e); }
          return { ...doc, signedUrl, signedUrlError };
        })
      );

      ResponseUtil.success(res, {
        driver: { ...driverRecord, documents: documentsWithUrls },
        document_summary: {
          total: documentsWithUrls.length,
          accessible: documentsWithUrls.filter(d => d.signedUrl).length,
          missing: documentsWithUrls.filter(d => d.signedUrlError).length,
        },
      }, 'Driver application details retrieved successfully');
    } catch (err: unknown) {
      logger.error('getDriverForReview error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to get driver application details', 'DRIVER_FETCH_ERROR');
    }
  };

  reviewDriver = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverId } = req.params;
      const { action, serviceTier, notes, rejectionReason } = req.body;
      const reviewerId = req.user?.id;

      if (!reviewerId) { ResponseUtil.unauthorized(res, 'Admin authentication required'); return; }
      if (!['approve', 'reject'].includes(action)) { ResponseUtil.badRequest(res, 'Invalid review action. Must be "approve" or "reject"', 'INVALID_REVIEW_ACTION'); return; }
      if (action === 'approve' && !serviceTier) { ResponseUtil.badRequest(res, 'Service tier is required when approving', 'SERVICE_TIER_REQUIRED'); return; }
      if (serviceTier && !['standard', 'premium', 'vip'].includes(serviceTier)) { ResponseUtil.badRequest(res, 'Invalid service tier', 'INVALID_SERVICE_TIER'); return; }
      if (action === 'reject' && !rejectionReason) { ResponseUtil.badRequest(res, 'Rejection reason is required', 'REJECTION_REASON_REQUIRED'); return; }

      await this.adminDriverService.reviewDriverApplication({ driverId, reviewerId, action, serviceTier, notes, rejectionReason });
      ResponseUtil.success(res, { driverId, action, serviceTier: action === 'approve' ? serviceTier : undefined, reviewedBy: reviewerId }, `Driver application ${action}d successfully`);
    } catch (err: unknown) {
      logger.error('reviewDriver error', { error: toMessage(err) });
      ResponseUtil.serverError(res, toMessage(err) || 'Failed to review driver application', 'DRIVER_REVIEW_ERROR');
    }
  };

  getReviewStatistics = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const statistics = await this.adminDriverService.getDriverReviewStatistics(req.query.reviewerId as string);
      ResponseUtil.success(res, { statistics }, 'Driver review statistics retrieved successfully');
    } catch (err: unknown) {
      logger.error('getReviewStatistics error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to get review statistics', 'STATISTICS_FETCH_ERROR');
    }
  };

  bulkApproveDrivers = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverIds, notes } = req.body;
      const reviewerId = req.user?.id;
      if (!reviewerId) { ResponseUtil.unauthorized(res); return; }
      if (!Array.isArray(driverIds) || driverIds.length === 0) { ResponseUtil.badRequest(res, 'Driver IDs array is required', 'DRIVER_IDS_REQUIRED'); return; }
      const result = await this.adminDriverService.bulkApproveDrivers(driverIds, reviewerId, notes);
      ResponseUtil.success(res, { result, totalProcessed: driverIds.length }, 'Bulk approval completed');
    } catch (err: unknown) {
      logger.error('bulkApproveDrivers error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to bulk approve drivers', 'BULK_APPROVE_ERROR');
    }
  };

  searchDrivers = async (req: AdminRequest, res: Response): Promise<void> => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    ResponseUtil.success(res, { drivers: [], pagination: { page, limit, total: 0, pages: 0 } }, 'Driver search completed');
  };

  // ─── New endpoints ────────────────────────────────────────────────────────────

  /**
   * GET /api/admin/drivers
   * All drivers with user details, vehicle info, status.
   * Query: status, search, page, limit
   */
  getAllDrivers = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { status, search, page, limit } = req.query;
      const result = await this.adminDriverService.getAllDrivers({
        status: status as string | undefined,
        search: search as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });
      ResponseUtil.success(res, result, 'Drivers retrieved successfully');
    } catch (err: unknown) {
      logger.error('getAllDrivers error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve drivers', 'DRIVERS_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/drivers/:driverId
   * Full driver profile — identity, vehicle, documents, wallet balance.
   */
  getDriverById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const driver = await this.adminDriverService.getDriverById(req.params.driverId);
      if (!driver) { ResponseUtil.notFound(res, 'Driver'); return; }
      ResponseUtil.success(res, { driver }, 'Driver retrieved successfully');
    } catch (err: unknown) {
      logger.error('getDriverById error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve driver', 'DRIVER_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/drivers/:driverId/view-wallet-balance
   * Returns only the wallet balance for a specific driver.
   */
  getDriverWalletBalance = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverId } = req.params;
      const result = await this.adminDriverService.getDriverWalletBalance(driverId);
      
      if (!result) {
        ResponseUtil.notFound(res, 'Driver not found');
        return;
      }
      
      ResponseUtil.success(res, result, 'Driver wallet balance retrieved');
    } catch (err: unknown) {
      logger.error('getDriverWalletBalance error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve driver wallet balance', 'DRIVER_WALLET_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/drivers/:driverId/rides
   * Driver ride history — location, rating, date, time, status, fare.
   * Called when admin clicks "View History".
   * Query: status, from, to, page, limit
   */
  getDriverRides = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { driverId } = req.params;
      const { status, from, to, page, limit } = req.query;
      const result = await this.adminDriverService.getDriverRides(driverId, {
        status: status as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });
      ResponseUtil.success(res, result, 'Driver ride history retrieved successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Driver not found') { ResponseUtil.notFound(res, 'Driver'); return; }
      logger.error('getDriverRides error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to retrieve driver ride history', 'DRIVER_RIDES_ERROR');
    }
  };

  /**
   * PATCH /api/admin/drivers/:driverId/suspend
   * Toggle suspension — approved→suspended or suspended→approved.
   * No body needed. Terminated accounts are blocked.
   */
  suspendDriver = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const result = await this.adminDriverService.toggleSuspend(req.params.driverId, adminId);
      const message = result.action === 'suspended'
        ? 'Driver account suspended successfully'
        : 'Driver account reactivated successfully';
      ResponseUtil.success(res, { driver: result.driver, action: result.action }, message);
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Driver not found') { ResponseUtil.notFound(res, 'Driver'); return; }
      if (msg === 'ACCOUNT_TERMINATED') {
        ResponseUtil.badRequest(res, 'This account has been permanently terminated', 'ACCOUNT_TERMINATED'); return;
      }
      logger.error('suspendDriver error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to update driver status', 'DRIVER_SUSPEND_ERROR');
    }
  };

  /**
   * PATCH /api/admin/drivers/:driverId/terminate
   * Permanently disable account. Data preserved, nothing deleted.
   * Body (optional): { "reason": "..." }
   */
  terminateDriver = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) { ResponseUtil.unauthorized(res); return; }
      const { reason } = req.body;
      const driver = await this.adminDriverService.terminateDriverAccount(req.params.driverId, adminId, reason);
      ResponseUtil.success(res, { driver }, 'Driver account permanently terminated. All data has been preserved.');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg === 'Driver not found') { ResponseUtil.notFound(res, 'Driver'); return; }
      if (msg === 'ALREADY_TERMINATED') {
        ResponseUtil.badRequest(res, 'This driver account is already terminated', 'ALREADY_TERMINATED'); return;
      }
      logger.error('terminateDriver error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to terminate driver account', 'DRIVER_TERMINATE_ERROR');
    }
  };
}
