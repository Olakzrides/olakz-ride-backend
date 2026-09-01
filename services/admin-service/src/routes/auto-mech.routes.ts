import { Router } from 'express';
import { AutoMechAdminController } from '../controllers/auto-mech-admin.controller';
import { adminAuthMiddleware } from '../middleware/auth.middleware';
import { rbacMiddleware } from '../middleware/rbac.middleware';
import { auditMiddleware } from '../middleware/audit.middleware';

const router = Router();
const ctrl = new AutoMechAdminController();

router.use(adminAuthMiddleware);
router.use(rbacMiddleware);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', auditMiddleware('auto_mech_get_dashboard'), ctrl.getDashboard);

// ── Vendors list ──────────────────────────────────────────────────────────────
// GET ?status=approved|pending|rejected|suspended&city=Lagos&page=1&limit=20
router.get('/vendors',     auditMiddleware('auto_mech_get_vendors'), ctrl.getVendors);

// ── Single vendor detail (full profile + owner + docs + stats + services) ─────
router.get('/vendors/:id', auditMiddleware('auto_mech_get_vendor'),  ctrl.getVendorById);

// ── Vendor wallet balance ─────────────────────────────────────────────────────
router.get('/vendors/:id/wallet-balance', auditMiddleware('auto_mech_get_vendor_wallet'), ctrl.getVendorWalletBalance);

// ── Vendor booking history ────────────────────────────────────────────────────
// GET ?status=completed&from=2026-08-01&to=2026-08-31&page=1&limit=20
router.get('/vendors/:id/bookings', auditMiddleware('auto_mech_get_vendor_bookings'), ctrl.getVendorBookings);

// ── Vendor approval actions ───────────────────────────────────────────────────
router.post('/vendors/:id/approve',    auditMiddleware('auto_mech_approve_vendor'),    ctrl.approveVendor);
router.post('/vendors/:id/reject',     auditMiddleware('auto_mech_reject_vendor'),     ctrl.rejectVendor);
router.post('/vendors/:id/suspend',    auditMiddleware('auto_mech_suspend_vendor'),    ctrl.suspendVendor);
router.post('/vendors/:id/reactivate', auditMiddleware('auto_mech_reactivate_vendor'), ctrl.reactivateVendor);

// ── All bookings (cross-vendor) ───────────────────────────────────────────────
// GET ?status=pending&vendor_id=uuid&from=2026-08-01&to=2026-08-31&page=1&limit=20
router.get('/bookings/status-counts', auditMiddleware('auto_mech_get_booking_counts'), ctrl.getBookingStatusCounts);
router.get('/bookings/:bookingId',    auditMiddleware('auto_mech_get_booking'),        ctrl.getBookingById);
router.get('/bookings',               auditMiddleware('auto_mech_get_bookings'),       ctrl.getBookings);

export default router;
