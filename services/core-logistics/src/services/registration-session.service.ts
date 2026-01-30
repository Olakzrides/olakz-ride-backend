import { supabase } from '../config/database';

export interface RegistrationSessionData {
  id: string;
  userId: string;
  vehicleType: string;
  serviceTypes: string[];
  status: 'initiated' | 'in_progress' | 'completed' | 'expired' | 'cancelled';
  progressPercentage: number;
  currentStep: 'personal_info' | 'vehicle_details' | 'documents' | 'review' | 'completed';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  personalInfoCompletedAt?: Date;
  vehicleDetailsCompletedAt?: Date;
  documentsCompletedAt?: Date;
  submittedAt?: Date;
  personalInfoData?: any;
  vehicleDetailsData?: any;
  documentsData?: any;
  metadata?: any;
}

export interface CreateSessionRequest {
  userId: string;
  vehicleType: string;
  serviceTypes: string[];
}

export interface UpdateSessionRequest {
  currentStep?: string;
  progressPercentage?: number;
  status?: string;
  personalInfoData?: any;
  vehicleDetailsData?: any;
  documentsData?: any;
  metadata?: any;
}

export class RegistrationSessionService {
  /**
   * Create a new registration session
   */
  async createSession(data: CreateSessionRequest): Promise<RegistrationSessionData> {
    // Check if user already has an active session
    const existingSession = await this.getActiveSessionByUserId(data.userId);
    if (existingSession) {
      throw new Error('User already has an active registration session');
    }

    // Calculate expiry date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const sessionData = {
      user_id: data.userId,
      vehicle_type: data.vehicleType,
      service_types: data.serviceTypes,
      status: 'initiated',
      progress_percentage: 25, // Starting with vehicle selection complete
      current_step: 'personal_info',
      expires_at: expiresAt.toISOString(),
      metadata: {
        created_from: 'driver_registration_flow',
        vehicle_selection_completed: true,
      },
    };

    const { data: session, error } = await supabase
      .from('driver_registration_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create registration session: ${error.message}`);
    }

