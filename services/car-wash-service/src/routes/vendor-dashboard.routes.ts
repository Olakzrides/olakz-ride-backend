import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { ServiceController } from '../controllers/service.controller';
import { BookingController } from '../controllers/booking.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
const vendorCtrl  = new VendorController();
const serviceCtrl = new ServiceController();
const bookingCtrl = new BookingController();

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

// ── Services / Packages ───────────────────────────────────────────────────────
router.get('/services',           serviceCtrl.getMyServices);
router.post('/services',          serviceCtrl.createService);
router.patch('/services/:serviceId', serviceCtrl.updateService);
router.delete('/services/:serviceId', serviceCtrl.deleteService);

// ── Bookings ──────────────────────────────────────────────────────────────────
router.get('/bookings',                       bookingCtrl.getVendorBookings);
router.post('/bookings/:bookingId/confirm',   bookingCtrl.confirmBooking);
router.post('/bookings/:bookingId/start',     bookingCtrl.startBooking);
router.post('/bookings/:bookingId/complete',  bookingCtrl.completeBooking);

export default router;
