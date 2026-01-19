import { supabase } from '../config/database';
import {
  DriverRegistrationRequest,
  DriverProfileUpdateRequest,
  DriverVehicleRequest,
  DriverStatusUpdateRequest,
  DriverLocationUpdateRequest,
  DriverApprovalRequest,
  DocumentVerificationRequest,
  NearbyDriversQuery,
  DriverWithDetails,
} from '../types';
import { StorageUtil } from '../utils/storage.util';

export class DriverService {
  /**
   * Register a new driver
   */
  async registerDriver(userId: string, data: DriverRegistrationRequest): Promise<any> {
    // Check if user already has a driver profile
    const { data: existingDriver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (existingDriver) {
      throw new Error('Driver profile already exists for this user');
    }

    // Check if identification number is already registered
    const { data: existingId } = await supabase
      .from('drivers')
      .select('id')
      .eq('identification_number', data.identificationNumber)
      .single();

    if (existingId) {
      throw new Error('Identification number is already registered');
    }

    // Check if license number is provided and already registered
    if (data.licenseNumber) {
      const { data: existingLicense } = await supabase
        .from('drivers')
        .select('id')
        .eq('license_number', data.licenseNumber)
        .single();

      if (existingLicense) {
        throw new Error('License number is already registered');
      }
    }

    // Check if plate number is already registered
    const { data: existingPlate } = await supabase
      .from('driver_vehicles')
      .select('id')
      .eq('plate_number', data.vehicle.plateNumber)
      .single();

    if (existingPlate) {
      throw new Error('Vehicle plate number is already registered');
    }

    // Create driver profile
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .insert({
        user_id: userId,
        identification_type: data.identificationType,
        identification_number: data.identificationNumber,
        license_number: data.licenseNumber || null,
        vehicle_type_id: data.vehicleTypeId,
        status: 'pending',
      })
      .select()
      .single();

    if (driverError) {
      throw new Error(`Failed to create driver profile: ${driverError.message}`);
    }

    // Create driver vehicle
    const { data: vehicle, error: vehicleError } = await supabase
      .from('driver_vehicles')
      .insert({
        driver_id: driver.id,
        vehicle_type_id: data.vehicleTypeId,
        plate_number: data.vehicle.plateNumber,
        manufacturer: data.vehicle.manufacturer,
        model: data.vehicle.model,
        year: data.vehicle.year,
        color: data.vehicle.color,
        is_active: true,
      })
      .select()
      .single();

    if (vehicleError) {
      // Rollback driver creation
      await supabase.from('drivers').delete().eq('id', driver.id);
      throw new Error(`Failed to create driver vehicle: ${vehicleError.message}`);
    }

    // Create driver availability record
    const { error: availabilityError } = await supabase
      .from('driver_availability')
      .insert({
        driver_id: driver.id,
        is_online: false,
        is_available: false,
      });

    if (availabilityError) {
      console.error('Failed to create driver availability:', availabilityError);
    }

    // Add 'driver' role to user in auth service
    try {
      await this.addDriverRoleToUser(userId);
    } catch (error) {
      console.error('Failed to add driver role to user:', error);
      // Don't fail registration if role update fails
      // Admin can manually fix this
    }

    return {
      driver,
      vehicle,
    };
  }

  /**
   * Add driver role to user via auth service
   */
  private async addDriverRoleToUser(userId: string): Promise<void> {
    // Get current user to check roles
    const { data: user } = await supabase
      .from('users')
      .select('roles')
      .eq('id', userId)
      .single();

    if (!user) {
      throw new Error('User not found');
    }

    // Check if user already has driver role
    if (user.roles && user.roles.includes('driver')) {
      console.log(`User ${userId} already has driver role`);
      return;
    }

    // Add driver role
    const updatedRoles = [...(user.roles || ['customer']), 'driver'];
    
    const { error } = await supabase
      .from('users')
      .update({
        roles: updatedRoles,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to add driver role: ${error.message}`);
    }

    console.log(`Driver role added to user ${userId}`);
  }

  /**
   * Get driver profile with all details
   */
  async getDriverProfile(userId: string): Promise<DriverWithDetails | null> {
    const { data: driver, error } = await supabase
      .from('drivers')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name, description, capacity),
        vehicles:driver_vehicles(*),
        documents:driver_documents(*),
        availability:driver_availability(*)
      `)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch driver profile: ${error.message}`);
    }

    return driver as any;
  }

  /**
   * Get driver by ID
   */
  async getDriverById(driverId: string): Promise<DriverWithDetails | null> {
    const { data: driver, error } = await supabase
      .from('drivers')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name, description, capacity),
        vehicles:driver_vehicles(*),
        documents:driver_documents(*),
        availability:driver_availability(*)
      `)
      .eq('id', driverId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch driver: ${error.message}`);
    }

    return driver as any;
  }

  /**
   * Update driver profile
   */
  async updateDriverProfile(
    userId: string,
    data: DriverProfileUpdateRequest
  ): Promise<any> {
    const { data: driver, error } = await supabase
      .from('drivers')
      .update(data)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update driver profile: ${error.message}`);
    }

    return driver;
  }

