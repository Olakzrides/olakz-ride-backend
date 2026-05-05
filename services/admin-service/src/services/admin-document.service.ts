import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { DocumentAccessLogService } from './document-access-log.service';

export interface AdminDocumentReview {
  documentId: string;
  reviewerId: string;
  action: 'approve' | 'reject' | 'request_replacement';
  notes?: string;
  rejectionReason?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

export class AdminDocumentService {
  async getPendingDocuments(limit = 50, offset = 0, _priority?: string): Promise<{ documents: unknown[]; total: number }> {
    const { data: documents, error } = await supabase
      .from('driver_documents')
      .select('*')
      .eq('status', 'pending')
      .eq('is_current_version', true)
      .is('driver_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to get pending documents: ${error.message}`);

    const { count: totalCount } = await supabase
      .from('driver_documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('is_current_version', true)
      .is('driver_id', null);

    const enriched = await Promise.all(
      (documents || []).map(async (doc) => {
        const d = doc as Record<string, unknown>;
        let driver = null, session = null;
        if (d.driver_id) {
          const { data } = await supabase.from('drivers').select('user_id, identification_type, identification_number').eq('id', d.driver_id).single();
          driver = data;
        }
        if (d.session_id) {
          const { data } = await supabase.from('driver_registration_sessions').select('user_id, vehicle_type').eq('id', d.session_id).single();
          session = data;
        }
        return { ...doc, driver, session };
      })
    );

    return { documents: enriched, total: totalCount || 0 };
  }

  async getDocumentForReview(documentId: string): Promise<unknown | null> {
    const { data: document, error } = await supabase.from('driver_documents').select('*').eq('id', documentId).single();
    if (error || !document) return null;

    const d = document as Record<string, unknown>;
    let driver = null, session = null;
    if (d.driver_id) {
      const { data } = await supabase.from('drivers').select('user_id, identification_type, identification_number').eq('id', d.driver_id).single();
      driver = data;
    }
    if (d.session_id) {
      const { data } = await supabase.from('driver_registration_sessions').select('user_id, vehicle_type').eq('id', d.session_id).single();
      session = data;
    }
    const { data: reviews } = await supabase.from('document_reviews').select('*').eq('document_id', documentId);
    return { ...document, driver, session, reviews: reviews || [] };
  }

  async reviewDocument(reviewData: AdminDocumentReview): Promise<boolean> {
    const { documentId, reviewerId, action, notes, rejectionReason, priority } = reviewData;

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

    if (reviewError) throw new Error(`Failed to create review: ${reviewError.message}`);

    const newStatus = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
    const { error: updateError } = await supabase.from('driver_documents').update({
      status: newStatus,
      verified_by: reviewerId,
      verified_at: new Date().toISOString(),
      notes,
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);

    if (updateError) throw new Error(`Failed to update document: ${updateError.message}`);

    await DocumentAccessLogService.logAccess({
      documentId,
      userId: reviewerId,
      action: 'review',
      metadata: { reviewAction: action, notes, rejectionReason, reviewId: (review as Record<string, unknown>).id },
    });

    logger.info('Document reviewed', { documentId, reviewerId, action });
    return true;
  }

  async getReviewStatistics(reviewerId?: string): Promise<unknown> {
    let query = supabase.from('document_reviews').select('action, status');
    if (reviewerId) query = query.eq('reviewer_id', reviewerId);
    const { data: reviews } = await query;
    return {
      total: reviews?.length || 0,
      approved: reviews?.filter(r => r.action === 'approve').length || 0,
      rejected: reviews?.filter(r => r.action === 'reject').length || 0,
      replacementRequested: reviews?.filter(r => r.action === 'request_replacement').length || 0,
      completed: reviews?.filter(r => r.status === 'completed').length || 0,
    };
  }

  async getDocumentVersions(documentId: string): Promise<unknown[]> {
    const { data } = await supabase
      .from('driver_documents')
      .select('*')
      .or(`id.eq.${documentId},parent_document_id.eq.${documentId}`)
      .order('version_number', { ascending: false });
    return data || [];
  }

  async bulkApproveDocuments(documentIds: string[], reviewerId: string, notes?: string): Promise<{ success: number; failed: number }> {
    let success = 0, failed = 0;
    for (const documentId of documentIds) {
      try {
        await this.reviewDocument({ documentId, reviewerId, action: 'approve', notes });
        success++;
      } catch { failed++; }
    }
    return { success, failed };
  }
}
