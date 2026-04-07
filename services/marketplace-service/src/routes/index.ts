import { Application } from 'express';
import publicRoutes from './public.routes';
import customerRoutes from './customer.routes';
import vendorRoutes from './vendor.routes';
import riderRoutes from './rider.routes';
import adminRoutes from './admin.routes';
import internalRoutes from './internal.routes';

export function setupRoutes(app: Application): void {
  app.use('/api/marketplace', publicRoutes);
  app.use('/api/marketplace', customerRoutes);
  app.use('/api/marketplace/vendor', vendorRoutes);
  app.use('/api/marketplace/rider', riderRoutes);
  app.use('/api/marketplace/admin', adminRoutes);
  app.use('/api/internal/marketplace', internalRoutes);
}
