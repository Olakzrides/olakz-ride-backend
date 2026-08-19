import { Router } from 'express';
import discoveryRoutes from './discovery.routes';
import vendorRoutes from './vendor.routes';
import vendorDashboardRoutes from './vendor-dashboard.routes';
import serviceRoutes from './service.routes';
import bookingRoutes from './booking.routes';
import availabilityRoutes from './availability.routes';

const router = Router();

// ── Home screen discovery ──────────────────────────────────────────────────
// Must be before /vendors/:vendorId to avoid conflicts
router.use('/api/car-wash', discoveryRoutes);

// ── Vendor dashboard (single authenticated vendor managing their own shop) ──
// /api/car-wash/vendor/* — must come before /vendors/:vendorId
router.use('/api/car-wash/vendor', vendorDashboardRoutes);

// ── Public vendor profiles + vendor-owner management ──────────────────────
router.use('/api/car-wash/vendors', vendorRoutes);

// ── Wash service packages ──────────────────────────────────────────────────
router.use('/api/car-wash', serviceRoutes);

// ── Slot availability calendar ────────────────────────────────────────────
router.use('/api/car-wash', availabilityRoutes);

// ── Bookings ──────────────────────────────────────────────────────────────
router.use('/api/car-wash/bookings', bookingRoutes);

// ── Health check ──────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'car-wash-service', status: 'healthy', timestamp: new Date().toISOString() });
});

export default router;
