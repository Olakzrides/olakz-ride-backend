import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import 'express-async-errors';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware';
import { setupRoutes } from './routes';
import logger from './utils/logger';
import config from './config';
import Database from './utils/database';

// Create Express app
const app: Application = express();

// Trust proxy for rate limiting and IP logging
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'error' : 'info';
    
    logger.log(logLevel, 'Request completed', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.get('X-User-Id') || 'anonymous'
    });
  });
  
  next();
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'Platform Service',
    version: '1.0.0',
    status: 'running',
    environment: config.env,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      storeInit: '/api/store/init',
      serviceSelect: '/api/services/select',
      serviceContext: '/api/services/context',
    },
  });
});

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const dbHealthy = await Database.healthCheck();
    
    const health = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      service: 'platform-service',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: dbHealthy ? 'connected' : 'disconnected',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    };

    const statusCode = dbHealthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error: any) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'platform-service',
      version: '1.0.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Setup routes
setupRoutes(app);

// 404 handler (must be after all routes)
app.use(notFoundMiddleware);

// Global error handler (must be last)
app.use(errorMiddleware);

logger.info('Platform service app configured successfully');

export default app;