import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';

interface ReportIssueParams {
  deliveryId: string;
  reportedBy: string;
  reporterType: 'customer' | 'courier';
  issueType: 'package_damaged' | 'recipient_unavailable' | 'wrong_address' | 'courier_misconduct' | 'other';
  description: string;
  photoUrls?: string[];
}

interface CreateDisputeParams {
  deliveryId: string;
  issueId?: string;
  initiatedBy: string;
  initiatorType: 'customer' | 'courier';
  disputeReason: string;
  evidenceUrls?: string[];
}

interface ResolveDisputeParams {
  disputeId: string;
  reviewedBy: string;
  resolutionType: 'refund' | 'partial_refund' | 'penalty' | 'no_action';
  refundAmount?: number;
  penaltyAmount?: number;
  adminDecision: string;
}

/**
 * DeliveryIssueService
 * Handles issue reporting and dispute resolution
 */
export class DeliveryIssueService {
  /**
   * Report an issue with a delivery
   */
  public static async reportIssue(params: ReportIssueParams): Promise<any> {
    try {
      const {
        deliveryId,
        reportedBy,
        reporterType,
        issueType,
        description,
        photoUrls,
      } = params;

      // Create issue record
      const { data: issue, error } = await supabase
        .from('delivery_issues')
        .insert({
          delivery_id: deliveryId,
          reported_by: reportedBy,
          reporter_type: reporterType,
          issue_type: issueType,
          description,
          photo_urls: photoUrls || [],
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating delivery issue:', error);
        throw new Error('Failed to report issue');
      }

      // Update delivery status based on issue type
      if (['package_damaged', 'wrong_address'].includes(issueType)) {
        // Pause delivery until resolved
        await supabase
          .from('deliveries')
          .update({
            status: 'under_review',
            has_issue: true,
          })
          .eq('id', deliveryId);
      }

      logger.info(`Issue reported for delivery ${deliveryId}: ${issueType}`);

      return issue;
    } catch (error) {
      logger.error('Error in reportIssue:', error);
      throw error;
    }
  }

  /**
   * Get issues for a delivery
   */
  public static async getDeliveryIssues(deliveryId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('delivery_issues')
        .select('*')
        .eq('delivery_id', deliveryId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Error fetching delivery issues:', error);
        throw new Error('Failed to fetch issues');
      }

      return data || [];
    } catch (error) {
      logger.error('Error in getDeliveryIssues:', error);
      throw error;
    }
  }

  /**
   * Create a dispute
   */
  public static async createDispute(params: CreateDisputeParams): Promise<any> {
    try {
      const {
        deliveryId,
        issueId,
        initiatedBy,
        initiatorType,
        disputeReason,
        evidenceUrls,
      } = params;

      // Create dispute record
      const { data: dispute, error } = await supabase
        .from('delivery_disputes')
        .insert({
          delivery_id: deliveryId,
          issue_id: issueId,
          initiated_by: initiatedBy,
          initiator_type: initiatorType,
          dispute_reason: disputeReason,
          evidence_urls: evidenceUrls || [],
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        logger.error('Error creating dispute:', error);
        throw new Error('Failed to create dispute');
      }

      // Update delivery status
      await supabase
        .from('deliveries')
        .update({
          status: 'under_review',
          flagged_for_review: true,
          review_reason: 'Dispute filed',
        })
        .eq('id', deliveryId);

      logger.info(`Dispute created for delivery ${deliveryId}`);

      return dispute;
    } catch (error) {
      logger.error('Error in createDispute:', error);
      throw error;
    }
  }

  /**
   * Get disputes (admin only)
   */
  public static async getDisputes(filters: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ disputes: any[]; total: number }> {
    try {
      let query = supabase
        .from('delivery_disputes')
        .select(`
          *,
          delivery:deliveries(id, order_number, customer_id, courier_id),
          issue:delivery_issues(issue_type, description)
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(
          filters.offset,
          filters.offset + (filters.limit || 20) - 1
        );
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error('Error fetching disputes:', error);
        throw new Error('Failed to fetch disputes');
      }

      return {
        disputes: data || [],
        total: count || 0,
      };
    } catch (error) {
      logger.error('Error in getDisputes:', error);
      throw error;
    }
  }

  /**
   * Resolve a dispute (admin only)
   */
  public static async resolveDispute(params: ResolveDisputeParams): Promise<any> {
    try {
      const {
        disputeId,
        reviewedBy,
        resolutionType,
        refundAmount,
        penaltyAmount,
        adminDecision,
      } = params;

      // Update dispute
      const { data: dispute, error } = await supabase
        .from('delivery_disputes')
        .update({
          status: 'resolved',
          resolution_type: resolutionType,
          refund_amount: refundAmount,
          penalty_amount: penaltyAmount,
          admin_decision: adminDecision,
          reviewed_by: reviewedBy,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', disputeId)
        .select()
        .single();

      if (error) {
        logger.error('Error resolving dispute:', error);
        throw new Error('Failed to resolve dispute');
      }

      // Handle resolution actions
      if (resolutionType === 'refund' || resolutionType === 'partial_refund') {
        // Process refund
        await this.processRefund(dispute.delivery_id, refundAmount || 0);
      }

      if (resolutionType === 'penalty') {
        // Apply penalty (would integrate with payment system)
        logger.info(`Penalty of ${penaltyAmount} applied for dispute ${disputeId}`);
      }

      logger.info(`Dispute ${disputeId} resolved: ${resolutionType}`);

      return dispute;
    } catch (error) {
      logger.error('Error in resolveDispute:', error);
      throw error;
    }
  }

  /**
   * Process refund for dispute resolution
   */
  private static async processRefund(deliveryId: string, amount: number): Promise<void> {
    try {
      // Update delivery payment status
      await supabase
        .from('deliveries')
        .update({
          payment_status: 'refunded',
          status: 'cancelled',
        })
        .eq('id', deliveryId);

      // TODO: Integrate with payment service to process actual refund
      logger.info(`Refund of ${amount} processed for delivery ${deliveryId}`);
    } catch (error) {
      logger.error(`Error processing refund for delivery ${deliveryId}:`, error);
      throw error;
    }
  }

  /**
   * Update issue status (admin only)
   */
  public static async updateIssueStatus(
    issueId: string,
    status: 'pending' | 'under_review' | 'resolved' | 'rejected',
    adminNotes?: string,
    resolvedBy?: string
  ): Promise<any> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (adminNotes) {
        updateData.admin_notes = adminNotes;
      }

      if (status === 'resolved' || status === 'rejected') {
        updateData.resolved_by = resolvedBy;
        updateData.resolved_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('delivery_issues')
        .update(updateData)
        .eq('id', issueId)
        .select()
        .single();

      if (error) {
        logger.error('Error updating issue status:', error);
        throw new Error('Failed to update issue status');
      }

      return data;
    } catch (error) {
      logger.error('Error in updateIssueStatus:', error);
      throw error;
    }
  }
}
