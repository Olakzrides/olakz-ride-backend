import { Router } from 'express';
import cartRoutes from './cart.routes';
import rideRoutes from './ride.routes';
import variantRoutes from './variant.routes';
import driverRoutes from './driver.routes';
import driverRegistrationRoutes from './driver-registration.routes';
import walletRoutes from './wallet.routes';
import adminDocumentRoutes from './admin-document.routes';
import adminDriverRoutes from './admin-driver.routes';

const router = Router();

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
