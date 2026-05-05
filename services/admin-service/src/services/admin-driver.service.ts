import { supabase } from '../config/database';
import { logger } from '../utils/logger';
import { DocumentAccessLogService } from './document-access-log.service';
import { NotificationService } from './notification.service';

export interface AdminDriverReview {
  driverId: string;
  reviewerId: string;
  action: 'approve' | 'reject';
  serviceTier?: 'standard' | 'premium' | 'vip';
  notes?: string;
  rejectionReason?: string;
}

export class AdminDriverService {
  private notificationService = new NotificationService();

  async getPendingDriverApplications(limit = 50, offset = 0): Promise<{ drivers: unknown[]; total: number }> {
    const { data: drivers, error } = await supabase
      .from('drivers')
      .select(`
        *,
        vehicle_type:vehicle_types!drivers_vehicle_type_id_fkey(id, name, display_name),
        documents:driver_documents(id, document_type, document_url, file_name, status, created_at),
        vehicles:driver_vehicles(id, plate_number, manufacturer, model, year, color)
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Failed to get pending drivers: ${error.message}`);

    const { count: totalCount } = await supabase
      .from('drivers')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const enriched = await Promise.all(
      (drivers || []).map(async (driver) => {
        const { data: session } = await supabase
          .from('driver_registration_sessions')
          .select('id, personal_info_data, vehicle_details_data, submitted_at')
          .eq('user_id', (driver as Record<string, unknown>).user_id)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        return { ...driver, session: session || null };
      })
    );

    return { drivers: enriched, total: totalCount || 0 };
  }

  async getDriverApplicationForReview(driverId: string): Promise<unknown | null> {
    const { data: driver, error } = await supabase
      .from('drivers')
      .select(`
        *,
        vehicle_type:vehicle_types!drivers_vehicle_type_id_fkey(id, name, display_name),
        documents:driver_documents(id, document_type, document_url, file_name, status, created_at, file_size, mime_type, verified_by, verified_at, notes),
        vehicles:driver_vehicles(id, plate_number, manufacturer, model, year, color, is_active)
      `)
      .eq('id', driverId)
      .single();

    if (error || !driver) return null;

    const { data: session } = await supabase
      .from('driver_registration_sessions')
      .select('id, personal_info_data, vehicle_details_data, submitted_at, vehicle_type, service_types')
      .eq('user_id', (driver as Record<string, unknown>).user_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return { ...driver, session: session || null };
  }

  async reviewDriverApplication(reviewData: AdminDriverReview): Promise<boolean> {
    const { driverId, reviewerId, action, serviceTier, notes, rejectionReason } = reviewData;

    if (action === 'approve' && !serviceTier) throw new Error('Service tier is required when approving a driver');

    const serviceTierMap: Record<string, string> = {
      standard: '00000000-0000-0000-0000-000000000011',
      premium: '00000000-0000-0000-0000-000000000012',
      vip: '00000000-0000-0000-0000-000000000013',
    };

    const { data: driverData, error: fetchError } = await supabase
      .from('drivers')
      .select('user_id')
      .eq('id', driverId)
      .single();

    if (fetchError || !driverData) throw new Error('Driver not found');

    const updateData: Record<string, unknown> = {
      status: action === 'approve' ? 'approved' : 'rejected',
      approved_by: reviewerId,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (action === 'approve' && serviceTier) updateData.service_tier_id = serviceTierMap[serviceTier];
    if (action === 'reject' && rejectionReason) updateData.rejection_reason = rejectionReason;

    const { error: driverUpdateError } = await supabase.from('drivers').update(updateData).eq('id', driverId);
    if (driverUpdateError) throw new Error(`Failed to update driver: ${driverUpdateError.message}`);

    if (action === 'approve') await this.updateUserRoleToDriver((driverData as Record<string, unknown>).user_id as string);

    const documentStatus = action === 'approve' ? 'approved' : 'rejected';
    await supabase.from('driver_documents').update({
      status: documentStatus,
      verified_by: reviewerId,
      verified_at: new Date().toISOString(),
      notes,
      updated_at: new Date().toISOString(),
    }).eq('driver_id', driverId);

    const { data: documents } = await supabase.from('driver_documents').select('id').eq('driver_id', driverId);
    if (documents && documents.length > 0) {
      await supabase.from('document_reviews').insert(
        documents.map(doc => ({
          document_id: doc.id,
          reviewer_id: reviewerId,
          action,
          status: 'completed',
          notes,
          rejection_reason: rejectionReason,
          replacement_requested: false,
          priority: 'normal',
          reviewed_at: new Date().toISOString(),
        }))
      );
    }

    await this.sendDriverNotification(driverId, action, notes);

    await DocumentAccessLogService.logAccess({
      documentId: driverId,
      userId: reviewerId,
      action: 'driver_review',
      metadata: { reviewAction: action, serviceTier, notes, rejectionReason },
    });

    logger.info('Driver application reviewed', { driverId, reviewerId, action });
    return true;
  }

  private async updateUserRoleToDriver(userId: string): Promise<void> {
    const { data: user } = await supabase.from('users').select('roles').eq('id', userId).single();
    if (!user) return;
    const currentRoles: string[] = (user as Record<string, unknown>).roles as string[] || [];
    const updatedRoles = currentRoles.includes('driver') ? currentRoles : [...currentRoles, 'driver'];
    await supabase.from('users').update({
      role: 'driver', roles: updatedRoles, active_role: 'driver', updated_at: new Date().toISOString(),
    }).eq('id', userId);
  }

  private async sendDriverNotification(driverId: string, action: string, notes?: string): Promise<void> {
    try {
      const { data: driver } = await supabase
        .from('drivers')
        .select('user_id, rejection_reason')
        .eq('id', driverId)
        .single();
      if (!driver) return;

      const d = driver as Record<string, unknown>;
      await this.notificationService.sendDriverReviewEmail({
        driverId,
        userId: d.user_id as string,
        action: action as 'approve' | 'reject',
        notes,
        rejectionReason: d.rejection_reason as string | undefined,
      });
    } catch (err: unknown) {
      logger.error('sendDriverNotification error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  async getDriverReviewStatistics(reviewerId?: string): Promise<unknown> {
    let query = supabase.from('drivers').select('status, approved_by');
    if (reviewerId) query = query.eq('approved_by', reviewerId);
    const { data: drivers } = await query;
    return {
      total: drivers?.length || 0,
      approved: drivers?.filter(d => d.status === 'approved').length || 0,
      rejected: drivers?.filter(d => d.status === 'rejected').length || 0,
      pending: drivers?.filter(d => d.status === 'pending').length || 0,
      suspended: drivers?.filter(d => d.status === 'suspended').length || 0,
    };
  }

  async bulkApproveDrivers(driverIds: string[], reviewerId: string, notes?: string): Promise<{ success: number; failed: number }> {
    let success = 0, failed = 0;
    for (const driverId of driverIds) {
      try {
        await this.reviewDriverApplication({ driverId, reviewerId, action: 'approve', notes });
        success++;
      } catch { failed++; }
    }
    return { success, failed };
  }
}
