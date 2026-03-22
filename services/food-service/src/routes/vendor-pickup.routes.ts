import { Router } from 'express';
import { VendorPickupController } from '../controllers/vendor-pickup.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const vendorPickupCtrl = new VendorPickupController();

router.use(authenticate);

// Vendor-side
router.post('/request', vendorPickupCtrl.createPickup);
router.get('/vendor/requests', vendorPickupCtrl.getPickups);
router.put('/:id/ready', vendorPickupCtrl.markReady);
router.post('/:id/cancel', vendorPickupCtrl.cancelPickup);
router.get('/:id', vendorPickupCtrl.getPickup);

export default router;
