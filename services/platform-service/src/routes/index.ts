import { Application } from 'express';
import storeRoutes from './store.routes';
import servicesRoutes from './services.routes';
import logger from '../utils/logger';

export function setupRoutes(app: Application): void {
  // Mount routes with /api prefix (following core logistics pattern)
  app.use('/api', storeRoutes);
  app.use('/api', servicesRoutes);

  logger.info('Platform service routes configured successfully');
}