  /**
   * Add or update driver vehicle
   */
  async upsertDriverVehicle(userId: string, vehicleData: DriverVehicleRequest): Promise<any> {
    // Get driver ID
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!driver) {
      throw new Error('Driver profile not found');
    }

    // Check if plate number exists for another driver
    const { data: existingPlate } = await supabase
      .from('driver_vehicles')
      .select('id, driver_id')
      .eq('plate_number', vehicleData.plateNumber)
      .single();

    if (existingPlate && existingPlate.driver_id !== driver.id) {
      throw new Error('Vehicle plate number is already registered to another driver');
    }

    // Deactivate all existing vehicles for this driver
    await supabase
      .from('driver_vehicles')
      .update({ is_active: false })
      .eq('driver_id', driver.id);

    // Insert or update vehicle
    const { data: vehicle, error } = await supabase
      .from('driver_vehicles')
      .upsert({
        driver_id: driver.id,
        vehicle_type_id: vehicleData.vehicleTypeId,
        plate_number: vehicleData.plateNumber,
        manufacturer: vehicleData.manufacturer,
        model: vehicleData.model,
        year: vehicleData.year,
        color: vehicleData.color,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update driver vehicle: ${error.message}`);
    }

    return vehicle;
  }

  /**
   * Upload driver document
   */
  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    documentType: string,
    expiryDate?: Date
  ): Promise<any> {
    // Get driver ID
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!driver) {
      throw new Error('Driver profile not found');
    }

    // Initialize storage bucket if it doesn't exist
    await StorageUtil.initializeBucket();

    // Validate file
    const validation = StorageUtil.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Upload file to Supabase Storage
    const { url, path } = await StorageUtil.uploadFile(file, `drivers/${driver.id}/${documentType}`);

    // Save document metadata to database
    const { data: document, error } = await supabase
      .from('driver_documents')
      .insert({
        driver_id: driver.id,
        document_type: documentType,
        document_url: url,
        file_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        status: 'pending',
        expiry_date: expiryDate,
      })
      .select()
      .single();

    if (error) {
      // Cleanup uploaded file
      await StorageUtil.deleteFile(path);
      throw new Error(`Failed to save document metadata: ${error.message}`);
    }

    return document;
  }

  /**
   * Update driver online/offline status
   */
  async updateDriverStatus(userId: string, statusData: DriverStatusUpdateRequest): Promise<any> {
    // Get driver
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, status')
      .eq('user_id', userId)
      .single();

    if (!driver) {
      throw new Error('Driver profile not found');
    }

    // Check if driver is approved
    if (driver.status !== 'approved') {
      throw new Error('Driver must be approved before going online');
    }

    // Update availability
    const { data: availability, error } = await supabase
      .from('driver_availability')
      .update({
        is_online: statusData.isOnline,
        is_available: statusData.isAvailable ?? statusData.isOnline,
        last_seen_at: new Date().toISOString(),
      })
      .eq('driver_id', driver.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update driver status: ${error.message}`);
    }

