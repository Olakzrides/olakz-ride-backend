import { Router } from 'express';
import { OrdersAdminController } from '../controllers/orders-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new OrdersAdminController();

// All routes require admin JWT
router.use(adminAuthMiddleware);

router.get('/', auditMiddleware('orders_get_all'), ctrl.getAllOrders);
router.get('/filter/by-status', auditMiddleware('orders_filter_by_status'), ctrl.filterByStatus);
router.get('/filter/by-service', auditMiddleware('orders_filter_by_service'), ctrl.filterByService);
router.get('/filter/by-date', auditMiddleware('orders_filter_by_date'), ctrl.filterByDate);
router.get('/filter/newly-registered', auditMiddleware('orders_filter_newly_registered'), ctrl.filterNewlyRegistered);
router.get('/summary', auditMiddleware('orders_get_summary'), ctrl.getOrderSummary);

export default router;
