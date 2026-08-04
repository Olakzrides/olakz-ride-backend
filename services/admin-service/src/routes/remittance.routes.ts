import { Router } from 'express';
import { AdminRemittanceController } from '../controllers/admin-remittance.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AdminRemittanceController();

router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// GET  /api/admin/remittance/:driverId/status   — view driver's remittance status + log
router.get('/:driverId/status', auditMiddleware('get_driver_remittance_status'), ctrl.getDriverRemittanceStatus);

// POST /api/admin/remittance/:driverId/pay-cash — record cash payment at office
router.post('/:driverId/pay-cash', auditMiddleware('record_cash_remittance'), ctrl.recordCashPayment);

export default router;
