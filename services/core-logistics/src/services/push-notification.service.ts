import * as admin from 'firebase-admin';
import { supabase } from '../config/database';
import { logger } from '../config/logger';

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
   * Send notification to specific device token
   */
  private async sendToToken(
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
      // Handle invalid token
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        await this.deactivateToken(token);
      }
      
      logger.error(`Failed to send to token ${token.substring(0, 20)}...`, error);
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
      if (this.isInitialized) {
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
   * Get user's active device tokens
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

      return data.map(d => d.fcm_token);
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
   * Send a broadcast notification to a role-based FCM topic.
   *
   * Topic naming convention:
   *   all_users          → everyone
   *   role_customer      → customers only
   *   role_driver        → drivers only
   *   role_vendor        → vendors only
   *
   * The mobile app subscribes to the relevant topic(s) on startup.
   * FCM delivers to all subscribed devices instantly, including offline devices
   * when they reconnect.
   *
   * Returns the FCM message ID and the topic used.
   */
  async sendBroadcast(params: {
    title:      string;
    body:       string;
    targetRole: 'all' | 'customer' | 'driver' | 'vendor';
    data?:      Record<string, string>;
    broadcastId: string;
  }): Promise<{
    success:       boolean;
    fcmMessageId?: string;
    topic:         string;
    error?:        string;
  }> {
    const { title, body, targetRole, data = {}, broadcastId } = params;

    const topicMap: Record<string, string> = {
      all:      'all_users',
      customer: 'role_customer',
      driver:   'role_driver',
      vendor:   'role_vendor',
    };

    const topic = topicMap[targetRole] ?? 'all_users';

    if (!this.isInitialized) {
      logger.warn('sendBroadcast: Firebase not initialized');
      return { success: false, topic, error: 'Push notifications not configured' };
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: { title, body },
        data: { ...data, broadcast_id: broadcastId, type: 'broadcast' },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'broadcasts',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              alert: { title, body },
              sound: 'default',
              contentAvailable: true,
            },
          },
        },
      };

      const fcmMessageId = await admin.messaging().send(message);

      logger.info('Broadcast sent via FCM topic', { topic, broadcastId, fcmMessageId });
      return { success: true, fcmMessageId, topic };
    } catch (error: any) {
      logger.error('sendBroadcast FCM error', { topic, error: error.message });
      return { success: false, topic, error: error.message };
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
