import { Application, Router, Request, Response } from 'express';
import foodRoutes from './food.routes';
import vendorRoutes from './vendor.routes';
import courierRoutes from './courier.routes';
import vendorPickupRoutes from './vendor-pickup.routes';
import analyticsRoutes from './analytics.routes';
import foodAdminRoutes from './food-admin.routes';
import { VendorProfileService } from '../services/vendor-profile.service';
import { ResponseUtil } from '../utils/response';
import logger from '../utils/logger';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'olakz-internal-api-key-2026-secure';

export function setupRoutes(app: Application): void {
  // ─── Internal endpoint — called by platform-service on vendor approval ────────
  const internalRouter = Router();
  internalRouter.post('/vendor/provision', async (req: Request, res: Response) => {
    if (req.headers['x-internal-api-key'] !== INTERNAL_API_KEY) {
      return ResponseUtil.forbidden(res, 'Invalid internal API key');
    }
    try {
      const { user_id, business_name, address, city, state, phone, email, logo_url } = req.body;
      if (!user_id || !business_name || !address) {
        return ResponseUtil.badRequest(res, 'user_id, business_name, and address are required');
      }
      // Idempotent — if already exists, ensure is_verified is true
      const existing = await VendorProfileService.getByOwnerId(user_id);
      if (existing) {
        await VendorProfileService.setVerified(user_id, true);
        return ResponseUtil.success(res, { restaurant_id: existing.id }, 'Already provisioned');
      }
      await VendorProfileService.createForVendor(user_id, {
        name: business_name,
        address,
        latitude: 0,
        longitude: 0,
        phone,
        email,
        city,
        state,
        logoUrl: logo_url,
      });
      const created = await VendorProfileService.getByOwnerId(user_id);
      return ResponseUtil.created(res, { restaurant_id: created?.id }, 'Restaurant provisioned');
    } catch (e: any) {
      logger.error('Internal vendor provision error:', e);
      return ResponseUtil.serverError(res, e.message);
    }
  });
  app.use('/api/internal', internalRouter);

  app.use('/api/food', foodRoutes);
  app.use('/api/vendor', vendorRoutes);
  app.use('/api/food/courier', courierRoutes);
  app.use('/api/vendor-pickup', vendorPickupRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/food/admin', foodAdminRoutes);

  logger.info('Food service routes configured');
}
