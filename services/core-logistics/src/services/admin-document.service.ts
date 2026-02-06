import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { DocumentAccessLogService } from './document-access-log.service';

export interface AdminDocumentReview {
  documentId: string;
  reviewerId: string;
  action: 'approve' | 'reject' | 'request_replacement';
  notes?: string;
  rejectionReason?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export interface DocumentWithDetails {
  id: string;
  document_type: string;
  document_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: string;
  driver_id?: string;
  session_id?: string;
  version_number: number;
  is_current_version: boolean;
  created_at: string;
  updated_at: string;
  verified_by?: string;
  verified_at?: string;
  expiry_date?: string;
  notes?: string;
  extracted_text?: string;
  ocr_data?: any;
  validation_errors?: any[];
  driver?: {
    user_id: string;
    identification_type: string;
    identification_number: string;
  };
  session?: {
    user_id: string;
    vehicle_type: string;
  };
}

export class AdminDocumentService {
  /**
   * Get all pending documents for admin review
   */
  async getPendingDocuments(
    limit: number = 50,
    offset: number = 0,
    _priority?: string
  ): Promise<{ documents: DocumentWithDetails[]; total: number }> {
    try {
      // **DEPRECATED**: Individual document review is deprecated
      // Admins should now review complete driver applications instead
      
      // First get the basic documents without joins to avoid relationship issues
      let query = supabase
        .from('driver_documents')
        .select('*')
        .eq('status', 'pending')
        .eq('is_current_version', true)
        .is('driver_id', null) // Only show documents not yet linked to drivers
        .order('created_at', { ascending: false });

      const { data: documents, error } = await query
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Get pending documents error:', error);
        throw new Error(`Failed to get pending documents: ${error.message}`);
      }

      // Get total count
      const { count: totalCount, error: countError } = await supabase
        .from('driver_documents')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('is_current_version', true)
        .is('driver_id', null);

      if (countError) {
        logger.warn('Failed to get total count:', countError);
      }

      // Enrich documents with driver and session data if available
      const enrichedDocuments = await Promise.all(
        (documents || []).map(async (doc) => {
          let driver = null;
          let session = null;

          // Get driver info if driverId exists
          if (doc.driver_id) {
            const { data: driverData } = await supabase
              .from('drivers')
              .select('user_id, identification_type, identification_number')
              .eq('id', doc.driver_id)
              .single();
            driver = driverData;
          }

          // Get session info if sessionId exists
          if (doc.session_id) {
            const { data: sessionData } = await supabase
              .from('driver_registration_sessions')
              .select('user_id, vehicle_type')
              .eq('id', doc.session_id)
              .single();
            session = sessionData;
          }

          return {
            ...doc,
            driver,
            session,
          };
        })
      );

      return {
        documents: enrichedDocuments,
        total: totalCount || 0,
      };
    } catch (error: any) {
      logger.error('Get pending documents error:', error);
      throw error;
    }
  }

