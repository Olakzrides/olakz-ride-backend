import { Router, Response } from 'express';
import { AdminRequest, adminAuthMiddleware } from '../middleware/auth.middleware';
import { DocumentService } from '../services/document.service';
import { ResponseUtil } from '../utils/response';
import { logger } from '../utils/logger';

const router = Router();
const documentService = new DocumentService();

router.use(adminAuthMiddleware);

/**
 * GET /api/admin/storage/signed-url?bucket=driver-documents&path=userId/type/file.jpg
 *
 * Proxy that generates a short-lived signed URL for any private storage object.
 * The frontend calls this instead of hitting Supabase directly, so the service
 * key never leaks to the client.
 *
 * Query params:
 *   bucket  - storage bucket name (required)
 *   path    - relative file path OR full public/signed URL (required)
 *   expires - TTL in seconds (optional, default 3600 = 1 hour)
 */
router.get('/signed-url', async (req: AdminRequest, res: Response): Promise<void> => {
  try {
    const { bucket, path, expires } = req.query;

    if (!bucket || typeof bucket !== 'string') {
      ResponseUtil.badRequest(res, 'bucket query param is required', 'MISSING_BUCKET');
      return;
    }
    if (!path || typeof path !== 'string') {
      ResponseUtil.badRequest(res, 'path query param is required', 'MISSING_PATH');
      return;
    }

    const expiresIn = expires ? Math.min(parseInt(expires as string, 10) || 3600, 86400) : 3600;

    const signedUrl = await documentService.getSignedUrlByPath(bucket, path, expiresIn);

    ResponseUtil.success(res, { signedUrl, expiresIn }, 'Signed URL generated');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('storage/signed-url error', { error: msg });
    ResponseUtil.serverError(res, `Failed to generate signed URL: ${msg}`, 'SIGNED_URL_ERROR');
  }
});

export default router;
