import { Application } from 'express';
import publicRoutes from './public.routes';
import customerRoutes from './customer.routes';
import vendorRoutes from './vendor.routes';
import riderRoutes from './rider.routes';
import internalRoutes from './internal.routes';

export function setupRoutes(app: Application): void {
  app.use('/api/marketplace', publicRoutes);
  app.use('/api/marketplace', customerRoutes);
  app.use('/api/marketplace/vendor', vendorRoutes);
  app.use('/api/marketplace/rider', riderRoutes);
  app.use('/api/internal/marketplace', internalRoutes);
}
