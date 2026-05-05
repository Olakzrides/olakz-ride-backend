import { Router } from 'express';
import { AdminDriverController } from '../controllers/admin-driver.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AdminDriverController();

router.use(adminAuthMiddleware);

router.get('/pending', auditMiddleware('get_pending_drivers'), ctrl.getPendingDrivers);
router.get('/statistics', auditMiddleware('get_driver_statistics'), ctrl.getReviewStatistics);
router.get('/search', auditMiddleware('search_drivers'), ctrl.searchDrivers);
router.post('/bulk-approve', auditMiddleware('bulk_approve_drivers'), ctrl.bulkApproveDrivers);
router.get('/:driverId', auditMiddleware('get_driver_for_review'), ctrl.getDriverForReview);
router.post('/:driverId/review', auditMiddleware('review_driver'), ctrl.reviewDriver);

export default router;
