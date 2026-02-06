import { Router } from 'express';
import { AdminDriverController } from '../controllers/admin-driver.controller';
import { adminAuthMiddleware, adminAuditMiddleware, adminRateLimitMiddleware } from '../middleware/admin.middleware';

const router = Router();
const adminDriverController = new AdminDriverController();

// Apply admin authentication to all routes
router.use(adminAuthMiddleware);
router.use(adminRateLimitMiddleware(200, 15 * 60 * 1000)); // 200 requests per 15 minutes for admins

/**
 * @route GET /admin/drivers/pending
 * @desc Get all pending driver applications for admin review
 * @access Admin
 */
router.get(
  '/pending',
  adminAuditMiddleware('get_pending_drivers'),
  adminDriverController.getPendingDrivers
);

/**
 * @route GET /admin/drivers/statistics
 * @desc Get admin review statistics for drivers
 * @access Admin
 */
router.get(
  '/statistics',
  adminAuditMiddleware('get_driver_review_statistics'),
  adminDriverController.getReviewStatistics
);

/**
 * @route GET /admin/drivers/search
 * @desc Search driver applications by criteria
 * @access Admin
 */
router.get(
  '/search',
  adminAuditMiddleware('search_drivers'),
  adminDriverController.searchDrivers
);

/**
 * @route GET /admin/drivers/:driverId
 * @desc Get driver application details for admin review
 * @access Admin
 */
router.get(
  '/:driverId',
  adminAuditMiddleware('get_driver_for_review'),
  adminDriverController.getDriverForReview
);

/**
 * @route POST /admin/drivers/:driverId/review
 * @desc Review a driver application (approve or reject)
 * @access Admin
 */
router.post(
  '/:driverId/review',
  adminAuditMiddleware('review_driver'),
  adminDriverController.reviewDriver
);

/**
 * @route POST /admin/drivers/bulk-approve
 * @desc Bulk approve driver applications
 * @access Admin
 */
router.post(
  '/bulk-approve',
  adminAuditMiddleware('bulk_approve_drivers'),
  adminDriverController.bulkApproveDrivers
);

export default router;