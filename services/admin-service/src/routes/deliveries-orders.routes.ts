import { Router } from 'express';
import { DeliveriesAdminController } from '../controllers/deliveries-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new DeliveriesAdminController();

router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// ── Pricing / promo — static paths MUST come before /:deliveryId ─────────────

// GET /api/admin/deliveries/pricing/promo
// List all delivery fare config rows with their current promo settings
router.get(
  '/pricing/promo',
  auditMiddleware('deliveries_get_promo_configs'),
  ctrl.getPromoConfigs
);

// PATCH /api/admin/deliveries/pricing/promo/:configId
// Admin enables/disables promo and sets the multiplier for one config row
router.patch(
  '/pricing/promo/:configId',
  auditMiddleware('deliveries_update_promo_config'),
  ctrl.updatePromoConfig
);

// ── Delivery orders ───────────────────────────────────────────────────────────

// GET /api/admin/deliveries/status-counts  — tab counts (must come before /:deliveryId)
router.get('/status-counts', auditMiddleware('deliveries_get_status_counts'), ctrl.getStatusCounts);

// GET /api/admin/deliveries  — paginated list with filters
router.get('/', auditMiddleware('deliveries_get_all'), ctrl.getDeliveries);

// GET /api/admin/deliveries/:deliveryId  — single delivery detail (More button)
router.get('/:deliveryId', auditMiddleware('deliveries_get_by_id'), ctrl.getDeliveryById);

export default router;
