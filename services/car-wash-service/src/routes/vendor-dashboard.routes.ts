import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { ServiceController } from '../controllers/service.controller';
import { BookingController } from '../controllers/booking.controller';
import { CategoryController } from '../controllers/category.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
const vendorCtrl   = new VendorController();
const serviceCtrl  = new ServiceController();
const bookingCtrl  = new BookingController();
const categoryCtrl = new CategoryController();

// All vendor dashboard routes require authentication + vendor role
router.use(authenticate, authorize('vendor'));

// ── Profile ───────────────────────────────────────────────────────────────────
router.get('/profile',            vendorCtrl.getMyVendorProfile);
router.put('/profile',            vendorCtrl.updateMyVendorProfile);

// ── Store Details (open/closed, auto-accept, service time) ───────────────────
router.get('/store-details',      vendorCtrl.getStoreDetails);
router.put('/store-details',      vendorCtrl.updateStoreDetails);

// ── Store Operations (operating hours schedule) ───────────────────────────────
router.get('/store-operations',   vendorCtrl.getStoreOperations);
router.put('/store-operations',   vendorCtrl.updateStoreOperations);

// ── Statistics ────────────────────────────────────────────────────────────────
router.get('/statistics',         vendorCtrl.getStatistics);

// ── Reviews (own) ─────────────────────────────────────────────────────────────
router.get('/reviews',            vendorCtrl.getMyReviews);

// ── Categories — MUST come before /services to avoid Express route conflict ───
// GET grouped shows services organised under both system + custom categories
router.get('/categories/all',     categoryCtrl.getAllCategories);
router.get('/categories/grouped', categoryCtrl.getGroupedServices);
router.get('/categories',         categoryCtrl.getMyCategories);
router.post('/categories',        categoryCtrl.createCategory);
router.patch('/categories/:categoryId', categoryCtrl.updateCategory);
router.delete('/categories/:categoryId', categoryCtrl.deleteCategory);

// ── Services / Packages ───────────────────────────────────────────────────────
router.get('/services',               serviceCtrl.getMyServices);
router.post('/services',              serviceCtrl.createService);
router.patch('/services/:serviceId',  serviceCtrl.updateService);
// Toggle service active/inactive — PATCH not DELETE, service is never removed
router.patch('/services/:serviceId/toggle', serviceCtrl.toggleService);

// Assign service to a custom category (or null to unassign)
router.patch('/services/:serviceId/category', categoryCtrl.assignServiceCategory);

// ── Bookings ──────────────────────────────────────────────────────────────────
router.get('/bookings',                       bookingCtrl.getVendorBookings);
router.post('/bookings/:bookingId/decline',   bookingCtrl.declineBooking);
router.post('/bookings/:bookingId/confirm',   bookingCtrl.confirmBooking);
router.post('/bookings/:bookingId/start',     bookingCtrl.startBooking);
router.post('/bookings/:bookingId/complete',  bookingCtrl.completeBooking);

export default router;
