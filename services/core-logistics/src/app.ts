import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
    // Validate trust proxy setting to avoid security warnings
    validate: { trustProxy: false }, // We handle proxy trust at app level
  });
  app.use('/api', limiter);

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
