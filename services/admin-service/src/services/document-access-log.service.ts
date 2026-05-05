import { supabase } from '../config/database';
import { logger } from '../utils/logger';

export interface DocumentAccessLog {
  documentId: string;
  userId: string;
  action: 'upload' | 'view' | 'download' | 'delete' | 'update' | 'review' | 'driver_review';
  ipAddress?: string;
  userAgent?: string;
  metadata?: unknown;
}

export class DocumentAccessLogService {
  static async logAccess(logData: DocumentAccessLog): Promise<void> {
    try {
      const { error } = await supabase.from('document_access_logs').insert({
        document_id: logData.documentId,
        user_id: logData.userId,
        action: logData.action,
        ip_address: logData.ipAddress,
        user_agent: logData.userAgent,
        metadata: logData.metadata,
        created_at: new Date().toISOString(),
      });
      if (error) logger.error('Failed to log document access', { error: error.message });
    } catch (err: unknown) {
      logger.error('Document access logging error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  static async getDocumentAccessLogs(documentId: string): Promise<unknown[]> {
    try {
      const { data, error } = await supabase
        .from('document_access_logs')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });
      if (error) { logger.error('Failed to get document access logs', { error: error.message }); return []; }
      return data || [];
    } catch (err: unknown) {
      logger.error('Get document access logs error', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }
}
