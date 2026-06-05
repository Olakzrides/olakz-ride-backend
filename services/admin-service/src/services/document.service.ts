import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { DocumentAccessLogService } from './document-access-log.service';
import { StorageUtil } from '../shared/storage.util';

const BUCKET = 'driver-documents';

/**
 * Extracts a relative storage path from either a relative path or a full
 * Supabase public/signed URL.
 *
 * Handles:
 *   - Already relative:  "userId/documentType/filename.jpg"
 *   - Public URL:        "https://.../storage/v1/object/public/driver-documents/userId/..."
 *   - Signed URL:        "https://.../storage/v1/object/sign/driver-documents/userId/..."
 *   - Authenticated URL: "https://.../storage/v1/object/authenticated/driver-documents/userId/..."
 */
function extractRelativePath(rawPath: string): string {
  if (!rawPath) return rawPath;

  // If it's already a relative path (no scheme), return as-is
  if (!rawPath.startsWith('http://') && !rawPath.startsWith('https://')) {
    return rawPath;
  }

  // Strip query params (signed URL tokens etc.)
  const withoutQuery = rawPath.split('?')[0];

  // Match the bucket name in the URL and take everything after it
  const bucketMarker = `/${BUCKET}/`;
  const idx = withoutQuery.indexOf(bucketMarker);
  if (idx !== -1) {
    return withoutQuery.slice(idx + bucketMarker.length);
  }

  // Fallback — return as-is; validation will catch bad paths downstream
  return rawPath;
}

export class DocumentService {
  async getSecureDocumentUrl(
    documentId: string,
    userId: string,
    expiresIn = 24 * 60 * 60,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    const { data: document, error } = await supabase
      .from('driver_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (error || !document) throw new Error('Document not found');

    // Prefer file_path (always relative); fall back to document_url (may be a full URL)
    const rawPath = document.file_path || document.document_url;
    if (!rawPath) throw new Error('Document file path is missing');

    // Normalise to a relative path the storage SDK expects
    const filePath = extractRelativePath(rawPath);

    const pathValidation = StorageUtil.validateFilePath(filePath);
    if (!pathValidation.isValid) throw new Error(`Invalid file path: ${pathValidation.error}`);

    // Generate signed URL directly — skip the existence check to avoid an
    // extra round-trip; the createSignedUrl call will fail if the file is absent.
    const { data, error: signedUrlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(filePath, expiresIn);

    if (signedUrlError) throw new Error(`Failed to generate signed URL: ${signedUrlError.message}`);

    await DocumentAccessLogService.logAccess({
      documentId,
      userId,
      action: 'view',
      ipAddress,
      userAgent,
      metadata: { expiresIn, fileName: document.file_name },
    });

    logger.info('Secure document URL generated', { documentId, userId });
    return data.signedUrl;
  }

  /**
   * Generate a signed URL directly from a bucket + relative path.
   * Used by the storage proxy endpoint so the frontend doesn't need to
   * know the Supabase project URL or service key.
   *
   * GET /api/admin/storage/signed-url?bucket=driver-documents&path=userId/type/file.jpg
   */
  async getSignedUrlByPath(bucket: string, path: string, expiresIn = 3600): Promise<string> {
    const relativePath = extractRelativePath(path);

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(relativePath, expiresIn);

    if (error) throw new Error(`Failed to generate signed URL: ${error.message}`);
    return data.signedUrl;
  }
}
