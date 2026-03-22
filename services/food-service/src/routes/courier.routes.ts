import { Router } from 'express';
import { CourierController } from '../controllers/courier.controller';
import { authenticate } from '../middleware/auth.middleware';
import { uploadPhoto } from '../middleware/upload.middleware';

const router = Router();
const courierCtrl = new CourierController();

router.use(authenticate);

// ── Static routes MUST come before /:id param routes ──────────

// Phase 2: static
router.get('/available', courierCtrl.getAvailableDeliveries);
router.get('/active', courierCtrl.getActiveDeliveries);

// Phase 3: static (location, history, earnings)
router.post('/location', courierCtrl.updateLocation);
router.get('/history', courierCtrl.getDeliveryHistory);
router.get('/earnings', courierCtrl.getEarnings);

// ── Param routes (:id) ─────────────────────────────────────────

// Phase 2: Matching
router.post('/:id/accept', courierCtrl.acceptDelivery);
router.post('/:id/reject', courierCtrl.rejectDelivery);
router.post('/:id/cancel', courierCtrl.cancelDelivery);

// Phase 3: Execution flow
router.post('/:id/arrived-vendor', courierCtrl.arrivedAtVendor);
router.post('/:id/verify-pickup', courierCtrl.verifyPickupCode);
router.post('/:id/picked-up', uploadPhoto, courierCtrl.confirmPickedUp);
router.post('/:id/arrived-delivery', courierCtrl.arrivedAtDelivery);
router.post('/:id/verify-delivery', courierCtrl.verifyDeliveryCode);
router.post('/:id/delivered', uploadPhoto, courierCtrl.markDelivered);
router.post('/:id/upload-photo', uploadPhoto, courierCtrl.uploadPhoto);

export default router;
