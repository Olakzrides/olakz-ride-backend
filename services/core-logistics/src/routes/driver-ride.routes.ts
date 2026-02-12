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
router.post('/drivers/availability/online', availabilityController.goOnline);
router.post('/drivers/availability/offline', availabilityController.goOffline);
router.get('/drivers/availability/status', availabilityController.getStatus);

// Driver Ride Requests
router.post('/drivers/rides/requests/:id/accept', rideController.acceptRideRequest);
router.post('/drivers/rides/requests/:id/decline', rideController.declineRideRequest);
router.get('/drivers/rides/pending', rideController.getPendingRequests);

// Driver Ride Lifecycle
router.post('/drivers/rides/:rideId/arrived', rideController.markArrived);
router.post('/drivers/rides/:rideId/start', rideController.startTrip);
router.post('/drivers/rides/:rideId/complete', rideController.completeTrip);

// Driver Ride Management
router.get('/drivers/rides/active', rideController.getActiveRide);
router.get('/drivers/rides/history', rideController.getRideHistory);

// Driver Rating
router.post('/drivers/rides/:rideId/rate-passenger', rideController.ratePassenger);

// Driver Location
router.post('/drivers/location', locationController.updateLocation);
router.get('/drivers/location', locationController.getLocation);

export default router;
