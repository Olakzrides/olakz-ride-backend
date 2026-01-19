import { Router } from 'express';
import { DriverController } from '../controllers/driver.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();
const driverController = new DriverController();

// Public routes
router.post('/nearby', driverController.findNearbyDrivers);

// Driver routes (require authentication)
router.post('/register', authenticate, driverController.registerDriver);
router.get('/profile', authenticate, driverController.getProfile);
router.put('/profile', authenticate, driverController.updateProfile);
router.post('/vehicle', authenticate, driverController.upsertVehicle);
router.post('/documents', authenticate, upload.single('file'), driverController.uploadDocument);
router.put('/status', authenticate, driverController.updateStatus);
router.post('/location', authenticate, driverController.updateLocation);

// Admin routes (require authentication + admin role)
router.get('/', authenticate, driverController.getAllDrivers);
router.get('/:driverId', authenticate, driverController.getDriverById);
router.get('/:driverId/location', authenticate, driverController.getDriverLocation);
router.put('/:driverId/approve', authenticate, driverController.approveDriver);
router.put('/documents/:documentId/verify', authenticate, driverController.verifyDocument);

export default router;
