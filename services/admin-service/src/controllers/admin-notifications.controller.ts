import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { AdminNotificationsService } from '../services/admin-notifications.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class AdminNotificationsController {
  /**
   * GET /api/admin/notifications/preview
   *
   * Returns the latest 5–10 notifications for the dashboard bell icon.
   * Frontend shows these inline, with a "View all" button linking to /notifications.
   *
   * Query params:
   *   limit - number of notifications to return (default: 10, max: 10)
   */
  getPreview = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string || '10', 10), 10);
      const notifications = await AdminNotificationsService.getPreview(limit);
      ResponseUtil.success(res, { notifications, count: notifications.length }, 'Notifications preview retrieved');
    } catch (err: unknown) {
      logger.error('getPreview error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve notifications', 'NOTIFICATIONS_ERROR');
    }
  };

  /**
   * GET /api/admin/notifications
   *
   * Returns all notifications paginated. Called when admin clicks "View all".
   *
   * Query params:
   *   type  - filter by type: new_user | new_driver | new_vendor | password_reset | all
   *   page  - page number (default: 1)
   *   limit - items per page (default: 20, max: 20)
   */
  getAll = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const { type, page, limit } = req.query;
      const result = await AdminNotificationsService.getAll({
        type: type as string | undefined,
        page: page ? parseInt(page as string, 10) : 1,
        limit: Math.min(parseInt(limit as string || '20', 10), 20),
      });
      ResponseUtil.success(res, result, 'Notifications retrieved');
    } catch (err: unknown) {
      logger.error('getAll notifications error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to retrieve notifications', 'NOTIFICATIONS_ERROR');
    }
  };
}
