import { Router } from 'express';
import { SparePartsAdminController } from '../controllers/spare-parts-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl   = new SparePartsAdminController();

router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// ── Stores ────────────────────────────────────────────────────────────────────
// GET  ?status=active|inactive|verified|unverified&city=Lagos&page=1&limit=20
router.get('/stores',                      auditMiddleware('spare_parts_get_stores'),         ctrl.getStores);
router.get('/stores/:id',                  auditMiddleware('spare_parts_get_store'),           ctrl.getStoreById);
router.patch('/stores/:id/status',         auditMiddleware('spare_parts_set_store_status'),    ctrl.setStoreStatus);
router.patch('/stores/:id/verify',         auditMiddleware('spare_parts_verify_store'),        ctrl.setStoreVerified);
router.get('/stores/:id/orders',           auditMiddleware('spare_parts_get_store_orders'),    ctrl.getStoreOrders);

// ── Orders ────────────────────────────────────────────────────────────────────
// status-counts MUST come before /:id to avoid Express treating "counts" as an id
router.get('/orders/counts',               auditMiddleware('spare_parts_get_order_counts'),    ctrl.getOrderStatusCounts);
router.get('/orders/:id',                  auditMiddleware('spare_parts_get_order'),           ctrl.getOrderById);
router.get('/orders',                      auditMiddleware('spare_parts_get_orders'),          ctrl.getOrders);

// ── Analytics ─────────────────────────────────────────────────────────────────
router.get('/analytics',                   auditMiddleware('spare_parts_get_analytics'),       ctrl.getAnalytics);

export default router;
