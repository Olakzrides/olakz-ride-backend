import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { supabase } from '../config/database';
import { logger } from '../config/logger';

// Singleton Expo client — no credentials needed, Expo Push API is open
const expoClient = new Expo();

interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  sound?: string;
  badge?: number;
}

interface SendNotificationOptions {
  userId: string;
  rideId?: string;
  notificationType: string;
  payload: PushNotificationPayload;
  priority?: 'high' | 'normal';
}

export class PushNotificationService {
  private static instance: PushNotificationService;
  private isInitialized: boolean = false;

  private constructor() {
    this.initialize();
  }

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  /**
   * Initialize Firebase Admin SDK
   */
  private initialize(): void {
    try {
      // Check if already initialized
      if (admin.apps.length > 0) {
        this.isInitialized = true;
        logger.info('Firebase Admin SDK already initialized');
        return;
      }

      const firebaseConfig = process.env.FIREBASE_SERVICE_ACCOUNT;
      
      if (!firebaseConfig) {
        logger.warn('Firebase service account not configured. Push notifications disabled.');
        return;
      }

      // Initialize with service account JSON
      const serviceAccount = JSON.parse(firebaseConfig);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.isInitialized = true;
      logger.info('Firebase Admin SDK initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Firebase Admin SDK:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Send push notification to user
   */
  async sendToUser(options: SendNotificationOptions): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    try {
      if (!this.isInitialized) {
        logger.warn('Push notifications not initialized');
        return { success: false, error: 'Push notifications not configured' };
      }

      const { userId, rideId, notificationType, payload, priority = 'high' } = options;

      // Check user notification preferences
      const preferences = await this.getUserPreferences(userId);
      if (!preferences.pushEnabled || !preferences.rideUpdates) {
        logger.info(`Push notifications disabled for user ${userId}`);
        return { success: false, error: 'User has disabled push notifications' };
      }

      // Get user's active device tokens
      const tokens = await this.getUserDeviceTokens(userId);
      
      if (tokens.length === 0) {
        logger.warn(`No device tokens found for user ${userId}`);
        return { success: false, error: 'No device tokens found' };
      }

      // Send to all devices
      const results = await Promise.allSettled(
        tokens.map(token => this.sendToToken(token, payload, priority))
      );

      // Track successful sends
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      
      // Log notification history
      await this.logNotification({
        userId,
        rideId,
        notificationType,
        channel: 'push',
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        status: successCount > 0 ? 'sent' : 'failed',
        errorMessage: successCount === 0 ? 'All tokens failed' : undefined,
      });

      return {
        success: successCount > 0,
        messageId: `sent_to_${successCount}_devices`,
      };
    } catch (error: any) {
      logger.error('Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Returns true if the token is an Expo Push Token (iOS managed workflow).
   * Expo tokens always start with "ExponentPushToken[".
   * FCM tokens (Android + direct FCM iOS) do not.
   */
  private isExpoToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }

  /**
   * Send notification to specific device token.
   * Automatically routes to Expo Push API or Firebase Admin SDK
   * based on the token format:
   *   - ExponentPushToken[...] → Expo Push API  (iOS managed workflow)
   *   - Everything else        → Firebase Admin SDK (Android + web)
   */
  private async sendToToken(
    token: string,
    payload: PushNotificationPayload,
    priority: 'high' | 'normal'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (this.isExpoToken(token)) {
      return this.sendToExpoToken(token, payload, priority);
    }
    return this.sendToFcmToken(token, payload, priority);
  }

  /**
   * Send via Expo Push API — used for iOS devices on the Expo managed workflow.
   */
  private async sendToExpoToken(
    token: string,
    payload: PushNotificationPayload,
    priority: 'high' | 'normal'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const message: ExpoPushMessage = {
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: (payload.sound as any) || 'default',
        badge: payload.badge,
        priority: priority === 'high' ? 'high' : 'normal',
        channelId: 'ride_updates',
      };

      const chunks = expoClient.chunkPushNotifications([message]);
      const tickets: ExpoPushTicket[] = [];

      for (const chunk of chunks) {
        const chunkTickets = await expoClient.sendPushNotificationsAsync(chunk);
        tickets.push(...chunkTickets);
      }

      const ticket = tickets[0];

      if (!ticket) {
        return { success: false, error: 'No ticket returned from Expo' };
      }

      if (ticket.status === 'error') {
        const errDetails = ticket.details as any;
        // Deactivate the token if Expo says it's invalid
        if (errDetails?.error === 'DeviceNotRegistered') {
          await this.deactivateToken(token);
          logger.warn(`Expo token deactivated (DeviceNotRegistered): ${token.substring(0, 30)}...`);
        }
        logger.error(`Expo push failed for token ${token.substring(0, 30)}...`, ticket.message);
        return { success: false, error: ticket.message };
      }

      // ticket.status === 'ok'
      const successTicket = ticket as { status: 'ok'; id: string };
      logger.info(`Expo push sent successfully, receipt id: ${successTicket.id}`);
      return { success: true, messageId: successTicket.id };
    } catch (error: any) {
      logger.error(`Expo push error for token ${token.substring(0, 30)}...`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send via Firebase Admin SDK — used for Android (and web).
   * Unchanged from original sendToToken() logic.
   */
  private async sendToFcmToken(
    token: string,
    payload: PushNotificationPayload,
    priority: 'high' | 'normal'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data || {},
        android: {
          priority: priority,
          notification: {
            sound: payload.sound || 'default',
            channelId: 'ride_updates',
            priority: priority === 'high' ? 'high' : 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              sound: payload.sound || 'default',
              badge: payload.badge,
              contentAvailable: true,
            },
          },
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/icon-192x192.png',
            badge: '/badge-72x72.png',
          },
        },
      };

      const messageId = await admin.messaging().send(message);
      return { success: true, messageId };
    } catch (error: any) {
      // Deactivate stale FCM tokens
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        await this.deactivateToken(token);
      }
      logger.error(`FCM send failed for token ${token.substring(0, 20)}...`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendToMultipleUsers(
    userIds: string[],
    notificationType: string,
    payload: PushNotificationPayload,
    rideId?: string
  ): Promise<{ successCount: number; failureCount: number }> {
    const results = await Promise.allSettled(
      userIds.map(userId =>
        this.sendToUser({
          userId,
          rideId,
          notificationType,
          payload,
        })
      )
    );

    const successCount = results.filter(
      r => r.status === 'fulfilled' && r.value.success
    ).length;

    return {
      successCount,
      failureCount: userIds.length - successCount,
    };
  }

  /**
   * Register device token for user and subscribe to FCM topics
   */
  async registerDeviceToken(
    userId: string,
    deviceId: string,
    fcmToken: string,
    platform: 'android' | 'ios' | 'web',
    deviceInfo?: Record<string, any>,
    userRole?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // ── Deactivate all existing rows for this user that carry the same token.
      // This handles the case where the frontend generates a new device_id on
      // every launch — the same physical token accumulates across many rows.
      // We collapse them to a single active row before upserting the new one.
      await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('fcm_token', fcmToken)
        .neq('device_id', deviceId); // keep the current row if it already exists

      const { error } = await supabase
        .from('device_tokens')
        .upsert({
          user_id: userId,
          device_id: deviceId,
          fcm_token: fcmToken,
          platform,
          device_info: deviceInfo || {},
          is_active: true,
          last_used_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,device_id',
        });

      if (error) {
        logger.error('Error registering device token:', error);
        return { success: false, error: error.message };
      }

      // Subscribe to FCM topics (non-fatal if Firebase not initialized)
      // Only FCM tokens support topic subscriptions — skip for Expo Push Tokens
      if (this.isInitialized && !this.isExpoToken(fcmToken)) {
        try {
          const topicsToSubscribe = ['all_users'];

          const roleTopicMap: Record<string, string> = {
            customer: 'role_customer',
            driver:   'role_driver',
            vendor:   'role_vendor',
          };

          if (userRole && roleTopicMap[userRole]) {
            topicsToSubscribe.push(roleTopicMap[userRole]);
          }

          await Promise.allSettled(
            topicsToSubscribe.map(topic =>
              admin.messaging().subscribeToTopic([fcmToken], topic)
            )
          );

          logger.info(`FCM topic subscriptions set for user ${userId}`, { topics: topicsToSubscribe });
        } catch (topicErr: any) {
          // Non-fatal — token is saved, topic subscription failed
          logger.warn('FCM topic subscription failed (non-fatal)', { userId, error: topicErr.message });
        }
      }

      logger.info(`Device token registered for user ${userId} on ${platform}`);
      return { success: true };
    } catch (error: any) {
      logger.error('Error registering device token:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Unregister device token
   */
  async unregisterDeviceToken(
    userId: string,
    deviceId: string
  ): Promise<{ success: boolean }> {
    try {
      await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('device_id', deviceId);

      logger.info(`Device token unregistered for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error unregistering device token:', error);
      return { success: false };
    }
  }

  /**
   * Get user's active device tokens — deduplicated by token value.
   *
   * The frontend currently generates a new device_id on every app launch,
   * which causes multiple rows with the same fcm_token to accumulate.
   * We deduplicate here so each physical token is only sent to once,
   * regardless of how many rows exist for it in the DB.
   */
  private async getUserDeviceTokens(userId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('device_tokens')
        .select('fcm_token')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error || !data) {
        return [];
      }

      // Deduplicate: one entry per unique token value
      const unique = [...new Set(data.map(d => d.fcm_token).filter(Boolean))];
      return unique;
    } catch (error) {
      logger.error('Error fetching device tokens:', error);
      return [];
    }
  }

  /**
   * Get user notification preferences
   */
  private async getUserPreferences(userId: string): Promise<{
    pushEnabled: boolean;
    rideUpdates: boolean;
  }> {
    try {
      const { data } = await supabase
        .from('notification_preferences')
        .select('push_enabled, ride_updates')
        .eq('user_id', userId)
        .single();

      return {
        pushEnabled: data?.push_enabled ?? true,
        rideUpdates: data?.ride_updates ?? true,
      };
    } catch (error) {
      // Default to enabled if preferences not found
      return { pushEnabled: true, rideUpdates: true };
    }
  }

  /**
   * Deactivate invalid token
   */
  private async deactivateToken(fcmToken: string): Promise<void> {
    try {
      await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .eq('fcm_token', fcmToken);

      logger.info(`Deactivated invalid token: ${fcmToken.substring(0, 20)}...`);
    } catch (error) {
      logger.error('Error deactivating token:', error);
    }
  }

  /**
   * Log notification to history
   */
  private async logNotification(data: {
    userId: string;
    rideId?: string;
    notificationType: string;
    channel: string;
    title?: string;
    body: string;
    data: Record<string, any>;
    status: string;
    errorMessage?: string;
  }): Promise<void> {
    try {
      await supabase.from('notification_history').insert({
        user_id: data.userId,
        ride_id: data.rideId,
        notification_type: data.notificationType,
        channel: data.channel,
        title: data.title,
        body: data.body,
        data: data.data,
        status: data.status,
        error_message: data.errorMessage,
      });
    } catch (error) {
      logger.error('Error logging notification:', error);
    }
  }

  /**
   * Send a broadcast notification to all active devices for a given role.
   *
   * Replaces the previous FCM topic-based approach which silently missed
   * iOS Expo Push Token users (Expo tokens cannot subscribe to FCM topics).
   *
   * Strategy:
   *   1. Fetch all active, deduplicated tokens for the target role from DB.
   *   2. Split into Expo tokens and FCM tokens.
   *   3. Send Expo tokens in chunks via Expo Push API.
   *   4. Send FCM tokens in batches of 500 via Firebase multicast.
   *
   * Returns counts of successes and failures across both channels.
   */
  async sendBroadcast(params: {
    title:       string;
    body:        string;
    targetRole:  'all' | 'customer' | 'driver' | 'vendor';
    data?:       Record<string, string>;
    broadcastId: string;
  }): Promise<{
    success:      boolean;
    topic:        string;   // kept for backward-compat with admin-service response shape
    fcmMessageId?: string;  // kept for backward-compat
    successCount: number;
    failureCount: number;
    error?:       string;
  }> {
    const { title, body, targetRole, data = {}, broadcastId } = params;

    // topic field kept so admin-service response shape doesn't break
    const topicMap: Record<string, string> = {
      all: 'all_users', customer: 'role_customer',
      driver: 'role_driver', vendor: 'role_vendor',
    };
    const topic = topicMap[targetRole] ?? 'all_users';

    try {
      // ── 1. Fetch all active tokens for the target role ────────────────────
      let tokenQuery = supabase
        .from('device_tokens')
        .select('fcm_token, user_id')
        .eq('is_active', true);

      if (targetRole !== 'all') {
        // Filter by user role
        const { data: roleUsers } = await supabase
          .from('users')
          .select('id')
          .contains('roles', [targetRole])
          .eq('status', 'active');

        if (!roleUsers || roleUsers.length === 0) {
          logger.info(`sendBroadcast: no active users found for role ${targetRole}`);
          return { success: true, topic, successCount: 0, failureCount: 0 };
        }

        tokenQuery = tokenQuery.in('user_id', roleUsers.map(u => u.id));
      }

      const { data: tokenRows, error: tokenErr } = await tokenQuery;

      if (tokenErr || !tokenRows || tokenRows.length === 0) {
        logger.warn('sendBroadcast: no device tokens found', { targetRole });
        return { success: true, topic, successCount: 0, failureCount: 0 };
      }

      // ── 2. Deduplicate by token value ─────────────────────────────────────
      const uniqueTokens = [...new Set(tokenRows.map(r => r.fcm_token).filter(Boolean))];

      const expoTokens: string[] = [];
      const fcmTokens:  string[] = [];

      for (const token of uniqueTokens) {
        if (this.isExpoToken(token)) {
          expoTokens.push(token);
        } else {
          fcmTokens.push(token);
        }
      }

      logger.info('sendBroadcast: token breakdown', {
        broadcastId, targetRole,
        total: uniqueTokens.length,
        expo: expoTokens.length,
        fcm: fcmTokens.length,
      });

      let successCount = 0;
      let failureCount = 0;
      const notificationData = { ...data, broadcast_id: broadcastId, type: 'broadcast' };

      // ── 3. Send to Expo tokens ────────────────────────────────────────────
      if (expoTokens.length > 0) {
        const messages: ExpoPushMessage[] = expoTokens.map(token => ({
          to: token,
          title,
          body,
          data: notificationData,
          sound: 'default' as any,
          priority: 'high' as any,
          channelId: 'broadcasts',
        }));

        const chunks = expoClient.chunkPushNotifications(messages);

        for (const chunk of chunks) {
          try {
            const tickets = await expoClient.sendPushNotificationsAsync(chunk);

            for (let i = 0; i < tickets.length; i++) {
              const ticket = tickets[i];
              if (ticket.status === 'ok') {
                successCount++;
              } else {
                failureCount++;
                const errDetails = ticket.details as any;
                if (errDetails?.error === 'DeviceNotRegistered') {
                  await this.deactivateToken(chunk[i].to as string);
                }
                logger.warn('sendBroadcast: Expo ticket error', {
                  token: (chunk[i].to as string).substring(0, 30),
                  error: ticket.message,
                });
              }
            }
          } catch (chunkErr: any) {
            failureCount += chunk.length;
            logger.error('sendBroadcast: Expo chunk send error', { error: chunkErr.message });
          }
        }

        logger.info('sendBroadcast: Expo sends complete', {
          broadcastId, sent: expoTokens.length,
          successCount, failureCount,
        });
      }

      // ── 4. Send to FCM tokens via multicast (500 per batch) ───────────────
      if (fcmTokens.length > 0 && this.isInitialized) {
        const FCM_BATCH_SIZE = 500;

        for (let i = 0; i < fcmTokens.length; i += FCM_BATCH_SIZE) {
          const batch = fcmTokens.slice(i, i + FCM_BATCH_SIZE);

          try {
            const multicastMessage: admin.messaging.MulticastMessage = {
              tokens: batch,
              notification: { title, body },
              data: notificationData,
              android: {
                priority: 'high',
                notification: { sound: 'default', channelId: 'broadcasts', priority: 'high' },
              },
              apns: {
                payload: {
                  aps: { alert: { title, body }, sound: 'default', contentAvailable: true },
                },
              },
            };

            const response = await admin.messaging().sendEachForMulticast(multicastMessage);

            successCount += response.successCount;
            failureCount += response.failureCount;

            // Deactivate any tokens FCM says are no longer valid
            response.responses.forEach((resp, idx) => {
              if (!resp.success && resp.error) {
                const code = resp.error.code;
                if (
                  code === 'messaging/invalid-registration-token' ||
                  code === 'messaging/registration-token-not-registered'
                ) {
                  this.deactivateToken(batch[idx]).catch(() => {});
                }
              }
            });

            logger.info('sendBroadcast: FCM multicast batch complete', {
              broadcastId,
              batchIndex: Math.floor(i / FCM_BATCH_SIZE) + 1,
              successCount: response.successCount,
              failureCount: response.failureCount,
            });
          } catch (batchErr: any) {
            failureCount += batch.length;
            logger.error('sendBroadcast: FCM multicast batch error', { error: batchErr.message });
          }
        }
      } else if (fcmTokens.length > 0 && !this.isInitialized) {
        logger.warn('sendBroadcast: Firebase not initialized — FCM tokens skipped', {
          skipped: fcmTokens.length,
        });
        failureCount += fcmTokens.length;
      }

      logger.info('sendBroadcast: complete', {
        broadcastId, targetRole, topic,
        totalTokens: uniqueTokens.length,
        successCount, failureCount,
      });

      return {
        success: successCount > 0 || uniqueTokens.length === 0,
        topic,
        successCount,
        failureCount,
      };
    } catch (error: any) {
      logger.error('sendBroadcast error', { topic, broadcastId, error: error.message });
      return { success: false, topic, successCount: 0, failureCount: 0, error: error.message };
    }
  }

  /**
   * Fetch all active device tokens for a role (used for fan-out fallback
   * or for counting devices_targeted before the topic send).
   * Returns distinct user_ids and their token count.
   */
  async countTargetedDevices(targetRole: 'all' | 'customer' | 'driver' | 'vendor'): Promise<number> {
    try {
      let query = supabase
        .from('device_tokens')
        .select('user_id', { count: 'exact', head: true })
        .eq('is_active', true);

      if (targetRole !== 'all') {
        // Join-style filter: get user_ids that have the given role
        const { data: users } = await supabase
          .from('users')
          .select('id')
          .contains('roles', [targetRole])
          .eq('status', 'active');

        if (!users || users.length === 0) return 0;
        const userIds = users.map(u => u.id);
        query = query.in('user_id', userIds);
      }

      const { count } = await query;
      return count ?? 0;
    } catch (err) {
      logger.error('countTargetedDevices error', { error: err });
      return 0;
    }
  }

  /**
   * Insert one notification_history inbox row per targeted user.
   * Called after a successful broadcast so users see it in their bell inbox.
   * Processes in batches of 1000 to avoid memory issues on large user bases.
   */
  async createInboxEntriesForBroadcast(params: {
    broadcastId: string;
    title:       string;
    body:        string;
    targetRole:  'all' | 'customer' | 'driver' | 'vendor';
    data?:       Record<string, string>;
  }): Promise<{ inserted: number }> {
    const { broadcastId, title, body, targetRole, data = {} } = params;
    const BATCH = 1000;
    let offset  = 0;
    let total   = 0;

    while (true) {
      let userQuery = supabase
        .from('users')
        .select('id')
        .eq('status', 'active')
        .range(offset, offset + BATCH - 1);

      if (targetRole !== 'all') {
        userQuery = userQuery.contains('roles', [targetRole]);
      }

      const { data: users, error } = await userQuery;
      if (error || !users || users.length === 0) break;

      const rows = users.map(u => ({
        user_id:           u.id,
        notification_type: 'broadcast',
        channel:           'push',
        title,
        body,
        data:              { ...data, broadcast_id: broadcastId },
        broadcast_id:      broadcastId,
        status:            'sent',
        sent_at:           new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('notification_history')
        .insert(rows);

      if (insertError) {
        logger.error('createInboxEntriesForBroadcast batch error', {
          offset, error: insertError.message,
        });
      }

      total  += users.length;
      offset += BATCH;
      if (users.length < BATCH) break;
    }

    logger.info('Broadcast inbox entries created', { broadcastId, total });
    return { inserted: total };
  }

  /**
   * Send ride notification templates
   */
  async sendRideNotification(
    userId: string,
    rideId: string,
    type: 'driver_assigned' | 'driver_arrived' | 'ride_started' | 'ride_completed' | 'ride_cancelled',
    data: Record<string, any>
  ): Promise<void> {
    const templates = {
      driver_assigned: {
        title: '🚗 Driver Assigned!',
        body: `${data.driverName} is on the way to pick you up`,
        data: { rideId, driverId: data.driverId, type: 'driver_assigned' },
      },
      driver_arrived: {
        title: '📍 Driver Arrived',
        body: `${data.driverName} has arrived at your pickup location`,
        data: { rideId, driverId: data.driverId, type: 'driver_arrived' },
      },
      ride_started: {
        title: '🎯 Ride Started',
        body: 'Your ride has started. Enjoy your trip!',
        data: { rideId, type: 'ride_started' },
      },
      ride_completed: {
        title: '✅ Ride Completed',
        body: `Your ride is complete. Total: ₦${data.finalFare}`,
        data: { rideId, finalFare: data.finalFare, type: 'ride_completed' },
      },
      ride_cancelled: {
        title: '❌ Ride Cancelled',
        body: data.reason || 'Your ride has been cancelled',
        data: { rideId, reason: data.reason, type: 'ride_cancelled' },
      },
    };

    const template = templates[type];
    
    await this.sendToUser({
      userId,
      rideId,
      notificationType: type,
      payload: template,
      priority: 'high',
    });
  }
}
