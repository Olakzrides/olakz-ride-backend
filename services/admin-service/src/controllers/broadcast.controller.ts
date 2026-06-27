import { Response } from 'express';
import { AdminRequest } from '../middleware/auth.middleware';
import { BroadcastService, BroadcastTargetRole } from '../services/broadcast.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const VALID_ROLES: BroadcastTargetRole[] = ['all', 'customer', 'driver', 'vendor'];

export class BroadcastController {

  /**
   * POST /api/admin/notifications/broadcast/:role
   *
   * :role = all | customer | driver | vendor
   *
   * Body:
   *   title  string (required)
   *   body   string (required)
   *   data   object (optional) — extra key-value pairs forwarded to the mobile app
   *
   * Examples:
   *   POST /api/admin/notifications/broadcast/all
   *   POST /api/admin/notifications/broadcast/driver
   */
  send = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const targetRole = req.params.role as BroadcastTargetRole;

      if (!VALID_ROLES.includes(targetRole)) {
        ResponseUtil.badRequest(
          res,
          `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
          'INVALID_BROADCAST_ROLE'
        );
        return;
      }

      const { title, body, data } = req.body;

      if (!title?.trim()) {
        ResponseUtil.badRequest(res, 'title is required', 'BROADCAST_TITLE_REQUIRED');
        return;
      }
      if (!body?.trim()) {
        ResponseUtil.badRequest(res, 'body is required', 'BROADCAST_BODY_REQUIRED');
        return;
      }

      logger.info('Admin sending broadcast', { adminId, targetRole, title });

      const result = await BroadcastService.send({
        title,
        body,
        targetRole,
        data:    data ?? {},
        adminId,
      });

      const targetLabel = targetRole === 'all'
        ? 'all users'
        : `all ${targetRole}s`;

      ResponseUtil.success(
        res,
        { broadcast: result },
        `Broadcast sent to ${targetLabel}. ${result.devices_reached} devices reached.`
      );
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('required') || msg.includes('must be')) {
        ResponseUtil.badRequest(res, msg, 'BROADCAST_VALIDATION_ERROR');
        return;
      }
      logger.error('Broadcast send error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to send broadcast', 'BROADCAST_SEND_ERROR');
    }
  };

  /**
   * GET /api/admin/notifications/broadcasts
   * Paginated list of past broadcasts.
   *
   * Query params:
   *   role  - all | customer | driver | vendor
   *   page  - default 1
   *   limit - default 20
   */
  getAll = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
      const targetRole = req.query.role as string | undefined;

      const result = await BroadcastService.getAll({ targetRole, page, limit });
      ResponseUtil.success(res, result, 'Broadcast history retrieved');
    } catch (err: unknown) {
      logger.error('getAll broadcasts error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch broadcast history', 'BROADCASTS_FETCH_ERROR');
    }
  };

  /**
   * GET /api/admin/notifications/broadcasts/:broadcastId
   * Single broadcast detail.
   */
  getById = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const broadcast = await BroadcastService.getById(req.params.broadcastId);
      if (!broadcast) {
        ResponseUtil.notFound(res, 'Broadcast');
        return;
      }
      ResponseUtil.success(res, { broadcast }, 'Broadcast retrieved');
    } catch (err: unknown) {
      logger.error('getById broadcast error', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch broadcast', 'BROADCAST_FETCH_ERROR');
    }
  };

  /**
   * PATCH /api/admin/notifications/broadcasts/:broadcastId
   *
   * Edit a broadcast: updates the admin record, replaces all users' inbox rows,
   * and resends a corrected FCM push.
   *
   * Body (at least one required):
   *   title  string
   *   body   string
   *   data   object
   */
  update = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const { broadcastId } = req.params;
      const { title, body, data } = req.body;

      if (!title?.trim() && !body?.trim()) {
        ResponseUtil.badRequest(
          res,
          'At least one of title or body is required',
          'BROADCAST_UPDATE_FIELDS_REQUIRED'
        );
        return;
      }

      logger.info('Admin updating broadcast', { adminId, broadcastId });

      const result = await BroadcastService.update(
        broadcastId,
        { title, body, data },
        adminId
      );

      if (!result) {
        ResponseUtil.notFound(res, 'Broadcast');
        return;
      }

      ResponseUtil.success(
        res,
        { broadcast: result },
        'Broadcast updated and resent successfully'
      );
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('not found')) {
        ResponseUtil.notFound(res, 'Broadcast');
        return;
      }
      if (msg.includes('required') || msg.includes('must be')) {
        ResponseUtil.badRequest(res, msg, 'BROADCAST_UPDATE_VALIDATION_ERROR');
        return;
      }
      logger.error('Broadcast update error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to update broadcast', 'BROADCAST_UPDATE_ERROR');
    }
  };

  /**
   * DELETE /api/admin/notifications/broadcasts/:broadcastId
   *
   * Permanently removes the broadcast record and all users' inbox rows.
   * The FCM push already delivered to devices cannot be recalled (Firebase limitation).
   */
  remove = async (req: AdminRequest, res: Response): Promise<void> => {
    try {
      const adminId = req.user?.id;
      if (!adminId) {
        ResponseUtil.unauthorized(res, 'Admin authentication required');
        return;
      }

      const { broadcastId } = req.params;

      logger.warn('Admin deleting broadcast', { adminId, broadcastId });

      const result = await BroadcastService.remove(broadcastId, adminId);

      ResponseUtil.success(res, result, 'Broadcast deleted successfully');
    } catch (err: unknown) {
      const msg = toMessage(err);
      if (msg.includes('not found')) {
        ResponseUtil.notFound(res, 'Broadcast');
        return;
      }
      logger.error('Broadcast delete error', { error: msg });
      ResponseUtil.serverError(res, 'Failed to delete broadcast', 'BROADCAST_DELETE_ERROR');
    }
  };
}
