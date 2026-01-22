import { Router } from 'express';
import StoreController from '../controllers/store.controller';
import { optionalAuthenticate, authenticate } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();
const storeController = new StoreController();

// Rate limiting for store endpoints
const storeRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: {
    success: false,
    message: 'Too many requests to store endpoints',
    error: { code: 'RATE_LIMIT_EXCEEDED' },
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const serviceTrackingRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 service selections per minute
  message: {
    success: false,
    message: 'Too many service selections',
    error: { code: 'RATE_LIMIT_EXCEEDED' },
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Store initialization endpoint (public, but can use auth if available)
router.get('/store/init', storeRateLimit, optionalAuthenticate, storeController.getStoreInit);

// Service selection tracking (REQUIRES AUTH)
router.post('/store/select', serviceTrackingRateLimit, authenticate, storeController.selectService);

// Service context (REQUIRES AUTH)
router.get('/store/context', storeRateLimit, authenticate, storeController.getServiceContext);

export default router;