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

// Body parsing middleware with multipart handling
const bodyParsingMiddleware = (req: any, res: any, next: any) => {
  const contentType = req.headers['content-type'] || '';
  
  // Skip body parsing for multipart/form-data - let the backend service handle it
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  
  // Apply normal body parsing for other content types
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) return next(err);
    express.urlencoded({ extended: true, limit: '10mb' })(req, res, next);
  });
};

// Apply body parsing middleware
app.use(bodyParsingMiddleware);

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
      users: '/api/users/*',
      ride: '/api/ride/*',
      carts: '/api/carts/*',
      variants: '/api/variants',
      drivers: '/api/drivers/*',
      driverRegistration: '/api/driver-registration/*',
      admin: '/api/admin/*',
      deliveries: '/api/deliveries/*',
      riders: '/api/riders/*',
      tracking: '/api/tracking/*',
      pricing: '/api/pricing/*',
      payments: '/api/payments/*',
      store: '/api/store/*',
      services: '/api/services/*',
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