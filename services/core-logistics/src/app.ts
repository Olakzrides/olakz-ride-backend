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

  /**
   * POST /api/internal/push/resubscribe-all-tokens
   * One-time backfill: subscribes every active device token to the correct FCM topics.
   * Call this once after deploy to fix existing users who registered before topic
   * subscription was added to registerDeviceToken.
   *
   * FCM subscribeToTopic accepts up to 1000 tokens per call.
   */
  app.post('/api/internal/push/resubscribe-all-tokens', internalApiAuth, async (_req, res) => {
    try {
      const admin = await import('firebase-admin');
      if (admin.apps.length === 0) {
        return res.status(503).json({ success: false, message: 'Firebase not initialized' });
      }

      const { supabase: db } = await import('./config/database');
      const BATCH = 500; // FCM max is 1000; use 500 to be safe
      let offset = 0;
      let totalSubscribed = 0;
      let totalFailed = 0;

      while (true) {
        // Fetch a batch of active tokens with their user's role
        const { data: tokens, error } = await db
          .from('device_tokens')
          .select('fcm_token, user_id')
          .eq('is_active', true)
          .range(offset, offset + BATCH - 1);

        if (error || !tokens || tokens.length === 0) break;

        // Get roles for these users
        const userIds = [...new Set(tokens.map((t: any) => t.user_id))];
        const { data: users } = await db
          .from('users')
          .select('id, roles')
          .in('id', userIds);

        const roleMap = new Map<string, string[]>((users ?? []).map((u: any) => [u.id, u.roles ?? []]));

        const fcmTokens = tokens.map((t: any) => t.fcm_token);

        // Everyone subscribes to all_users
        const allResult = await admin.messaging().subscribeToTopic(fcmTokens, 'all_users').catch(() => null);
        if (allResult) {
          totalSubscribed += allResult.successCount ?? 0;
          totalFailed     += allResult.failureCount ?? 0;
        }

        // Subscribe to role-specific topics
        const roleTopicMap: Record<string, string> = {
          customer: 'role_customer',
          driver:   'role_driver',
          vendor:   'role_vendor',
        };

        for (const [role, topic] of Object.entries(roleTopicMap)) {
          const roleTokens = tokens
            .filter((t: any) => (roleMap.get(t.user_id) ?? []).includes(role))
            .map((t: any) => t.fcm_token);

          if (roleTokens.length > 0) {
            const roleResult = await admin.messaging().subscribeToTopic(roleTokens, topic).catch(() => null);
            if (roleResult) {
              totalSubscribed += roleResult.successCount ?? 0;
              totalFailed     += roleResult.failureCount ?? 0;
            }
          }
        }

        offset += BATCH;
        if (tokens.length < BATCH) break;
      }

      logger.info('FCM topic resubscription completed', { totalSubscribed, totalFailed });
      return res.json({ success: true, data: { totalSubscribed, totalFailed } });
    } catch (err: any) {
      logger.error('resubscribe-all-tokens error', { error: err.message });
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
  // POST /api/internal/food/emit/new-order       → push new order event to all admins
  app.post('/api/internal/food/emit/new-order', internalApiAuth, async (req, res) => {
    try {
      const { order_id, restaurant_name, status, created_at } = req.body;
      if (!order_id) return res.status(400).json({ success: false, message: 'order_id required' });

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (socketService) {
        socketService.emitToAllAdmins('admin:food:new', {
          orderId:        order_id,
          restaurantName: restaurant_name ?? null,
          status:         status ?? 'pending',
          createdAt:      created_at ?? new Date().toISOString(),
        });
      }
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal food/emit/new-order error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });
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
  // POST /api/internal/marketplace/emit/new-order      → push new order to all admins
  app.post('/api/internal/marketplace/emit/new-order', internalApiAuth, async (req, res) => {
    try {
      const { order_id, store_name, status, created_at } = req.body;
      if (!order_id) return res.status(400).json({ success: false, message: 'order_id required' });

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (socketService) {
        socketService.emitToAllAdmins('admin:marketplace:new', {
          orderId:    order_id,
          storeName:  store_name ?? null,
          status:     status ?? 'pending',
          createdAt:  created_at ?? new Date().toISOString(),
        });
      }
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal marketplace/emit/new-order error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });
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

  // ── Internal car-wash emit endpoints (called by car-wash-service) ────────────
  // POST /api/internal/car-wash/emit/new-booking    → notify all admins of new booking
  // POST /api/internal/car-wash/emit/status-updated → notify admins of booking status change

  app.post('/api/internal/car-wash/emit/new-booking', internalApiAuth, async (req, res) => {
    try {
      const { booking_id, vendor_name, status, booking_type, created_at } = req.body;
      if (!booking_id) return res.status(400).json({ success: false, message: 'booking_id required' });

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (socketService) {
        socketService.emitToAllAdmins('admin:car-wash:new', {
          bookingId:   booking_id,
          vendorName:  vendor_name ?? null,
          status:      status ?? 'pending',
          bookingType: booking_type ?? 'book_now',
          createdAt:   created_at ?? new Date().toISOString(),
        });
      }
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal car-wash/emit/new-booking error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/internal/car-wash/emit/status-updated', internalApiAuth, async (req, res) => {
    try {
      const { booking_id, status, vendor_name, updated_at } = req.body;
      if (!booking_id || !status) {
        return res.status(400).json({ success: false, message: 'booking_id and status required' });
      }

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (socketService) {
        socketService.emitToAllAdmins('admin:car-wash:status_changed', {
          bookingId:  booking_id,
          status,
          vendorName: vendor_name ?? null,
          updatedAt:  updated_at ?? new Date().toISOString(),
        });
      }
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal car-wash/emit/status-updated error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ── Internal auto-mech emit endpoints (called by auto-mech-service) ──────────
  // POST /api/internal/auto-mech/emit/new-booking    → notify all admins of new booking
  // POST /api/internal/auto-mech/emit/status-updated → notify admins of booking status change

  app.post('/api/internal/auto-mech/emit/new-booking', internalApiAuth, async (req, res) => {
    try {
      const { booking_id, vendor_name, status, booking_type, created_at } = req.body;
      if (!booking_id) return res.status(400).json({ success: false, message: 'booking_id required' });

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (socketService) {
        socketService.emitToAllAdmins('admin:auto-mech:new', {
          bookingId:   booking_id,
          vendorName:  vendor_name  ?? null,
          status:      status       ?? 'pending',
          bookingType: booking_type ?? 'book_now',
          createdAt:   created_at   ?? new Date().toISOString(),
        });
      }
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal auto-mech/emit/new-booking error', { error: err.message });
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/internal/auto-mech/emit/status-updated', internalApiAuth, async (req, res) => {
    try {
      const { booking_id, status, vendor_name, updated_at } = req.body;
      if (!booking_id || !status) {
        return res.status(400).json({ success: false, message: 'booking_id and status required' });
      }

      const socketService: import('./services/socket.service').SocketService = app.get('socketService');
      if (socketService) {
        socketService.emitToAllAdmins('admin:auto-mech:status_changed', {
          bookingId:  booking_id,
          status,
          vendorName: vendor_name ?? null,
          updatedAt:  updated_at  ?? new Date().toISOString(),
        });
      }
      return res.json({ success: true });
    } catch (err: any) {
      logger.error('Internal auto-mech/emit/status-updated error', { error: err.message });
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
