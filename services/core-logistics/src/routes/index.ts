import { Router } from 'express';
import cartRoutes from './cart.routes';
import rideRoutes from './ride.routes';
import variantRoutes from './variant.routes';
import driverRoutes from './driver.routes';

const router = Router();

// Mount routes
router.use('/api', cartRoutes);
router.use('/api', rideRoutes);
router.use('/api', variantRoutes);
router.use('/api/drivers', driverRoutes);

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