    return availability;
  }

  /**
   * Update driver location
   */
  async updateDriverLocation(
    userId: string,
    locationData: DriverLocationUpdateRequest
  ): Promise<any> {
    // Get driver
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!driver) {
      throw new Error('Driver profile not found');
    }

    // Insert location record
    const { data: location, error } = await supabase
      .from('driver_locations')
      .insert({
        driver_id: driver.id,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        heading: locationData.heading,
        speed: locationData.speed,
        accuracy: locationData.accuracy,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update driver location: ${error.message}`);
    }

    // Update last seen timestamp
    await supabase
      .from('driver_availability')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('driver_id', driver.id);

    return location;
  }

  /**
   * Get driver's current location
   */
  async getDriverLocation(driverId: string): Promise<any> {
    const { data: location, error } = await supabase
      .from('driver_locations')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch driver location: ${error.message}`);
    }

    return location;
  }

  /**
   * Find nearby available drivers
   */
  async findNearbyDrivers(query: NearbyDriversQuery): Promise<any[]> {
    const radiusKm = query.radiusKm || 10;
    const limit = query.limit || 20;

    // Build query
    let dbQuery = supabase
      .from('drivers')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name, capacity),
        availability:driver_availability!inner(is_online, is_available, last_seen_at),
        location:driver_locations(latitude, longitude, heading, created_at)
      `)
      .eq('status', 'approved')
      .eq('availability.is_online', true)
      .eq('availability.is_available', true);

    // Filter by vehicle type if specified
    if (query.vehicleTypeId) {
      dbQuery = dbQuery.eq('vehicle_type_id', query.vehicleTypeId);
    }

    const { data: drivers, error } = await dbQuery;

    if (error) {
      throw new Error(`Failed to fetch nearby drivers: ${error.message}`);
    }

    if (!drivers || drivers.length === 0) {
      return [];
    }

    // Calculate distances and filter by radius
    const driversWithDistance = drivers
      .map((driver: any) => {
        const location = driver.location?.[0];
        if (!location) return null;

        const distance = this.calculateDistance(
          query.latitude,
          query.longitude,
          parseFloat(location.latitude),
          parseFloat(location.longitude)
        );

        if (distance > radiusKm) return null;

        return {
          ...driver,
          distance,
          currentLocation: location,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.distance - b.distance)
      .slice(0, limit);

    return driversWithDistance;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Approve or reject driver (Admin only)
   */
  async approveDriver(driverId: string, approvalData: DriverApprovalRequest, adminUserId: string): Promise<any> {
    const updateData: any = {
      status: approvalData.status,
      approved_by: adminUserId,
      approved_at: new Date().toISOString(),
    };

    if (approvalData.status === 'rejected' && approvalData.rejectionReason) {
      updateData.rejection_reason = approvalData.rejectionReason;
    }

    const { data: driver, error } = await supabase
      .from('drivers')
      .update(updateData)
      .eq('id', driverId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update driver approval status: ${error.message}`);
    }

    return driver;
  }

  /**
   * Verify driver document (Admin only)
   */
  async verifyDocument(
    documentId: string,
    verificationData: DocumentVerificationRequest,
    adminUserId: string
  ): Promise<any> {
    const { data: document, error } = await supabase
      .from('driver_documents')
      .update({
        status: verificationData.status,
        verified_by: adminUserId,
        verified_at: new Date().toISOString(),
        notes: verificationData.notes,
      })
      .eq('id', documentId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to verify document: ${error.message}`);
    }

    return document;
  }

  /**
   * Get all drivers (Admin only)
   */
  async getAllDrivers(filters?: {
    status?: string;
    vehicleTypeId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ drivers: any[]; total: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('drivers')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name),
        vehicles:driver_vehicles(*),
        availability:driver_availability(*)
      `, { count: 'exact' });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.vehicleTypeId) {
      query = query.eq('vehicle_type_id', filters.vehicleTypeId);
    }

    const { data: drivers, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch drivers: ${error.message}`);
    }

    return {
      drivers: drivers || [],
      total: count || 0,
    };
  }
}
