import { Router } from 'express';
import cartRoutes from './cart.routes';
import rideRoutes from './ride.routes';
import variantRoutes from './variant.routes';
import driverRoutes from './driver.routes';
import driverRegistrationRoutes from './driver-registration.routes';
import driverRideRoutes from './driver-ride.routes';
import walletRoutes from './wallet.routes';
import adminDocumentRoutes from './admin-document.routes';
import adminDriverRoutes from './admin-driver.routes';
import notificationRoutes from './notification.routes';
import savedPlacesRoutes from './saved-places.routes';
import paymentCardsRoutes from './payment-cards.routes';
import supportRoutes from './support.routes';
import { RideController } from '../controllers/ride.controller';

const router = Router();
const rideController = new RideController();

// PUBLIC ROUTES - No authentication required (must be first!)
// Phase 3.2: Public ride tracking
router.get('/api/rides/track/:shareToken', rideController.trackRideByToken);

// Mount public routes first (before routes with global auth)
router.use('/api/driver-registration', driverRegistrationRoutes);
router.use('/api/drivers', driverRoutes);
router.use('/api', variantRoutes);

// Mount admin routes (with admin auth middleware)
router.use('/api/admin/documents', adminDocumentRoutes);
router.use('/api/admin/drivers', adminDriverRoutes);

// Mount routes with global auth middleware last
router.use('/api', cartRoutes);
router.use('/api', rideRoutes);
router.use('/api', walletRoutes);
router.use('/api', driverRideRoutes); // Phase 2A: Driver ride operations
router.use('/api/notifications', notificationRoutes); // Phase 2B: Push notifications
router.use('/api', savedPlacesRoutes); // Phase 1: Saved places
router.use('/api/payment/cards', paymentCardsRoutes); // Phase 2: Payment cards
router.use('/api/support', supportRoutes); // Phase 3.3: WhatsApp support

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'core-logistics',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