  /**
   * Get document details with OCR data for admin review
   */
  async getDocumentForReview(documentId: string): Promise<DocumentWithDetails | null> {
    try {
      // Get the document first
      const { data: document, error } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error) {
        logger.error('Get document for review error:', error);
        return null;
      }

      if (!document) {
        return null;
      }

      // Enrich with related data
      let driver = null;
      let session = null;
      let reviews = [];

      // Get driver info if driverId exists
      if (document.driver_id) {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('user_id, identification_type, identification_number')
          .eq('id', document.driver_id)
          .single();
        driver = driverData;
      }

      // Get session info if sessionId exists
      if (document.session_id) {
        const { data: sessionData } = await supabase
          .from('driver_registration_sessions')
          .select('user_id, vehicle_type')
          .eq('id', document.session_id)
          .single();
        session = sessionData;
      }

      // Get reviews
      const { data: reviewsData } = await supabase
        .from('document_reviews')
        .select('*')
        .eq('document_id', documentId);
      reviews = reviewsData || [];

      return {
        ...document,
        driver,
        session,
        reviews,
      };
    } catch (error: any) {
      logger.error('Get document for review error:', error);
      return null;
    }
  }

  /**
   * Review a document (approve, reject, or request replacement)
   */
  async reviewDocument(reviewData: AdminDocumentReview): Promise<boolean> {
    try {
      const { documentId, reviewerId, action, notes, rejectionReason, priority } = reviewData;

      // Start transaction
      const { data: review, error: reviewError } = await supabase
        .from('document_reviews')
        .insert({
          document_id: documentId,
          reviewer_id: reviewerId,
          action,
          status: 'completed',
          notes,
          rejection_reason: rejectionReason,
          replacement_requested: action === 'request_replacement',
          priority: priority || 'normal',
          reviewed_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (reviewError) {
        logger.error('Create document review error:', reviewError);
        throw new Error(`Failed to create review: ${reviewError.message}`);
      }

      // Update document status
      const newStatus = action === 'approve' ? 'approved' : 
                       action === 'reject' ? 'rejected' : 'pending';

      const { error: updateError } = await supabase
        .from('driver_documents')
        .update({
          status: newStatus,
          verified_by: reviewerId,
          verified_at: new Date().toISOString(),
          notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId);

      if (updateError) {
        logger.error('Update document status error:', updateError);
        throw new Error(`Failed to update document: ${updateError.message}`);
      }

      // Send notification email
      await this.sendDocumentNotification(documentId, action, notes);

      // Log admin action
      await DocumentAccessLogService.logAccess({
        documentId,
        userId: reviewerId,
        action: 'review',
        metadata: {
          reviewAction: action,
          notes,
          rejectionReason,
        },
      });

      logger.info('Document reviewed successfully:', {
        documentId,
        reviewerId,
        action,
        reviewId: review.id,
      });

      return true;
    } catch (error: any) {
      logger.error('Review document error:', error);
      throw error;
    }
  }

  /**
   * Send email notification for document status change
   */
  private async sendDocumentNotification(
    documentId: string,
    action: string,
    notes?: string
  ): Promise<void> {
    try {
      // Get document first
      const { data: document, error } = await supabase
        .from('driver_documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error || !document) {
        logger.error('Failed to get document for notification:', error);
        return;
      }

      let userId = null;

      // Get user ID from driver or session
      if (document.driver_id) {
        const { data: driver } = await supabase
          .from('drivers')
          .select('user_id')
          .eq('id', document.driver_id)
          .single();
        userId = driver?.user_id;
      } else if (document.session_id) {
        const { data: session } = await supabase
          .from('driver_registration_sessions')
          .select('user_id')
          .eq('id', document.session_id)
          .single();
        userId = session?.user_id;
      }

      if (!userId) {
        logger.error('No user ID found for document notification');
        return;
      }

      // Create notification record
      const notificationType = action === 'approve' ? 'document_approved' :
                              action === 'reject' ? 'document_rejected' :
                              'replacement_requested';

      const { error: notificationError } = await supabase
        .from('document_notifications')
        .insert({
          document_id: documentId,
          user_id: userId,
          notification_type: notificationType,
          metadata: {
            documentType: document.document_type,
            fileName: document.file_name,
            notes,
          },
        });

      if (notificationError) {
        logger.error('Failed to create notification record:', notificationError);
      }

      // TODO: Integrate with auth service to get user email and send actual email
      logger.info('Document notification created:', {
        documentId,
        userId,
        notificationType,
      });
    } catch (error: any) {
      logger.error('Send document notification error:', error);
    }
  }

  /**
   * Get admin review statistics
   */
  async getReviewStatistics(reviewerId?: string): Promise<any> {
    try {
      let query = supabase
        .from('document_reviews')
        .select('action, status, created_at');

      if (reviewerId) {
        query = query.eq('reviewer_id', reviewerId);
      }

      const { data: reviews, error } = await query;

      if (error) {
        logger.error('Get review statistics error:', error);
        return null;
      }

      // Calculate statistics
      const stats = {
        total: reviews?.length || 0,
        approved: reviews?.filter(r => r.action === 'approve').length || 0,
        rejected: reviews?.filter(r => r.action === 'reject').length || 0,
        replacementRequested: reviews?.filter(r => r.action === 'request_replacement').length || 0,
        pending: reviews?.filter(r => r.status === 'pending').length || 0,
        completed: reviews?.filter(r => r.status === 'completed').length || 0,
      };

      return stats;
    } catch (error: any) {
      logger.error('Get review statistics error:', error);
      return null;
    }
  }

  /**
   * Get document version history
   */
  async getDocumentVersions(documentId: string): Promise<any[]> {
    try {
      const { data: versions, error } = await supabase
        .from('driver_documents')
        .select('*')
        .or(`id.eq.${documentId},parent_document_id.eq.${documentId}`)
        .order('version_number', { ascending: false });

      if (error) {
        logger.error('Get document versions error:', error);
        return [];
      }

      return versions || [];
    } catch (error: any) {
      logger.error('Get document versions error:', error);
      return [];
    }
  }

  /**
   * Bulk approve documents (for admin efficiency)
   */
  async bulkApproveDocuments(
    documentIds: string[],
    reviewerId: string,
    notes?: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const documentId of documentIds) {
      try {
        await this.reviewDocument({
          documentId,
          reviewerId,
          action: 'approve',
          notes,
        });
        success++;
      } catch (error) {
        logger.error(`Failed to approve document ${documentId}:`, error);
        failed++;
      }
    }

    logger.info('Bulk approve completed:', { success, failed, total: documentIds.length });
    return { success, failed };
  }
}