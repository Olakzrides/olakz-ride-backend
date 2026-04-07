import { Router } from 'express';
import { RiderController } from '../controllers/rider.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const riderCtrl = new RiderController();

router.use(authenticate);

// Static routes first
router.get('/available', riderCtrl.getAvailableOrders);
router.get('/active', riderCtrl.getActiveOrders);
router.get('/history', riderCtrl.getHistory);
router.get('/earnings', riderCtrl.getEarnings);
router.post('/location', riderCtrl.updateLocation);

// Param routes
router.post('/:id/accept', riderCtrl.acceptOrder);
router.post('/:id/reject', riderCtrl.rejectOrder);
router.post('/:id/cancel', riderCtrl.cancelOrder);
router.post('/:id/picked-up', riderCtrl.pickedUp);
router.post('/:id/arrived', riderCtrl.arrived);
router.post('/:id/delivered', riderCtrl.delivered);

export default router;
