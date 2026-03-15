import { Application } from 'express';
import storeRoutes from './store.routes';
import servicesRoutes from './services.routes';
import billsRoutes, { webhookRouter } from './bills.routes';
import logger from '../utils/logger';

export function setupRoutes(app: Application): void {
  // Mount routes with /api prefix (following core logistics pattern)
  app.use('/api', storeRoutes);
  app.use('/api', servicesRoutes);

  // Webhook must be mounted BEFORE the authenticated bills router
  app.use('/api/bills', webhookRouter);

  app.use('/api/bills', billsRoutes);

  logger.info('Platform service routes configured successfully');
}