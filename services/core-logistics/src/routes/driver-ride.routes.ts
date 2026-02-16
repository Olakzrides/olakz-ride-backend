import { Router } from 'express';
import { DriverRideController } from '../controllers/driver-ride.controller';
import { DriverAvailabilityController } from '../controllers/driver-availability.controller';
import { DriverLocationController } from '../controllers/driver-location.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const rideController = new DriverRideController();
const availabilityController = new DriverAvailabilityController();
const locationController = new DriverLocationController();

// All driver routes require authentication
router.use(authenticate);

// Driver Availability
router.post('/availability/online', availabilityController.goOnline);
router.post('/availability/offline', availabilityController.goOffline);
router.get('/availability/status', availabilityController.getStatus);

// Driver Ride Requests
router.post('/rides/requests/:id/accept', rideController.acceptRideRequest);
router.post('/rides/requests/:id/decline', rideController.declineRideRequest);
router.get('/rides/pending', rideController.getPendingRequests);

// Driver Ride Lifecycle
router.post('/rides/:rideId/arrived', rideController.markArrived);
router.post('/rides/:rideId/start', rideController.startTrip);
router.post('/rides/:rideId/complete', rideController.completeTrip);

// Driver Ride Management
router.get('/rides/active', rideController.getActiveRide);
router.get('/rides/history', rideController.getRideHistory);

// Driver Rating
router.post('/rides/:rideId/rate-passenger', rideController.ratePassenger);

// Driver Location
router.post('/location', locationController.updateLocation);
router.get('/location', locationController.getLocation);

export default router;
