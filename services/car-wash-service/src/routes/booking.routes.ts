import { Router } from 'express';
import { BookingController } from '../controllers/booking.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();
const ctrl = new BookingController();

// All booking routes require authentication
router.use(authenticate);

// ── Vendor endpoints — MUST come before /:bookingId ──────────────────────────
// "vendor" is a literal path segment. If /:bookingId is declared first,
// Express treats "vendor" as a bookingId value and calls getBooking instead.
router.get('/vendor/all',                 authorize('vendor'), ctrl.getVendorBookings);
router.post('/vendor/:bookingId/confirm', authorize('vendor'), ctrl.confirmBooking);
router.post('/vendor/:bookingId/start',   authorize('vendor'), ctrl.startBooking);
router.post('/vendor/:bookingId/complete',authorize('vendor'), ctrl.completeBooking);

// ── Customer endpoints ────────────────────────────────────────────────────────
router.post('/',              authorize('customer'), ctrl.createBooking);
router.get('/',               authorize('customer'), ctrl.getMyBookings);
router.post('/:bookingId/photos', upload.array('photos', 3), authorize('customer'), ctrl.attachPhotos);
router.post('/:bookingId/cancel', authorize('customer'), ctrl.cancelBooking);
router.post('/:bookingId/rate',   authorize('customer'), ctrl.rateBooking);

// ── Shared: customer or vendor can view a single booking ─────────────────────
// Must be LAST — /:bookingId is a catch-all dynamic segment
router.get('/:bookingId', ctrl.getBooking);

export default router;
