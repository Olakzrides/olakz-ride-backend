import { Router } from 'express';
import publicRoutes      from './public.routes';
import vendorRoutes      from './vendor.routes';
import customerRoutes    from './customer.routes';
import vendorOrderRoutes from './vendor-order.routes';

const router = Router();

// ── Health check ──────────────────────────────────────────────────────────────
// Gateway proxies /api/spare-parts/* → this service WITHOUT stripping the prefix.
// All routes must be registered at the full /api/spare-parts/* path.
router.get('/api/spare-parts/health', (_req, res) => {
  res.json({
    success:   true,
    service:   'spare-parts-service',
    status:    'healthy',
    timestamp: new Date().toISOString(),
  });
});

// ── Phase 2: Public browsing (no auth) ───────────────────────────────────────
// GET  /api/spare-parts/categories
// GET  /api/spare-parts/stores
// GET  /api/spare-parts/stores/:id
// GET  /api/spare-parts/stores/:id/products
// GET  /api/spare-parts/stores/:id/reviews
// GET  /api/spare-parts/products/:id
// GET  /api/spare-parts/products/:id/similar
// GET  /api/spare-parts/products/:id/reviews
// GET  /api/spare-parts/search
// GET  /api/spare-parts/delivery-options
router.use('/api/spare-parts', publicRoutes);

// ── Phase 2: Vendor store & product management ────────────────────────────────
// Requires JWT + approved spare_parts store
// GET/PUT  /api/spare-parts/vendor/store
// PUT      /api/spare-parts/vendor/store/status
// GET      /api/spare-parts/vendor/store/statistics
// GET      /api/spare-parts/vendor/upload-url
// CRUD     /api/spare-parts/vendor/products
router.use('/api/spare-parts/vendor', vendorRoutes);

// ── Phase 3: Vendor order management ─────────────────────────────────────────
// Requires JWT + approved spare_parts store
// NOTE: must be mounted BEFORE customer routes to avoid /vendor/:id ambiguity
// GET  /api/spare-parts/vendor/orders
// GET  /api/spare-parts/vendor/orders/:id
// POST /api/spare-parts/vendor/orders/:id/accept
// POST /api/spare-parts/vendor/orders/:id/reject
// PUT  /api/spare-parts/vendor/orders/:id/ready
router.use('/api/spare-parts/vendor/orders', vendorOrderRoutes);

// ── Phase 3: Customer cart, orders, addresses ─────────────────────────────────
// Requires JWT
// GET/POST/DELETE /api/spare-parts/cart
// POST /api/spare-parts/payment/estimate
// POST /api/spare-parts/orders
// GET  /api/spare-parts/orders/history
// GET  /api/spare-parts/orders/:id
// POST /api/spare-parts/orders/:id/cancel
// POST /api/spare-parts/orders/:id/review
// CRUD /api/spare-parts/addresses
router.use('/api/spare-parts', customerRoutes);

// ── Phase 4: Rider delivery lifecycle ────────────────────────────────────────
// Requires JWT (driver role)
// GET  /api/spare-parts/rider/available
// GET  /api/spare-parts/rider/active
// GET  /api/spare-parts/rider/history
// GET  /api/spare-parts/rider/earnings
// POST /api/spare-parts/rider/location
// POST /api/spare-parts/rider/:id/accept
// POST /api/spare-parts/rider/:id/reject
// POST /api/spare-parts/rider/:id/cancel
// POST /api/spare-parts/rider/:id/heading-to-store
// POST /api/spare-parts/rider/:id/picked-up
// POST /api/spare-parts/rider/:id/heading-to-customer
// POST /api/spare-parts/rider/:id/arrived
// POST /api/spare-parts/rider/:id/delivered
// POST /api/spare-parts/rider/:id/confirm-cash
import riderRoutes from './rider.routes';
router.use('/api/spare-parts/rider', riderRoutes);

export default router;
