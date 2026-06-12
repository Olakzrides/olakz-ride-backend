import { Router } from 'express';
import { AdminDriverController } from '../controllers/admin-driver.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AdminDriverController();

router.use(adminAuthMiddleware);

// ─── Existing: application review flow ───────────────────────────────────────
router.get('/pending', auditMiddleware('get_pending_drivers'), ctrl.getPendingDrivers);
router.get('/statistics', auditMiddleware('get_driver_statistics'), ctrl.getReviewStatistics);
router.get('/search', auditMiddleware('search_drivers'), ctrl.searchDrivers);
router.post('/bulk-approve', auditMiddleware('bulk_approve_drivers'), ctrl.bulkApproveDrivers);

// ─── Registration progress (must come before /:driverId routes) ───────────────
router.get('/registrations', auditMiddleware('get_driver_registrations'), ctrl.getRegistrations);
router.get('/registrations/:sessionId', auditMiddleware('get_driver_registration_by_id'), ctrl.getRegistrationById);

router.get('/:driverId', auditMiddleware('get_driver_for_review'), ctrl.getDriverForReview);
router.post('/:driverId/review', auditMiddleware('review_driver'), ctrl.reviewDriver);

router.get('/', auditMiddleware('get_all_drivers'), ctrl.getAllDrivers);
router.get('/:driverId/profile', auditMiddleware('get_driver_by_id'), ctrl.getDriverById);
router.get('/:driverId/view-wallet-balance', auditMiddleware('get_driver_wallet_balance'), ctrl.getDriverWalletBalance);
router.get('/:driverId/view-rides-history', auditMiddleware('get_driver_rides'), ctrl.getDriverRides);
router.patch('/:driverId/suspend', auditMiddleware('suspend_driver'), ctrl.suspendDriver);
router.patch('/:driverId/terminate', auditMiddleware('terminate_driver'), ctrl.terminateDriver);

export default router;
