import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { DocumentAccessLogService } from './document-access-log.service';
import { NotificationService } from './notification.service';

export interface AdminDriverReview {
  driverId: string;
  reviewerId: string;
  action: 'approve' | 'reject';
  notes?: string;
  rejectionReason?: string;
}

export interface DriverApplicationWithDetails {
  id: string;
  user_id: string;
  identification_type: string;
  identification_number: string;
  license_number?: string;
  vehicle_type_id: string;
  status: string;
  rating: number;
  total_rides: number;
  total_earnings: number;
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
  vehicle_type?: {
    id: string;
    name: string;
    display_name: string;
  };
  documents?: Array<{
    id: string;
    document_type: string;
    document_url: string;
    file_name: string;
    status: string;
    created_at: string;
  }>;
  vehicles?: Array<{
    id: string;
    plate_number: string;
    manufacturer: string;
    model: string;
    year: number;
    color: string;
  }>;
  session?: {
    id: string;
    personal_info_data: any;
    vehicle_details_data: any;
    submitted_at: string;
  };
}

export class AdminDriverService {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Get all pending driver applications for admin review
   */
  async getPendingDriverApplications(
    limit: number = 50,
    offset: number = 0
  ): Promise<{ drivers: DriverApplicationWithDetails[]; total: number }> {
    try {
      // Get pending drivers with their related data
      const { data: drivers, error } = await supabase
        .from('drivers')
        .select(`
          *,
          vehicle_type:vehicle_types(id, name, display_name),
          documents:driver_documents(
            id, document_type, document_url, file_name, status, created_at
          ),
          vehicles:driver_vehicles(
            id, plate_number, manufacturer, model, year, color
          )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('Get pending drivers error:', error);
        throw new Error(`Failed to get pending drivers: ${error.message}`);
      }

      // Get total count
      const { count: totalCount, error: countError } = await supabase
        .from('drivers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (countError) {
        logger.warn('Failed to get total count:', countError);
      }

      // Enrich with session data
      const enrichedDrivers = await Promise.all(
        (drivers || []).map(async (driver) => {
          // Get registration session data
          let session = null;
          const { data: sessionData } = await supabase
            .from('driver_registration_sessions')
            .select('id, personal_info_data, vehicle_details_data, submitted_at')
            .eq('user_id', driver.user_id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          if (sessionData) {
            session = sessionData;
          }

          return {
            ...driver,
            session,
          };
        })
      );

      return {
        drivers: enrichedDrivers,
        total: totalCount || 0,
      };
    } catch (error: any) {
      logger.error('Get pending drivers error:', error);
      throw error;
    }
  }

  /**
   * Get driver application details for admin review
   */
  async getDriverApplicationForReview(driverId: string): Promise<DriverApplicationWithDetails | null> {
    try {
      // Get the driver with all related data
      const { data: driver, error } = await supabase
        .from('drivers')
        .select(`
          *,
          vehicle_type:vehicle_types(id, name, display_name),
          documents:driver_documents(
            id, document_type, document_url, file_name, status, created_at,
            file_size, mime_type, verified_by, verified_at, notes
          ),
          vehicles:driver_vehicles(
            id, plate_number, manufacturer, model, year, color, is_active
          )
        `)
        .eq('id', driverId)
        .single();

      if (error) {
        logger.error('Get driver for review error:', error);
        
        // If driver not found, check if this is a session ID instead
        if (error.code === 'PGRST116') {
          logger.info('Driver not found, checking if this is a session ID:', { driverId });
          return null;
        }
        
        return null;
      }

      if (!driver) {
        return null;
      }

      // Get registration session data
      let session = null;
      const { data: sessionData } = await supabase
        .from('driver_registration_sessions')
        .select('id, personal_info_data, vehicle_details_data, submitted_at, vehicle_type, service_types')
        .eq('user_id', driver.user_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (sessionData) {
        session = sessionData;
      }

      return {
        ...driver,
        session,
      };
    } catch (error: any) {
      logger.error('Get driver for review error:', error);
      return null;
    }
  }

  /**
   * Review a driver application (approve or reject)
   */
  async reviewDriverApplication(reviewData: AdminDriverReview): Promise<boolean> {
    try {
      const { driverId, reviewerId, action, notes, rejectionReason } = reviewData;

      // Update driver status
      const updateData: any = {
        status: action === 'approve' ? 'approved' : 'rejected',
        approved_by: reviewerId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (action === 'reject' && rejectionReason) {
        updateData.rejection_reason = rejectionReason;
      }

      // Note: Driver table doesn't have notes column, notes are stored in document reviews

      const { error: driverUpdateError } = await supabase
        .from('drivers')
        .update(updateData)
        .eq('id', driverId);

      if (driverUpdateError) {
        logger.error('Update driver status error:', driverUpdateError);
        throw new Error(`Failed to update driver: ${driverUpdateError.message}`);
      }

      // Update all driver documents to match driver status
      const documentStatus = action === 'approve' ? 'approved' : 'rejected';
      const { error: documentsUpdateError } = await supabase
        .from('driver_documents')
        .update({
          status: documentStatus,
          verified_by: reviewerId,
          verified_at: new Date().toISOString(),
          notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('driver_id', driverId);

      if (documentsUpdateError) {
        logger.error('Update documents status error:', documentsUpdateError);
        // Don't throw error - driver update is more important
      }

      // Create document reviews for audit trail
      const { data: documents } = await supabase
        .from('driver_documents')
        .select('id')
        .eq('driver_id', driverId);

      if (documents && documents.length > 0) {
        const reviewRecords = documents.map(doc => ({
          document_id: doc.id,
          reviewer_id: reviewerId,
          action,
          status: 'completed',
          notes,
          rejection_reason: rejectionReason,
          replacement_requested: false,
          priority: 'normal',
          reviewed_at: new Date().toISOString(),
        }));

        await supabase
          .from('document_reviews')
          .insert(reviewRecords);
      }

      // Send notification
      await this.sendDriverNotification(driverId, action, notes);

      // Log admin action
      await DocumentAccessLogService.logAccess({
        documentId: driverId, // Use driver ID as document ID for logging
        userId: reviewerId,
        action: 'driver_review',
        metadata: {
          reviewAction: action,
          notes,
          rejectionReason,
          documentsCount: documents?.length || 0,
        },
      });

      logger.info('Driver application reviewed successfully:', {
        driverId,
        reviewerId,
        action,
        documentsUpdated: documents?.length || 0,
      });

      return true;
    } catch (error: any) {
      logger.error('Review driver application error:', error);
      throw error;
    }
  }

  /**
   * Send notification for driver status change
   */
  private async sendDriverNotification(
    driverId: string,
    action: string,
    notes?: string
  ): Promise<void> {
    try {
      // Get driver details
      const { data: driver, error } = await supabase
        .from('drivers')
        .select('user_id, identification_type, identification_number, rejection_reason')
        .eq('id', driverId)
        .single();

      if (error || !driver) {
        logger.error('Failed to get driver for notification:', error);
        return;
      }

      // Create notification record
      const notificationType = action === 'approve' ? 'application_approved' : 'application_rejected';

      const { data: notification, error: notificationError } = await supabase
        .from('driver_notifications')
        .insert({
          driver_id: driverId,
          user_id: driver.user_id,
          type: notificationType,
          title: action === 'approve' ? 'Application Approved' : 'Application Not Approved',
          message: action === 'approve' 
            ? 'Your driver application has been approved. You can now start accepting rides.'
            : `Your driver application was not approved. Reason: ${driver.rejection_reason || 'Please contact support for details.'}`,
          status: 'pending',
          metadata: {
            driverId,
            identificationType: driver.identification_type,
            identificationNumber: driver.identification_number,
            notes,
          },
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (notificationError) {
        logger.error('Failed to create driver notification record:', notificationError);
        return;
      }

      // Send email notification (async, don't wait)
      this.notificationService.sendDriverReviewEmail({
        driverId,
        userId: driver.user_id,
        action: action as 'approve' | 'reject',
        notes,
        rejectionReason: driver.rejection_reason,
      }).then(async (result) => {
        // Update notification status based on email result
        const updateData: any = {
          updated_at: new Date().toISOString(),
        };

        if (result.success) {
          updateData.status = 'sent';
          updateData.sent_at = new Date().toISOString();
          logger.info('Driver notification email sent successfully:', { driverId, notificationId: notification.id });
        } else {
          updateData.status = 'failed';
          updateData.error_message = result.error;
          logger.error('Driver notification email failed:', { driverId, notificationId: notification.id, error: result.error });
        }

        // Update notification record
        try {
          await supabase
            .from('driver_notifications')
            .update(updateData)
            .eq('id', notification.id);
          logger.info('Notification status updated:', { notificationId: notification.id, status: updateData.status });
        } catch (updateError: any) {
          logger.error('Failed to update notification status:', updateError);
        }
      }).catch(async (error: any) => {
        logger.error('Failed to send notification email:', error);
        // Update notification to failed
        try {
          await supabase
            .from('driver_notifications')
            .update({
              status: 'failed',
              error_message: error.message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', notification.id);
          logger.info('Notification marked as failed');
        } catch (updateError: any) {
          logger.error('Failed to update notification to failed status:', updateError);
        }
      });

      logger.info('Driver notification created:', {
        driverId,
        notificationId: notification.id,
        type: notificationType,
      });
    } catch (error: any) {
      logger.error('Send driver notification error:', error);
      // Don't throw - notification failure shouldn't block driver review
    }
  }

  /**
   * Get admin review statistics for drivers
   */
  async getDriverReviewStatistics(reviewerId?: string): Promise<any> {
    try {
      let query = supabase
        .from('drivers')
        .select('status, approved_at, approved_by');

      if (reviewerId) {
        query = query.eq('approved_by', reviewerId);
      }

      const { data: drivers, error } = await query;

      if (error) {
        logger.error('Get driver review statistics error:', error);
        return null;
      }

      // Calculate statistics
      const stats = {
        total: drivers?.length || 0,
        approved: drivers?.filter(d => d.status === 'approved').length || 0,
        rejected: drivers?.filter(d => d.status === 'rejected').length || 0,
        pending: drivers?.filter(d => d.status === 'pending').length || 0,
        suspended: drivers?.filter(d => d.status === 'suspended').length || 0,
      };

      return stats;
    } catch (error: any) {
      logger.error('Get driver review statistics error:', error);
      return null;
    }
  }

  /**
   * Bulk approve driver applications
   */
  async bulkApproveDrivers(
    driverIds: string[],
    reviewerId: string,
    notes?: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const driverId of driverIds) {
      try {
        await this.reviewDriverApplication({
          driverId,
          reviewerId,
          action: 'approve',
          notes,
        });
        success++;
      } catch (error) {
        logger.error(`Failed to approve driver ${driverId}:`, error);
        failed++;
      }
    }

    logger.info('Bulk driver approval completed:', { success, failed, total: driverIds.length });
    return { success, failed };
  }
}