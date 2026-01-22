import { Router } from 'express';
import StoreController from '../controllers/store.controller';
import { authenticate } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();
const storeController = new StoreController();

// Rate limiting for service endpoints
const serviceRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: {
    success: false,
    message: 'Too many requests to service endpoints',
    error: { code: 'RATE_LIMIT_EXCEEDED' },
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Service selection tracking (REQUIRES AUTH)
router.post('/services/select', serviceRateLimit, authenticate, storeController.selectService);

// Service context (REQUIRES AUTH)
router.get('/services/context', serviceRateLimit, authenticate, storeController.getServiceContext);

export default router;