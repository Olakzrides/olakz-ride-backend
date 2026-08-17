import { Router } from 'express';
import discoveryRoutes from './discovery.routes';
import vendorRoutes from './vendor.routes';
import serviceRoutes from './service.routes';
import bookingRoutes from './booking.routes';
import availabilityRoutes from './availability.routes';

const router = Router();

// ── Home screen discovery (categories, top-rated, nearby, search) ──
// MUST be mounted before /vendors/:vendorId to avoid route conflicts
router.use('/api/car-wash', discoveryRoutes);

// ── Full vendor profile + vendor-owner management ──────────────────
router.use('/api/car-wash/vendors', vendorRoutes);

// ── Wash service packages (public read + vendor write) ─────────────
router.use('/api/car-wash', serviceRoutes);

// ── Slot availability calendar ─────────────────────────────────────
router.use('/api/car-wash', availabilityRoutes);

// ── Bookings (customer + vendor) ───────────────────────────────────
router.use('/api/car-wash/bookings', bookingRoutes);

// ── Health check ───────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'car-wash-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

export default router;
