import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import 'express-async-errors'; // Handles async errors automatically
import { corsMiddleware } from './middleware/cors.middleware';
import { generalRateLimiter } from './middleware/rate-limit.middleware';
import {
  morganMiddleware,
  requestLogger,
} from './middleware/logging.middleware';
import {
  errorMiddleware,
  notFoundMiddleware,
} from './middleware/error.middleware';
import { healthCheckHandler } from './middleware/health.middleware';
import { setupRoutes } from './routes';
import logger from './utils/logger';
import config from './config';

// Create Express app
const app: Application = express();

// Trust proxy - important for rate limiting and IP logging
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow frontend to load resources
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(corsMiddleware);



// Request logging
app.use(morganMiddleware);
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// General rate limiting (applied to all routes)
app.use(generalRateLimiter);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'API Gateway',
    version: '1.0.0',
    status: 'running',
    environment: config.env,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      auth: '/api/auth/*',
      ride: '/api/ride/*',
      carts: '/api/carts/*',
      variants: '/api/variants',
      drivers: '/api/drivers/*',
      deliveries: '/api/deliveries/*',
      riders: '/api/riders/*',
      tracking: '/api/tracking/*',
      pricing: '/api/pricing/*',
      payments: '/api/payments/*',
      store: '/store/*',
      services: '/services/*',
    },
  });
});

// Health check endpoint
app.get('/health', healthCheckHandler);

// Setup proxy routes
setupRoutes(app);

// 404 handler (must be after all routes)
app.use(notFoundMiddleware);

// Global error handler (must be last)
app.use(errorMiddleware);

logger.info('Express app configured successfully');

export default app;