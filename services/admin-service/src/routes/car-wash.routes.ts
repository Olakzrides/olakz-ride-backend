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
router.get('/dashboard', auditMiddleware('car_wash_get_dashboard'), ctrl.getDashboard);

// ── Vendors list ──────────────────────────────────────────────────────────────
// GET ?status=approved|pending|rejected|suspended&city=Lagos&page=1&limit=20
router.get('/vendors',     auditMiddleware('car_wash_get_vendors'),  ctrl.getVendors);

// ── Single vendor detail (full profile + owner + docs + stats + services) ─────
router.get('/vendors/:id', auditMiddleware('car_wash_get_vendor'),   ctrl.getVendorById);

// ── Vendor wallet balance ─────────────────────────────────────────────────────
router.get('/vendors/:id/wallet-balance', auditMiddleware('car_wash_get_vendor_wallet'), ctrl.getVendorWalletBalance);

// ── Vendor booking/order history ─────────────────────────────────────────────
// GET ?status=completed&from=2026-08-01&to=2026-08-31&page=1&limit=20
router.get('/vendors/:id/bookings', auditMiddleware('car_wash_get_vendor_bookings'), ctrl.getVendorBookings);

// ── Vendor approval actions ───────────────────────────────────────────────────
// NOTE: approve/reject also exist on PUT /api/admin/vendors/:id/approve|reject
// (platform-service vendors table). These act directly on car_wash_vendors table
// for cases where admin needs to act on an already-provisioned car wash vendor.
router.post('/vendors/:id/approve',    auditMiddleware('car_wash_approve_vendor'),    ctrl.approveVendor);
router.post('/vendors/:id/reject',     auditMiddleware('car_wash_reject_vendor'),     ctrl.rejectVendor);
router.post('/vendors/:id/suspend',    auditMiddleware('car_wash_suspend_vendor'),    ctrl.suspendVendor);
router.post('/vendors/:id/reactivate', auditMiddleware('car_wash_reactivate_vendor'), ctrl.reactivateVendor);

// ── All bookings (cross-vendor) ───────────────────────────────────────────────
// GET ?status=pending&vendor_id=uuid&from=2026-08-01&to=2026-08-31&page=1&limit=20
router.get('/bookings', auditMiddleware('car_wash_get_bookings'), ctrl.getBookings);

export default router;
