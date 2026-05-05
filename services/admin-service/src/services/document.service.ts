import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { DocumentAccessLogService } from './document-access-log.service';
import { StorageUtil } from '../shared/storage.util';

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

    const filePath = document.file_path || document.document_url;
    if (!filePath) throw new Error('Document file path is missing');

    const pathValidation = StorageUtil.validateFilePath(filePath);
    if (!pathValidation.isValid) throw new Error(`Invalid file path: ${pathValidation.error}`);

    const fileExists = await StorageUtil.fileExists(filePath);
    if (!fileExists) {
      throw new Error('Document file not found in storage. Please re-upload the document.');
    }

    const { data, error: signedUrlError } = await supabase.storage
      .from('driver-documents')
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
}
