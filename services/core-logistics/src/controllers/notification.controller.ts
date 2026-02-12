import { Request, Response } from 'express';
import { PushNotificationService } from '../services/push-notification.service';
import { supabase } from '../config/database';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class NotificationController {
  private pushService: PushNotificationService;

  constructor() {
    this.pushService = PushNotificationService.getInstance();
  }

  /**
   * Register device token for push notifications
   * POST /api/notifications/register-device
   */
  registerDevice = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { deviceId, fcmToken, platform, deviceInfo } = req.body;

      if (!deviceId || !fcmToken || !platform) {
        return ResponseUtil.badRequest(res, 'deviceId, fcmToken, and platform are required');
      }

      if (!['android', 'ios', 'web'].includes(platform)) {
        return ResponseUtil.badRequest(res, 'platform must be android, ios, or web');
      }

      const result = await this.pushService.registerDeviceToken(
        userId,
        deviceId,
        fcmToken,
        platform,
        deviceInfo
      );

      if (!result.success) {
        return ResponseUtil.error(res, result.error || 'Failed to register device');
      }

      logger.info(`Device registered for user ${userId}: ${platform}`);

      return ResponseUtil.success(res, {
        message: 'Device registered successfully',
      });
    } catch (error: any) {
      logger.error('Register device error:', error);
      return ResponseUtil.error(res, 'Failed to register device');
    }
  };

  /**
   * Unregister device token
   * DELETE /api/notifications/unregister-device
   */
  unregisterDevice = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { deviceId } = req.body;

      if (!deviceId) {
        return ResponseUtil.badRequest(res, 'deviceId is required');
      }

      const result = await this.pushService.unregisterDeviceToken(userId, deviceId);

      if (!result.success) {
        return ResponseUtil.error(res, 'Failed to unregister device');
      }

      logger.info(`Device unregistered for user ${userId}`);

      return ResponseUtil.success(res, {
        message: 'Device unregistered successfully',
      });
    } catch (error: any) {
      logger.error('Unregister device error:', error);
      return ResponseUtil.error(res, 'Failed to unregister device');
    }
  };

  /**
   * Get user notification preferences
   * GET /api/notifications/preferences
   */
  getPreferences = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') { // Not found is ok
        logger.error('Get preferences error:', error);
        return ResponseUtil.error(res, 'Failed to get preferences');
      }

      // Return default preferences if not found
      const preferences = data || {
        push_enabled: true,
        email_enabled: true,
        sms_enabled: false,
        ride_updates: true,
        promotional: true,
        driver_messages: true,
        ride_reminders: true,
      };

      return ResponseUtil.success(res, {
        preferences: {
          pushEnabled: preferences.push_enabled,
          emailEnabled: preferences.email_enabled,
          smsEnabled: preferences.sms_enabled,
          rideUpdates: preferences.ride_updates,
          promotional: preferences.promotional,
          driverMessages: preferences.driver_messages,
          rideReminders: preferences.ride_reminders,
        },
      });
    } catch (error: any) {
      logger.error('Get preferences error:', error);
      return ResponseUtil.error(res, 'Failed to get preferences');
    }
  };

  /**
   * Update user notification preferences
   * PUT /api/notifications/preferences
   */
  updatePreferences = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const {
        pushEnabled,
        emailEnabled,
        smsEnabled,
        rideUpdates,
        promotional,
        driverMessages,
        rideReminders,
      } = req.body;

      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: userId,
          push_enabled: pushEnabled ?? true,
          email_enabled: emailEnabled ?? true,
          sms_enabled: smsEnabled ?? false,
          ride_updates: rideUpdates ?? true,
          promotional: promotional ?? true,
          driver_messages: driverMessages ?? true,
          ride_reminders: rideReminders ?? true,
        }, {
          onConflict: 'user_id',
        });

      if (error) {
        logger.error('Update preferences error:', error);
        return ResponseUtil.error(res, 'Failed to update preferences');
      }

      logger.info(`Notification preferences updated for user ${userId}`);

      return ResponseUtil.success(res, {
        message: 'Preferences updated successfully',
      });
    } catch (error: any) {
      logger.error('Update preferences error:', error);
      return ResponseUtil.error(res, 'Failed to update preferences');
    }
  };

  /**
   * Get notification history
   * GET /api/notifications/history
   */
  getHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from('notification_history')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('sent_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Get notification history error:', error);
        return ResponseUtil.error(res, 'Failed to get notification history');
      }

      return ResponseUtil.success(res, {
        notifications: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit),
        },
      });
    } catch (error: any) {
      logger.error('Get notification history error:', error);
      return ResponseUtil.error(res, 'Failed to get notification history');
    }
  };

  /**
   * Mark notification as read
   * PUT /api/notifications/:id/read
   */
  markAsRead = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      const { error } = await supabase
        .from('notification_history')
        .update({
          status: 'read',
          read_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        logger.error('Mark notification as read error:', error);
        return ResponseUtil.error(res, 'Failed to mark notification as read');
      }

      return ResponseUtil.success(res, {
        message: 'Notification marked as read',
      });
    } catch (error: any) {
      logger.error('Mark notification as read error:', error);
      return ResponseUtil.error(res, 'Failed to mark notification as read');
    }
  };

  /**
   * Test push notification (for development/testing)
   * POST /api/notifications/test
   */
  testNotification = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      // Only allow in development
      if (process.env.NODE_ENV === 'production') {
        return ResponseUtil.forbidden(res, 'Test notifications not allowed in production');
      }

      const { title, body } = req.body;

      const result = await this.pushService.sendToUser({
        userId,
        notificationType: 'test',
        payload: {
          title: title || 'Test Notification',
          body: body || 'This is a test notification from Olakz',
          data: { type: 'test' },
        },
      });

      if (!result.success) {
        return ResponseUtil.error(res, result.error || 'Failed to send test notification');
      }

      return ResponseUtil.success(res, {
        message: 'Test notification sent successfully',
        messageId: result.messageId,
      });
    } catch (error: any) {
      logger.error('Test notification error:', error);
      return ResponseUtil.error(res, 'Failed to send test notification');
    }
  };
}
