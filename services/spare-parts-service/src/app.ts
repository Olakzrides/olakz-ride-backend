import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { internalApiAuth } from './middleware/internal-api.middleware';
import { logger } from './config/logger';
import { config } from './config/env';

export function createApp(): Application {
  const app = express();

  // Trust proxy (behind API gateway / nginx)
  app.set('trust proxy', true);

  // Security & parsing
  app.use(helmet());
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // Request logging
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, { ip: req.ip });
    next();
  });

  // ── Internal service-to-service routes ────────────────────────────────────
  // Called by platform-service with x-internal-api-key header.

  /**
   * POST /api/internal/spare-parts/vendor/provision
   *
   * Called automatically when admin approves a spare_parts vendor in
   * platform-service. Creates the spare_parts_stores row so the vendor
   * can log in and manage their store.
   *
   * Idempotent — if the store already exists, marks it verified and returns
   * the existing store_id. Safe to call multiple times.
   */
  app.post(
    '/api/internal/spare-parts/vendor/provision',
    internalApiAuth,
    async (req, res) => {
      try {
        const { supabase: db } = await import('./config/database');
        const {
          owner_id,
          vendor_id,
          business_name,
          address,
          city,
          state,
          phone,
          email,
          logo_url,
        } = req.body;

        if (!owner_id || !business_name) {
          return res
            .status(400)
            .json({ success: false, message: 'owner_id and business_name are required' });
        }

        // Check if store already exists for this owner
        const { data: existing } = await db
          .from('spare_parts_stores')
          .select('id')
          .eq('owner_id', owner_id)
          .single();

        if (existing) {
          // Idempotent — mark verified if not already
          await db
            .from('spare_parts_stores')
            .update({ is_verified: true, updated_at: new Date().toISOString() })
            .eq('owner_id', owner_id);

          logger.info('Spare parts store already exists — marked verified', { owner_id });
          return res.json({
            success: true,
            data: { store_id: existing.id },
            message: 'Already provisioned',
          });
        }

        // Create new spare_parts_stores row
        const { data: created, error } = await db
          .from('spare_parts_stores')
          .insert({
            owner_id,
            vendor_id: vendor_id ?? null,
            name: business_name,
            description: null,
            logo_url: logo_url ?? null,
            banner_url: null,
            address: address ?? '',
            city: city ?? '',
            state: state ?? '',
            latitude: 0,
            longitude: 0,
            phone: phone ?? null,
            email: email ?? null,
            is_active: true,
            is_open: false,
            is_verified: true,
            average_rating: 0,
            total_ratings: 0,
            total_orders: 0,
            operating_hours: {},
          })
          .select('id')
          .single();

        if (error) {
          logger.error('Provision spare parts store error:', error);
          return res.status(500).json({ success: false, message: error.message });
        }

        logger.info('Spare parts store provisioned', { owner_id, store_id: created.id });
        return res.status(201).json({
          success: true,
          data: { store_id: created.id },
          message: 'Spare parts store provisioned successfully',
        });
      } catch (err: any) {
        logger.error('Internal provision error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  /**
   * PATCH /api/internal/spare-parts/vendor/status
   *
   * Called by admin-service when a spare_parts vendor is suspended or
   * reactivated. Syncs is_active / is_verified to spare_parts_stores.
   */
  app.patch(
    '/api/internal/spare-parts/vendor/status',
    internalApiAuth,
    async (req, res) => {
      try {
        const { supabase: db } = await import('./config/database');
        const { owner_id, status } = req.body;

        if (!owner_id || !status) {
          return res
            .status(400)
            .json({ success: false, message: 'owner_id and status are required' });
        }

        const allowedStatuses = ['approved', 'suspended', 'rejected', 'inactive'];
        if (!allowedStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            message: `status must be one of: ${allowedStatuses.join(', ')}`,
          });
        }

        // Map vendor status to store flags
        const isActive   = status === 'approved';
        const isVerified = status === 'approved';

        const { error } = await db
          .from('spare_parts_stores')
          .update({
            is_active:    isActive,
            is_verified:  isVerified,
            updated_at:   new Date().toISOString(),
          })
          .eq('owner_id', owner_id);

        if (error) {
          logger.error('Sync spare parts vendor status error:', error);
          return res.status(500).json({ success: false, message: error.message });
        }

        logger.info('Spare parts store status synced', { owner_id, status });
        return res.json({ success: true });
      } catch (err: any) {
        logger.error('Internal status sync error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  /**
   * GET /api/internal/spare-parts/orders/:orderId
   *
   * Allows other services (e.g. admin-service) to look up an order by ID.
   */
  app.get(
    '/api/internal/spare-parts/orders/:orderId',
    internalApiAuth,
    async (req, res) => {
      try {
        const { supabase: db } = await import('./config/database');
        const { data, error } = await db
          .from('spare_parts_orders')
          .select(
            'id, customer_id, store_id, rider_id, status, total_amount, payment_method, payment_status'
          )
          .eq('id', req.params.orderId)
          .single();

        if (error || !data) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }
        return res.json({ success: true, data });
      } catch (err: any) {
        logger.error('Internal get order error:', err);
        return res.status(500).json({ success: false, message: err.message });
      }
    }
  );

  // Mount public/authenticated routes
  app.use(routes);

  // Error handling (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
