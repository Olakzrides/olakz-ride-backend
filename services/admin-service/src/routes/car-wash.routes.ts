import { Router } from 'express';
import { CarWashAdminController } from '../controllers/car-wash-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new CarWashAdminController();

router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// ── Dashboard ─────────────────────────────────────────────────────────────────
// Overall stats: vendor counts, booking counts, revenue
router.get('/dashboard', auditMiddleware('car_wash_get_dashboard'), ctrl.getDashboard);

// ── Vendors ───────────────────────────────────────────────────────────────────
// Read-only views of car_wash_vendors — approval/rejection/suspension happens
// through PUT /api/admin/vendors/:id/approve|reject|suspend which uses the
// platform-service vendors table and auto-provisions car_wash_vendors on approval.
router.get('/vendors',     auditMiddleware('car_wash_get_vendors'),  ctrl.getVendors);
router.get('/vendors/:id', auditMiddleware('car_wash_get_vendor'),   ctrl.getVendorById);

// ── Bookings ──────────────────────────────────────────────────────────────────
router.get('/bookings', auditMiddleware('car_wash_get_bookings'), ctrl.getBookings);

export default router;
