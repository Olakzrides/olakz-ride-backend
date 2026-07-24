import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import config from './config';
import logger from './utils/logger';
import ResponseUtil from './utils/response';
import { AppError } from './utils/errors';
import { internalApiAuth } from './middleware/internal-api.middleware';
import securityService from './services/security.service';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import emailRoutes from './routes/email.routes';
import profileRoutes from './routes/profile.routes';
import securityRoutes from './routes/security.routes';
import safetyRoutes from './routes/safety.routes';
import referralRoutes from './routes/referral.routes';
import helpRoutes from './routes/help.routes';
import contentRoutes from './routes/content.routes';

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

// ── Internal service-to-service PIN verify ───────────────────────────────────
// Called by payment-service and platform-service before executing PIN-gated transactions.
// Secured with x-internal-api-key header.
// POST /api/internal/pin/verify  Body: { user_id, pin }
app.post('/api/internal/pin/verify', internalApiAuth, async (req: Request, res: Response) => {
  try {
    const { user_id, pin } = req.body;

    if (!user_id || !pin) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'user_id and pin are required' },
      });
    }

    // Verify PIN is exactly 4 numeric digits
    if (!/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PIN_FORMAT', message: 'PIN must be exactly 4 digits' },
      });
    }

    let result: { valid: boolean };
    try {
      result = await securityService.verifyWalletPin(user_id, String(pin));
    } catch (err: any) {
      // wallet_pin_enabled = false → user has no PIN
      if (
        err.message?.includes('not set') ||
        err.message?.includes('PIN is not set')
      ) {
        return res.status(403).json({
          success: false,
          error: { code: 'PIN_NOT_SET', message: 'Transaction PIN has not been set up yet' },
        });
      }
      // PIN locked
      if (err.message?.includes('locked')) {
        return res.status(423).json({
          success: false,
          error: { code: 'PIN_LOCKED', message: err.message },
        });
      }
      throw err;
    }

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PIN', message: 'Incorrect PIN. Please try again.' },
      });
    }

    return res.json({ success: true, valid: true });
  } catch (err: any) {
    logger.error('Internal pin/verify error', { error: err.message });
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'PIN verification failed' },
    });
  }
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
app.use('/api/users/profile', profileRoutes);
app.use('/api/users/security', securityRoutes);
app.use('/api/users/safety', safetyRoutes);
app.use('/api/users/referral', referralRoutes);
app.use('/api/users/help', helpRoutes);
app.use('/api/users/content', contentRoutes);

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