    return this.mapToSessionData(session);
  }

  /**
   * Get session by ID
   */
  async getSessionById(sessionId: string): Promise<RegistrationSessionData | null> {
    const { data: session, error } = await supabase
      .from('driver_registration_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to get session: ${error.message}`);
    }

    return this.mapToSessionData(session);
  }

  /**
   * Get active session by user ID
   */
  async getActiveSessionByUserId(userId: string): Promise<RegistrationSessionData | null> {
    const { data: session, error } = await supabase
      .from('driver_registration_sessions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['initiated', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to get active session: ${error.message}`);
    }

    return this.mapToSessionData(session);
  }

  /**
   * Update session
   */
  async updateSession(sessionId: string, updates: UpdateSessionRequest): Promise<RegistrationSessionData> {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // Map updates to database fields
    if (updates.currentStep) {
      updateData.current_step = updates.currentStep;
    }
    if (updates.progressPercentage !== undefined) {
      updateData.progress_percentage = updates.progressPercentage;
    }
    if (updates.status) {
      updateData.status = updates.status;
    }
    if (updates.personalInfoData) {
      updateData.personal_info_data = updates.personalInfoData;
      updateData.personal_info_completed_at = new Date().toISOString();
    }
    if (updates.vehicleDetailsData) {
      updateData.vehicle_details_data = updates.vehicleDetailsData;
      updateData.vehicle_details_completed_at = new Date().toISOString();
    }
    if (updates.documentsData) {
      updateData.documents_data = updates.documentsData;
      updateData.documents_completed_at = new Date().toISOString();
    }
    if (updates.metadata) {
      updateData.metadata = updates.metadata;
    }

    const { data: session, error } = await supabase
      .from('driver_registration_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update session: ${error.message}`);
    }

    return this.mapToSessionData(session);
  }

  /**
   * Mark session as completed
   */
  async completeSession(sessionId: string): Promise<RegistrationSessionData> {
    const updateData = {
      status: 'completed',
      current_step: 'completed',
      progress_percentage: 100,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: session, error } = await supabase
      .from('driver_registration_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to complete session: ${error.message}`);
    }

    return this.mapToSessionData(session);
  }

  /**
   * Cancel session
   */
  async cancelSession(sessionId: string, reason?: string): Promise<RegistrationSessionData> {
    const updateData = {
      status: 'cancelled',
      updated_at: new Date().toISOString(),
      metadata: {
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
      },
    };

    const { data: session, error } = await supabase
      .from('driver_registration_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to cancel session: ${error.message}`);
    }

    return this.mapToSessionData(session);
  }

  /**
   * Check if session is expired
   */
  isSessionExpired(session: RegistrationSessionData): boolean {
    return new Date() > new Date(session.expiresAt);
  }

  /**
   * Calculate progress percentage based on completed steps
   */
  calculateProgress(session: RegistrationSessionData): number {
    let progress = 25; // Vehicle selection (always completed when session is created)

    if (session.personalInfoCompletedAt) {
      progress = 50;
    }
    if (session.vehicleDetailsCompletedAt) {
      progress = 75;
    }
    if (session.documentsCompletedAt) {
      progress = 90;
    }
    if (session.submittedAt) {
      progress = 100;
    }

    return progress;
  }

  /**
   * Get next step based on current progress
   */
  getNextStep(session: RegistrationSessionData): string {
    if (!session.personalInfoCompletedAt) {
      return 'personal_info';
    }
    if (!session.vehicleDetailsCompletedAt) {
      return 'vehicle_details';
    }
    if (!session.documentsCompletedAt) {
      return 'documents';
    }
    if (!session.submittedAt) {
      return 'review';
    }
    return 'completed';
  }

  /**
   * Validate step transition
   */
  canTransitionToStep(session: RegistrationSessionData, targetStep: string): boolean {
    const currentProgress = this.calculateProgress(session);
    
    switch (targetStep) {
      case 'personal_info':
        return true; // Always allowed
      case 'vehicle_details':
        return currentProgress >= 50; // Personal info must be completed
      case 'documents':
        return currentProgress >= 75; // Vehicle details must be completed
      case 'review':
        return currentProgress >= 90; // Documents must be completed
      case 'completed':
        return currentProgress >= 100; // All steps completed
      default:
        return false;
    }
  }

  /**
   * Clean up expired sessions (utility method)
   */
  async cleanupExpiredSessions(): Promise<number> {
    const { data, error } = await supabase
      .from('driver_registration_sessions')
      .update({ status: 'expired' })
      .lt('expires_at', new Date().toISOString())
      .in('status', ['initiated', 'in_progress'])
      .select('id');

    if (error) {
      throw new Error(`Failed to cleanup expired sessions: ${error.message}`);
    }

    return data?.length || 0;
  }

  /**
   * Map database record to RegistrationSessionData
   */
  private mapToSessionData(session: any): RegistrationSessionData {
    return {
      id: session.id,
      userId: session.user_id,
      vehicleType: session.vehicle_type,
      serviceTypes: session.service_types,
      status: session.status,
      progressPercentage: session.progress_percentage,
      currentStep: session.current_step,
      expiresAt: new Date(session.expires_at),
      createdAt: new Date(session.created_at),
      updatedAt: new Date(session.updated_at),
      personalInfoCompletedAt: session.personal_info_completed_at 
        ? new Date(session.personal_info_completed_at) 
        : undefined,
      vehicleDetailsCompletedAt: session.vehicle_details_completed_at 
        ? new Date(session.vehicle_details_completed_at) 
        : undefined,
      documentsCompletedAt: session.documents_completed_at 
        ? new Date(session.documents_completed_at) 
        : undefined,
      submittedAt: session.submitted_at 
        ? new Date(session.submitted_at) 
        : undefined,
      personalInfoData: session.personal_info_data,
      vehicleDetailsData: session.vehicle_details_data,
      documentsData: session.documents_data,
      metadata: session.metadata,
    };
  }
}