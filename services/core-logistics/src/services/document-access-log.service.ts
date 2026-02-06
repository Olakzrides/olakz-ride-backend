import { supabase } from '../config/database';
import { logger } from '../config/logger';

export interface DocumentAccessLog {
  documentId: string;
  userId: string;
  action: 'upload' | 'view' | 'download' | 'delete' | 'update' | 'review' | 'driver_review';
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export class DocumentAccessLogService {
  /**
   * Log document access for audit trail
   */
  static async logAccess(logData: DocumentAccessLog): Promise<void> {
    try {
      const { error } = await supabase
        .from('document_access_logs')
        .insert({
          document_id: logData.documentId,
          user_id: logData.userId,
          action: logData.action,
          ip_address: logData.ipAddress,
          user_agent: logData.userAgent,
          metadata: logData.metadata,
          created_at: new Date().toISOString(),
        });

      if (error) {
        logger.error('Failed to log document access:', error);
      } else {
        logger.info('Document access logged:', {
          documentId: logData.documentId,
          userId: logData.userId,
          action: logData.action,
        });
      }
    } catch (error) {
      logger.error('Document access logging error:', error);
    }
  }

  /**
   * Get access logs for a document
   */
  static async getDocumentAccessLogs(documentId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('document_access_logs')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to get document access logs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Get document access logs error:', error);
      return [];
    }
  }

  /**
   * Get access logs for a user
   */
  static async getUserAccessLogs(userId: string, limit: number = 100): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('document_access_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to get user access logs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Get user access logs error:', error);
      return [];
    }
  }

  /**
   * Clean up old access logs (data retention)
   */
  static async cleanupOldLogs(retentionDays: number = 365): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const { error } = await supabase
        .from('document_access_logs')
        .delete()
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        logger.error('Failed to cleanup old access logs:', error);
      } else {
        logger.info(`Cleaned up access logs older than ${retentionDays} days`);
      }
    } catch (error) {
      logger.error('Access logs cleanup error:', error);
    }
  }
}