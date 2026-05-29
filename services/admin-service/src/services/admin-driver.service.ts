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

  // ─── Get all drivers ────────────────────────────────────────────────────────

  async getAllDrivers(filters: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ drivers: unknown[]; total: number; page: number; limit: number }> {
    const { status, search, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let q = supabase
      .from('drivers')
      .select(
        `id, user_id, license_number, status, rating, total_rides, total_earnings,
         identification_type, identification_number, created_at, updated_at,
         vehicle_type:vehicle_types!drivers_vehicle_type_id_fkey(id, name, display_name),
         vehicles:driver_vehicles(id, plate_number, manufacturer, model, year, color)`,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status.toLowerCase() !== 'all') q = q.eq('status', status);

    const { data: drivers, count, error } = await q;
    if (error) throw new Error(`Failed to get drivers: ${error.message}`);

    // Enrich with user details
    const userIds = (drivers ?? []).map((d) => (d as Record<string, unknown>).user_id as string);
    const userMap = await this.fetchUsers(userIds);

    let enriched = (drivers ?? []).map((d, idx) => {
      const row = d as Record<string, unknown>;
      const user = userMap.get(row.user_id as string) ?? {} as Record<string, unknown>;
      return {
        sn: offset + idx + 1,
        id: row.id,
        user_id: row.user_id,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        email: user.email ?? null,
        phone: user.phone ?? null,
        avatar_url: user.avatar_url ?? null,
        license_number: row.license_number,
        identification_type: row.identification_type,
        identification_number: row.identification_number,
        driver_status: row.status,
        rating: row.rating,
        total_rides: row.total_rides,
        total_earnings: row.total_earnings,
        vehicle_type: row.vehicle_type,
        vehicles: row.vehicles,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    });

    // Apply search after enrichment
    if (search) {
      const sq = search.toLowerCase();
      enriched = enriched.filter(
        (d) =>
          `${d.first_name ?? ''} ${d.last_name ?? ''}`.toLowerCase().includes(sq) ||
          (d.email as string ?? '').toLowerCase().includes(sq)
      );
    }

    return { drivers: enriched, total: count ?? 0, page, limit };
  }

  // ─── Get driver by ID ────────────────────────────────────────────────────────

  async getDriverById(driverId: string): Promise<unknown | null> {
    const { data: driver, error } = await supabase
      .from('drivers')
      .select(
        `id, user_id, license_number, status, rating, total_rides, total_earnings,
         identification_type, identification_number,
         approved_by, approved_at, rejection_reason, created_at, updated_at,
         vehicle_type:vehicle_types!drivers_vehicle_type_id_fkey(id, name, display_name),
         vehicles:driver_vehicles(id, plate_number, manufacturer, model, year, color, is_active),
         documents:driver_documents(id, document_type, document_url, file_name, status, created_at)`
      )
      .eq('id', driverId)
      .single();

    if (error || !driver) return null;
    const row = driver as Record<string, unknown>;

    const userMap = await this.fetchUsers([row.user_id as string]);
    const user = userMap.get(row.user_id as string) ?? {} as Record<string, unknown>;
    const walletBalance = await this.getWalletBalance(row.user_id as string);

    return {
      id: row.id,
      user_id: row.user_id,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      avatar_url: user.avatar_url ?? null,
      account_status: user.status ?? null,
      email_verified: user.email_verified ?? null,
      license_number: row.license_number,
      identification_type: row.identification_type,
      identification_number: row.identification_number,
      driver_status: row.status,
      rating: row.rating,
      total_rides: row.total_rides,
      total_earnings: row.total_earnings,
      approved_by: row.approved_by,
      approved_at: row.approved_at,
      rejection_reason: row.rejection_reason,
      vehicle_type: row.vehicle_type,
      vehicles: row.vehicles,
      documents: row.documents,
      wallet_balance: walletBalance,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Profile fields not yet in DB
      gender: null,
      date_of_birth: null,
      nationality: null,
      address_line: null,
      city: null,
      state: null,
      country: null,
    };
  }

  // ─── Driver ride history ─────────────────────────────────────────────────────

  async getDriverRides(driverId: string, filters: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<unknown> {
    const { page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    // Verify driver exists
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) throw new Error('Driver not found');

    let q = supabase
      .from('rides')
      .select(
        `id, status, pickup_address, dropoff_address,
         driver_rating, passenger_rating,
         started_at, completed_at, created_at, final_fare, estimated_fare`,
        { count: 'exact' }
      )
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });

    if (filters.status && filters.status.toLowerCase() !== 'all') {
      q = q.eq('status', filters.status);
    }
    if (filters.from) q = q.gte('created_at', filters.from);
    if (filters.to) {
      const toEnd = new Date(filters.to);
      toEnd.setHours(23, 59, 59, 999);
      q = q.lte('created_at', toEnd.toISOString());
    }

    const { data: rides, count, error } = await q.range(offset, offset + limit - 1);
    if (error) {
      logger.warn('getDriverRides error', { error: error.message });
      return { rides: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const statusMap: Record<string, string> = {
      completed: 'Completed', cancelled: 'Cancelled',
      pending: 'Pending', searching: 'Pending',
      accepted: 'In Progress', in_progress: 'In Progress', confirmed: 'In Progress',
    };

    const result = (rides ?? []).map((r, idx) => {
      const row = r as Record<string, unknown>;
      const iso = row.created_at as string;
      return {
        sn: offset + idx + 1,
        id: row.id,
        location: row.pickup_address ?? null,
        destination: row.dropoff_address ?? null,
        rating: row.driver_rating ?? null,
        date: new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        time: new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }),
        status: statusMap[(row.status as string)?.toLowerCase()] ?? row.status,
        fare: row.final_fare ?? row.estimated_fare ?? null,
      };
    });

    return { rides: result, pagination: { page, limit, total: count ?? 0, pages: Math.ceil((count ?? 0) / limit) } };
  }

  // ─── Suspend / reactivate driver ─────────────────────────────────────────────

  async toggleSuspend(driverId: string, adminId: string): Promise<{ driver: unknown; action: string }> {
    const { data: existing, error } = await supabase
      .from('drivers')
      .select('id, user_id, status')
      .eq('id', driverId)
      .single();

    if (error || !existing) throw new Error('Driver not found');

    const row = existing as Record<string, unknown>;
    if (row.status === 'terminated') throw new Error('ACCOUNT_TERMINATED');

    const newStatus = row.status === 'suspended' ? 'approved' : 'suspended';

    const { data: updated, error: updateError } = await supabase
      .from('drivers')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', driverId)
      .select('id, user_id, status, updated_at')
      .single();

    if (updateError || !updated) throw new Error('Failed to update driver status');

    // Suspend only affects drivers.status — users.status is NOT touched.
    // A suspended driver can still use the platform as a regular user
    // (book rides as passenger, use wallet, etc.) but cannot accept
    // or receive any driver jobs/updates until reactivated.

    logger.info('Admin toggled driver suspension', { adminId, driverId, from: row.status, to: newStatus });
    return { driver: updated, action: newStatus === 'suspended' ? 'suspended' : 'reactivated' };
  }

  // ─── Terminate driver account ─────────────────────────────────────────────────

  async terminateDriverAccount(driverId: string, adminId: string, reason?: string): Promise<unknown> {
    const { data: existing, error } = await supabase
      .from('drivers')
      .select('id, user_id, status')
      .eq('id', driverId)
      .single();

    if (error || !existing) throw new Error('Driver not found');

    const row = existing as Record<string, unknown>;
    if (row.status === 'terminated') throw new Error('ALREADY_TERMINATED');

    const { data: updated, error: updateError } = await supabase
      .from('drivers')
      .update({ status: 'terminated', updated_at: new Date().toISOString() })
      .eq('id', driverId)
      .select('id, user_id, status, updated_at')
      .single();

    if (updateError || !updated) throw new Error('Failed to terminate driver account');

    // Mirror on users table — data preserved, account blocked
    await supabase
      .from('users')
      .update({ status: 'terminated', updated_at: new Date().toISOString() })
      .eq('id', row.user_id as string);

    logger.warn('Admin terminated driver account', { adminId, driverId, previousStatus: row.status, reason: reason ?? 'No reason provided' });
    return updated;
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────────

  private async fetchUsers(userIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const map = new Map<string, Record<string, unknown>>();
    if (!userIds.length) return map;

    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone, avatar_url, status, email_verified')
      .in('id', userIds);

    if (error) { logger.warn('fetchUsers error', { error: error.message }); return map; }

    for (const u of data ?? []) {
      const r = u as Record<string, unknown>;
      map.set(r.id as string, r);
    }
    return map;
  }

  private async getWalletBalance(userId: string): Promise<number> {
    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('transaction_type, amount')
      .eq('user_id', userId)
      .eq('status', 'completed');

    // Credit types — must match payment-service WalletService.getBalance exactly
    const CREDIT_TYPES = new Set(['credit', 'topup', 'refund', 'tip_received', 'earning', 'tip_payment']);
    // Debit types
    const DEBIT_TYPES  = new Set(['debit', 'hold', 'withdrawal', 'payment']);

    let balance = 0;
    for (const tx of txns ?? []) {
      const r   = tx as Record<string, unknown>;
      const amt = parseFloat(String(r.amount ?? 0));
      const type = String(r.transaction_type ?? '');
      if (CREDIT_TYPES.has(type))      balance += amt;
      else if (DEBIT_TYPES.has(type))  balance -= amt;
    }
    return Math.max(0, balance);
  }

  /**
   * GET /api/admin/drivers/:driverId/view-wallet-balance
   * Returns only the wallet balance for a specific driver.
   */
  async getDriverWalletBalance(driverId: string) {
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id, user_id, license_number, status, rating, total_rides, pending_remittance_amount, remittance_blocked')
      .eq('id', driverId)
      .single();

    if (driverError || !driver) return null;

    const row = driver as Record<string, unknown>;
    const userId = row.user_id as string;

    const userMap = await this.fetchUsers([userId]);
    const user = userMap.get(userId) ?? {} as Record<string, unknown>;
    const walletBalance = await this.getWalletBalance(userId);

    return {
      driver_id: row.id,
      user_id: userId,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      license_number: row.license_number,
      driver_status: row.status,
      rating: row.rating,
      total_rides: row.total_rides,
      wallet_balance: walletBalance,
      currency_code: 'NGN',
      formatted_balance: `₦${walletBalance.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      // Remittance info
      pending_remittance_amount: Number(row.pending_remittance_amount ?? 0),
      remittance_blocked: row.remittance_blocked ?? false,
    };
  }
}
