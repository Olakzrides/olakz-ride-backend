import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { StorageUtil } from './utils/storage.util';
import { logger } from './config/logger';

export function createApp(): Application {
  const app = express();

  // Trust proxy - required when behind gateway/reverse proxy
  app.set('trust proxy', true);

  // Initialize storage bucket
  StorageUtil.initializeBucket().catch(error => {
    logger.error('Failed to initialize storage bucket:', error);
  });

  // Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  }));

  // Body parsing middleware - Increased limits for file uploads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logging
  app.use((req, _res, next) => {
    logger.info(`${req.method} ${req.path}`, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    next();
  });

  // Mount routes
  app.use(routes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
