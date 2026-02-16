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

// Get scheduled rides
router.get('/ride/scheduled', rideController.getScheduledRides);

// Get ride status
router.get('/ride/:rideId/status', rideController.getRideStatus);

// Get ride details (alias for status)
router.get('/ride/:rideId', rideController.getRideStatus);

// Cancel ride
router.post('/ride/:rideId/cancel', rideController.cancelRide);

// Cancel scheduled ride
router.post('/ride/:rideId/cancel-scheduled', rideController.cancelScheduledRide);

// Rate driver (passenger rates driver)
router.post('/ride/:rideId/rate', rideController.rateDriver);

// Add tip to completed ride
router.post('/ride/:rideId/tip', rideController.addTip);

// Share ride
router.post('/rides/:rideId/share', rideController.generateShareLink);

// Revoke share link
router.post('/rides/:rideId/revoke-share', rideController.revokeShareLink);

// Get recently visited locations
router.get('/locations/recent', rideController.getRecentLocations);

export default router;
