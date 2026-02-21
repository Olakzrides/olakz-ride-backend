import { Router } from 'express';
import { DeliveriesController } from '../controllers/deliveries.controller';
import { authenticate } from '../../../middleware/auth.middleware';

const router = Router();
const deliveriesController = new DeliveriesController();

// All delivery routes require authentication
router.use(authenticate);

// ==================== CUSTOMER ENDPOINTS ====================

// Generate signed upload URL for package photo
router.post('/upload/package-photo', deliveriesController.generatePackagePhotoUploadUrl);

// Get available vehicle types for delivery
router.get('/vehicle-types', deliveriesController.getVehicleTypes);

// Estimate delivery fare
router.post('/estimate-fare', deliveriesController.estimateFare);

// Create delivery order (Pure JSON - no file upload)
router.post('/order', deliveriesController.createDelivery);

// Validate card payment with OTP
router.post('/:id/validate-payment', deliveriesController.validateCardPayment);

// Get delivery history (MUST be before :id routes)
router.get('/history', deliveriesController.getHistory);

// Upload package photo
router.post('/upload-photo', deliveriesController.uploadPhoto);

// ==================== COURIER ENDPOINTS ====================
// NOTE: These MUST come before /:id routes to avoid route conflicts

// Get available deliveries for courier
router.get('/courier/available', deliveriesController.getAvailableDeliveries);

// Get courier delivery history
router.get('/courier/history', deliveriesController.getCourierHistory);

// ==================== DELIVERY-SPECIFIC ENDPOINTS ====================
// NOTE: These use :id parameter and must come AFTER specific routes like /courier/*

// Get delivery details
router.get('/:id', deliveriesController.getDelivery);

// Get delivery status history
router.get('/:id/history', deliveriesController.getStatusHistory);

// Update delivery status
router.put('/:id/status', deliveriesController.updateStatus);

// Cancel delivery
router.post('/:id/cancel', deliveriesController.cancelDelivery);

// Verify pickup code
router.post('/:id/verify-pickup', deliveriesController.verifyPickupCode);

// Verify delivery code
router.post('/:id/verify-delivery', deliveriesController.verifyDeliveryCode);

// Accept delivery
router.post('/:id/accept', deliveriesController.acceptDelivery);

// Reject delivery
router.post('/:id/reject', deliveriesController.rejectDelivery);

// Arrived at pickup location
router.post('/:id/arrived-pickup', deliveriesController.arrivedAtPickup);

// Start delivery (after pickup)
router.post('/:id/start-delivery', deliveriesController.startDelivery);

// Arrived at delivery location
router.post('/:id/arrived-delivery', deliveriesController.arrivedAtDelivery);

// Upload pickup photo
router.post('/:id/pickup-photo', deliveriesController.uploadPickupPhoto);

// Upload delivery photo
router.post('/:id/delivery-photo', deliveriesController.uploadDeliveryPhoto);

export default router;
