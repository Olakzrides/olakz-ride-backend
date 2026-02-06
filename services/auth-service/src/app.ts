import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import config from './config';
import logger from './utils/logger';
import ResponseUtil from './utils/response';
import { AppError } from './utils/errors';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import emailRoutes from './routes/email.routes';

const app: Application = express();

// Trust proxy
app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({
  origin: config.cors.allowedOrigins,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'auth-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'Auth Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      register: 'POST /api/auth/register',
      verifyEmail: 'POST /api/auth/verify-email',
      login: 'POST /api/auth/login',
      google: 'GET /api/auth/google',
      appleSignIn: 'POST /api/auth/apple/signin',
      appleCallback: 'GET /api/auth/apple/callback',
      profile: 'GET /api/users/me (requires auth)',
    },
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', emailRoutes);
app.use('/api/users', userRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  ResponseUtil.error(res, `Route ${req.originalUrl} not found`, 404);
});

// Global error handler
app.use((err: Error | AppError, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err instanceof AppError) {
    ResponseUtil.error(res, err.message, err.statusCode);
    return;
  }

  // Joi validation errors
  if (err.name === 'ValidationError') {
    ResponseUtil.error(res, 'Validation error', 400, 'VALIDATION_ERROR', err);
    return;
  }

  // Default error
  ResponseUtil.error(
    res,
    config.env === 'production' ? 'Internal server error' : err.message,
    500
  );
});

export default app;