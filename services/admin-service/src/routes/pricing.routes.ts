import { Router } from 'express';
import { PricingAdminController } from '../controllers/pricing-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new PricingAdminController();

router.use(adminAuthMiddleware);
router.get('/', auditMiddleware('pricing_get_all'), ctrl.getAllConfigs);
router.get('/:vehicleCategory', auditMiddleware('pricing_get_by_category'), ctrl.getConfigsByCategory);
router.get('/:vehicleCategory/:serviceTier', auditMiddleware('pricing_get_config'), ctrl.getConfig);
router.put('/:vehicleCategory/:serviceTier', auditMiddleware('pricing_update_config'), ctrl.updateConfig);

export default router;
