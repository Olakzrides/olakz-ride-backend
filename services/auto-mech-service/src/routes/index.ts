import { Router } from 'express';
import discoveryRoutes from './discovery.routes';
import vendorRoutes from './vendor.routes';
import vendorDashboardRoutes from './vendor-dashboard.routes';
import serviceRoutes from './service.routes';
import bookingRoutes from './booking.routes';
import availabilityRoutes from './availability.routes';

const router = Router();

// ── Home screen discovery ──────────────────────────────────────────────────
router.use('/api/auto-mech', discoveryRoutes);

// ── Vendor dashboard (single authenticated vendor managing their own shop) ──
// Must come before /vendors/:vendorId
router.use('/api/auto-mech/vendor', vendorDashboardRoutes);

// ── Public vendor profiles + vendor-owner management ──────────────────────
router.use('/api/auto-mech/vendors', vendorRoutes);

// ── Mechanic service packages ──────────────────────────────────────────────
router.use('/api/auto-mech', serviceRoutes);

// ── Slot availability calendar ────────────────────────────────────────────
router.use('/api/auto-mech', availabilityRoutes);

// ── Bookings ──────────────────────────────────────────────────────────────
router.use('/api/auto-mech/bookings', bookingRoutes);

// ── Health check ──────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'auto-mech-service', status: 'healthy', timestamp: new Date().toISOString() });
});

export default router;
