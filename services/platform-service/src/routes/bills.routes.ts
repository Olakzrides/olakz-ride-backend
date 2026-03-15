import { Router } from 'express';
import billsController from '../controllers/bills.controller';
import { authenticate } from '../middleware/auth.middleware';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiter for bills endpoints (5 requests per minute per user)
const billsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip;
  },
});

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/bills/networks
 * Get available networks
 */
router.get('/networks', billsController.getNetworks.bind(billsController));

/**
 * GET /api/bills/data-bundles/:network
 * Get data bundles for a network (with optional ?validity_type=weekly|monthly|daily|yearly|one-time)
 */
router.get('/data-bundles/:network', billsController.getDataBundles.bind(billsController));

/**
 * POST /api/bills/airtime/purchase
 * Purchase airtime
 */
router.post(
  '/airtime/purchase',
  billsRateLimiter,
  billsController.purchaseAirtime.bind(billsController)
);

/**
 * POST /api/bills/data/purchase
 * Purchase data bundle
 */
router.post(
  '/data/purchase',
  billsRateLimiter,
  billsController.purchaseData.bind(billsController)
);

/**
 * POST /api/bills/data-bundles/refresh
 * Refresh data bundle cache (admin use)
 */
router.post('/data-bundles/refresh', billsController.refreshDataCache.bind(billsController));

/**
 * GET /api/bills/transactions
 * Get transaction history
 */
router.get('/transactions', billsController.getTransactionHistory.bind(billsController));

/**
 * GET /api/bills/transaction/:id
 * Get single transaction
 */
router.get('/transaction/:id', billsController.getTransaction.bind(billsController));

/**
 * POST /api/bills/transaction/:id/retry
 * Retry a failed transaction
 */
router.post('/transaction/:id/retry', billsRateLimiter, billsController.retryTransaction.bind(billsController));

/**
 * GET /api/bills/transaction/:id/receipt
 * Get transaction receipt (successful transactions only)
 */
router.get('/transaction/:id/receipt', billsController.getTransactionReceipt.bind(billsController));

/**
 * POST /api/bills/webhook
 * Flutterwave webhook (public — no auth, verified by secret hash header)
 */
const webhookRouter = Router();
webhookRouter.post('/webhook', billsController.handleWebhook.bind(billsController));

export { webhookRouter };
export default router;
