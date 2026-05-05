import { supabase } from '../config/database';
import { logger } from '../utils/logger';

const BUCKET_NAME = 'driver-documents';

export class StorageUtil {
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      if (!filePath) return false;
      const pathParts = filePath.split('/');
      const fileName = pathParts.pop();
      const directory = pathParts.join('/') || '';

      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list(directory, { search: fileName });

      if (error) {
        logger.warn('File existence check failed', { filePath, error: error.message });
        return false;
      }
      return !!(data && data.some(f => f.name === fileName));
    } catch (err: unknown) {
      logger.error('File existence check error', { filePath });
      return false;
    }
  }

  static validateFilePath(filePath: string): { isValid: boolean; error?: string } {
    if (!filePath) return { isValid: false, error: 'File path is required' };
    if (filePath.includes(BUCKET_NAME))
      return { isValid: false, error: `Path must not contain bucket name "${BUCKET_NAME}"` };
    if (filePath.includes('//'))
      return { isValid: false, error: 'Path contains invalid double slashes' };
    if (filePath.startsWith('/'))
      return { isValid: false, error: 'Path must be relative' };
    if (filePath.split('/').length < 3)
      return { isValid: false, error: 'Path must follow format: userId/documentType/filename' };
    return { isValid: true };
  }

  static async getSignedUrl(filePath: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, expiresIn);
    if (error) throw new Error(`Failed to generate signed URL: ${error.message}`);
    return data.signedUrl;
  }
}
