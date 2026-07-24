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
          fcm_message_id: result.fcmMessageId ?? null,
          topic:          result.topic,
          error:          result.error ?? null,
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

  // ── Internal support socket emit endpoints (called by admin-service) ────────
  // POST /api/internal/support/emit/message         → push new admin message to customer
  // POST /api/internal/support/emit/dispute-status  → push dispute status change to customer
  app.post('/api/internal/support/emit/message', internalApiAuth, async (req, res) => {
    try {
      const { customer_id, chat_id, chat_type, dispute_id, message } = req.body;
      if (!customer_id || !chat_id || !chat_type || !message) {
        return res.status(400).json({ success: false, message: 'customer_id, chat_id, chat_type, message required' });
      }

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (!socketService) {
        return res.status(503).json({ success: false, message: 'Socket service not available' });
      }

      await socketService.emitSupportMessage(customer_id, {
        chatId:     chat_id,
        chatType:   chat_type,
        disputeId:  dispute_id ?? undefined,
        message,
      });

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal support/emit/message error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/internal/support/emit/dispute-status', internalApiAuth, async (req, res) => {
    try {
      const { customer_id, dispute_id, status, resolution_note } = req.body;
      if (!customer_id || !dispute_id || !status) {
        return res.status(400).json({ success: false, message: 'customer_id, dispute_id, status required' });
      }

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (!socketService) {
        return res.status(503).json({ success: false, message: 'Socket service not available' });
      }

      await socketService.emitDisputeStatusChanged(customer_id, {
        disputeId:      dispute_id,
        status,
        resolutionNote: resolution_note,
      });

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal support/emit/dispute-status error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── Internal food order emit endpoints (called by food-service) ──────────────
  // POST /api/internal/food/emit/code-verified   → push code verification event to admin
  // POST /api/internal/food/emit/status-updated  → push status change event to admin
  app.post('/api/internal/food/emit/code-verified', internalApiAuth, async (req, res) => {
    try {
      const { order_id, code_type, verified_at, new_status } = req.body;
      if (!order_id || !code_type) {
        return res.status(400).json({ success: false, message: 'order_id, code_type required' });
      }

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (!socketService) {
        return res.status(503).json({ success: false, message: 'Socket service not available' });
      }

      socketService.emitToFoodAdminRoom(order_id, 'food:code:verified', {
        orderId:    order_id,
        codeType:   code_type,   // 'pickup' | 'delivery'
        verifiedAt: verified_at ?? new Date().toISOString(),
        newStatus:  new_status ?? null,
      });

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal food/emit/code-verified error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/internal/food/emit/status-updated', internalApiAuth, async (req, res) => {
    try {
      const { order_id, status, message, updated_at } = req.body;
      if (!order_id || !status) {
        return res.status(400).json({ success: false, message: 'order_id, status required' });
      }

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (!socketService) {
        return res.status(503).json({ success: false, message: 'Socket service not available' });
      }

      socketService.emitToFoodAdminRoom(order_id, 'food:order:status_updated', {
        orderId:   order_id,
        status,
        message:   message ?? null,
        updatedAt: updated_at ?? new Date().toISOString(),
      });

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal food/emit/status-updated error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── Internal marketplace order emit endpoints (called by marketplace-service) ─
  // POST /api/internal/marketplace/emit/status-updated → push status change to admin
  app.post('/api/internal/marketplace/emit/status-updated', internalApiAuth, async (req, res) => {
    try {
      const { order_id, status, message, updated_at } = req.body;
      if (!order_id || !status) {
        return res.status(400).json({ success: false, message: 'order_id, status required' });
      }

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (!socketService) {
        return res.status(503).json({ success: false, message: 'Socket service not available' });
      }

      socketService.emitToMarketplaceAdminRoom(order_id, 'marketplace:order:status_updated', {
        orderId:   order_id,
        status,
        message:   message ?? null,
        updatedAt: updated_at ?? new Date().toISOString(),
      });

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal marketplace/emit/status-updated error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/internal/marketplace/emit/rider-location', internalApiAuth, async (req, res) => {
    try {
      const { order_id, rider_id, lat, lng, heading, updated_at } = req.body;
      if (!order_id || lat === undefined || lng === undefined) {
        return res.status(400).json({ success: false, message: 'order_id, lat, lng required' });
      }

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (!socketService) {
        return res.status(503).json({ success: false, message: 'Socket service not available' });
      }

      socketService.emitToMarketplaceAdminRoom(order_id, 'marketplace:rider:location_updated', {
        orderId:   order_id,
        riderId:   rider_id ?? null,
        latitude:  lat,
        longitude: lng,
        heading:   heading ?? null,
        updatedAt: updated_at ?? new Date().toISOString(),
      });

      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal marketplace/emit/rider-location error', { error: err.message });
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
