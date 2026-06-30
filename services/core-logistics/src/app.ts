import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import routes from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { StorageUtil } from './utils/storage.util';
import { logger } from './config/logger';
import { internalApiAuth } from './middleware/internal-api.middleware';
import { WalletController } from './controllers/wallet.controller';
import { PushNotificationService } from './services/push-notification.service';

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

  // ==========================================
  // INTERNAL SERVICE-TO-SERVICE ROUTES
  // Must be mounted BEFORE main routes to bypass JWT auth
  // ==========================================
  const walletController = new WalletController();
  app.get('/api/wallet/internal/balance', internalApiAuth, walletController.getWalletBalanceInternal);
  app.post('/api/wallet/internal/deduct',  internalApiAuth, walletController.deductFromWalletInternal);
  app.post('/api/wallet/internal/credit',  internalApiAuth, walletController.creditWalletInternal);

  // ── Broadcast push notification (called by admin-service) ─────────────────
  // POST /api/internal/push/broadcast       → send FCM topic message
  // POST /api/internal/push/broadcast/inbox → create notification_history rows per user
  const pushService = PushNotificationService.getInstance();

  app.post('/api/internal/push/broadcast', internalApiAuth, async (req, res) => {
    try {
      const { broadcast_id, title, body, target_role, data } = req.body;
      if (!broadcast_id || !title || !body || !target_role) {
        return res.status(400).json({ success: false, message: 'broadcast_id, title, body, target_role required' });
      }

      // Count targeted devices for stats
      const devicesTargeted = await pushService.countTargetedDevices(target_role);

      // Send via FCM topic
      const result = await pushService.sendBroadcast({
        title,
        body,
        targetRole:  target_role,
        data:        data ?? {},
        broadcastId: broadcast_id,
      });

      return res.json({
        success: result.success,
        data: {
          fcm_message_id:   result.fcmMessageId ?? null,
          topic:            result.topic,
          devices_targeted: devicesTargeted,
          error:            result.error ?? null,
        },
      });
    } catch (err: any) {
      logger.error('Internal push/broadcast error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/internal/push/broadcast/inbox', internalApiAuth, async (req, res) => {
    try {
      const { broadcast_id, title, body, target_role, data } = req.body;
      if (!broadcast_id || !title || !body || !target_role) {
        return res.status(400).json({ success: false, message: 'broadcast_id, title, body, target_role required' });
      }

      const { inserted } = await pushService.createInboxEntriesForBroadcast({
        broadcastId: broadcast_id,
        title,
        body,
        targetRole:  target_role,
        data:        data ?? {},
      });

      return res.json({ success: true, data: { inserted } });
    } catch (err: any) {
      logger.error('Internal push/broadcast/inbox error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Mount routes
  app.use(routes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
