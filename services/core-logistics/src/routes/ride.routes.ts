import { Router } from 'express';
import { RideController } from '../controllers/ride.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const rideController = new RideController();

// All ride routes require authentication
router.use(authenticate);

// Request ride
router.post('/ride/request', rideController.requestRide);

// Get ride history (MUST be before :rideId routes)
router.get('/ride/history', rideController.getRideHistory);

// Get ride status
router.get('/ride/:rideId/status', rideController.getRideStatus);

// Get ride details (alias for status)
router.get('/ride/:rideId', rideController.getRideStatus);

// Cancel ride
router.post('/ride/:rideId/cancel', rideController.cancelRide);

export default router;
