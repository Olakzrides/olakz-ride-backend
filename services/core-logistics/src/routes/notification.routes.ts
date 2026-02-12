import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();
const notificationController = new NotificationController();

// All routes require authentication
router.use(authenticate);

// Device token management
router.post('/register-device', notificationController.registerDevice);
router.delete('/unregister-device', notificationController.unregisterDevice);

// Notification preferences
router.get('/preferences', notificationController.getPreferences);
router.put('/preferences', notificationController.updatePreferences);

// Notification history
router.get('/history', notificationController.getHistory);
router.put('/:id/read', notificationController.markAsRead);

// Test notification (development only)
router.post('/test', notificationController.testNotification);

export default router;
