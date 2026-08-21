import { Router } from 'express';

const router = Router();

// ── Health check ──────────────────────────────────────────────────────────────
// Accessible at GET /api/spare-parts/health via the gateway
// (gateway strips /api/spare-parts and forwards /health to the service)
// Also directly accessible at GET /health on the service port
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'spare-parts-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// ── Phase 2: Public browsing routes ──────────────────────────────────────────
// GET  /api/spare-parts/categories
// GET  /api/spare-parts/stores
// GET  /api/spare-parts/stores/:id
// GET  /api/spare-parts/stores/:id/products
// GET  /api/spare-parts/stores/:id/reviews
// GET  /api/spare-parts/products/:id
// GET  /api/spare-parts/products/:id/similar
// GET  /api/spare-parts/products/:id/reviews
// GET  /api/spare-parts/search
// TODO: import publicRoutes from './public.routes';
// TODO: router.use('/api/spare-parts', publicRoutes);

// ── Phase 2: Vendor store/product management routes ───────────────────────────
// GET/PUT  /api/spare-parts/vendor/store
// PUT      /api/spare-parts/vendor/store/status
// GET      /api/spare-parts/vendor/store/statistics
// GET      /api/spare-parts/vendor/upload-url
// CRUD     /api/spare-parts/vendor/products
// GET/POST /api/spare-parts/vendor/orders
// TODO: import vendorRoutes from './vendor.routes';
// TODO: router.use('/api/spare-parts/vendor', vendorRoutes);

// ── Phase 3: Customer cart, orders, addresses ──────────────────────────────────
// CRUD /api/spare-parts/cart
// CRUD /api/spare-parts/addresses       (reads marketplace_saved_addresses)
// POST /api/spare-parts/payment/estimate
// POST /api/spare-parts/orders
// GET  /api/spare-parts/orders/history
// GET  /api/spare-parts/orders/:id
// POST /api/spare-parts/orders/:id/cancel
// POST /api/spare-parts/orders/:id/review
// TODO: import customerRoutes from './customer.routes';
// TODO: router.use('/api/spare-parts', customerRoutes);

// ── Phase 4: Rider delivery lifecycle ─────────────────────────────────────────
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
// TODO: import riderRoutes from './rider.routes';
// TODO: router.use('/api/spare-parts/rider', riderRoutes);

export default router;
