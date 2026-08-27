import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { internalApiAuth } from './middleware/internal-api.middleware';
import { StorageUtil } from './utils/storage.util';
import { logger } from './config/logger';
import { config } from './config/env';

export function createApp(): Application {
  const app = express();

  // Trust proxy (behind API gateway / nginx)
  app.set('trust proxy', true);

  // Initialise storage bucket on startup
  StorageUtil.initializeBucket().catch((err) =>
    logger.error('Failed to initialise auto-mech storage bucket:', err)
  );

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

  /**
   * POST /api/internal/auto-mech/vendor/provision
   * Called automatically when admin approves an auto_mech vendor.
   */
  app.post('/api/internal/auto-mech/vendor/provision', internalApiAuth, async (req, res) => {
    try {
      const { supabase: db } = await import('./config/database');
      const { user_id, business_name, address, city, state, phone, email, logo_url } = req.body;

      if (!user_id || !business_name) {
        return res.status(400).json({ success: false, message: 'user_id and business_name are required' });
      }

      const { data: existing } = await db
        .from('auto_mech_vendors')
        .select('id')
        .eq('user_id', user_id)
        .single();

      if (existing) {
        await db
          .from('auto_mech_vendors')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('user_id', user_id);
        logger.info('Auto mech vendor already exists — marked approved', { user_id });
        return res.json({ success: true, data: { vendor_id: existing.id }, message: 'Already provisioned' });
      }

      const { data: created, error } = await db
        .from('auto_mech_vendors')
        .insert({
          user_id,
          business_name,
          description: null,
          phone: phone ?? '',
          email: email ?? null,
          address: address ?? '',
          city: city ?? '',
          state: state ?? '',
          latitude: 0,
          longitude: 0,
          logo_url: logo_url ?? null,
          cover_image_url: null,
          status: 'approved',
          rating: 0,
          total_customers: 0,
          total_hours_served: 0,
          operating_hours: {},
        })
        .select('id')
        .single();

      if (error) {
        logger.error('Provision auto mech vendor error:', error);
        return res.status(500).json({ success: false, message: error.message });
      }

      logger.info('Auto mech vendor provisioned', { user_id, vendor_id: created.id });
      return res.status(201).json({
        success: true,
        data: { vendor_id: created.id },
        message: 'Auto mech vendor provisioned',
      });
    } catch (err: any) {
      logger.error('Internal provision error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * PATCH /api/internal/auto-mech/vendor/status
   * Called by admin-service when a vendor is suspended or reactivated.
   */
  app.patch('/api/internal/auto-mech/vendor/status', internalApiAuth, async (req, res) => {
    try {
      const { supabase: db } = await import('./config/database');
      const { user_id, status } = req.body;

      if (!user_id || !status) {
        return res.status(400).json({ success: false, message: 'user_id and status are required' });
      }

      const allowedStatuses = ['approved', 'suspended', 'rejected', 'inactive'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `status must be one of: ${allowedStatuses.join(', ')}`,
        });
      }

      const { error } = await db
        .from('auto_mech_vendors')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('user_id', user_id);

      if (error) {
        logger.error('Sync auto mech vendor status error:', error);
        return res.status(500).json({ success: false, message: error.message });
      }

      logger.info('Auto mech vendor status synced', { user_id, status });
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal status sync error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * GET /api/internal/auto-mech/bookings/:bookingId
   */
  app.get('/api/internal/auto-mech/bookings/:bookingId', internalApiAuth, async (req, res) => {
    try {
      const { supabase: db } = await import('./config/database');
      const { data, error } = await db
        .from('auto_mech_bookings')
        .select('id, customer_id, vendor_id, service_id, status, total_amount, payment_status')
        .eq('id', req.params.bookingId)
        .single();

      if (error || !data) return res.status(404).json({ success: false, message: 'Booking not found' });
      return res.json({ success: true, data });
    } catch (err: any) {
      logger.error('Internal get booking error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  /**
   * POST /api/internal/auto-mech/bookings/:bookingId/payment-confirmed
   */
  app.post('/api/internal/auto-mech/bookings/:bookingId/payment-confirmed', internalApiAuth, async (req, res) => {
    try {
      const { supabase: db } = await import('./config/database');
      const { error } = await db
        .from('auto_mech_bookings')
        .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', req.params.bookingId);

      if (error) return res.status(500).json({ success: false, message: error.message });
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal payment confirmed error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Mount public/authenticated routes
  app.use(routes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
