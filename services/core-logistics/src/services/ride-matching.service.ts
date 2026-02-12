import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { SocketService } from './socket.service';

interface DriverMatch {
  driverId: string;
  userId: string;
  distance: number;
  estimatedArrival: number;
  rating: number;
  totalRides: number;
  vehicleInfo: {
    plateNumber: string;
    manufacturer: string;
    model: string;
    color: string;
  };
}

interface RideMatchingCriteria {
  pickupLatitude: number;
  pickupLongitude: number;
  serviceTierId: string; // Changed from vehicleTypeId to serviceTierId
  maxDistance: number;
  maxDrivers: number;
}

export class RideMatchingService {
  private socketService: SocketService;
  private readonly MAX_DRIVERS_PER_REQUEST = 5;
  private readonly REQUEST_TIMEOUT_SECONDS = 600;
  private readonly MAX_SEARCH_RADIUS_KM = 15;

  constructor(socketService: SocketService) {
    this.socketService = socketService;
  }

  /**
   * Find and broadcast ride request to best matching drivers
   */
  async findAndNotifyDriversForRide(
    rideId: string,
    criteria: RideMatchingCriteria
  ): Promise<{ success: boolean; driversNotified: number; batchNumber: number }> {
    try {
      logger.info(`🔍 Starting driver matching for ride: ${rideId}`, {
        criteria,
      });

      // Find available drivers
      const availableDrivers = await this.findAvailableDrivers(criteria);

      logger.info(`📊 Found ${availableDrivers.length} available drivers`, {
        rideId,
        driversFound: availableDrivers.length,
      });

      if (availableDrivers.length === 0) {
        logger.warn(`⚠️ No available drivers found for ride: ${rideId}`, {
          criteria,
        });
        return { success: false, driversNotified: 0, batchNumber: 0 };
      }

      // Rank drivers by best match
      const rankedDrivers = this.rankDriversByBestMatch(availableDrivers, criteria);

      logger.info(`📈 Ranked ${rankedDrivers.length} drivers`, {
        rideId,
        topDriverDistance: rankedDrivers[0]?.distance,
      });

      // Select top drivers for first batch
      const selectedDrivers = rankedDrivers.slice(0, this.MAX_DRIVERS_PER_REQUEST);

      logger.info(`✅ Selected ${selectedDrivers.length} drivers for first batch`, {
        rideId,
        driverIds: selectedDrivers.map(d => d.driverId),
      });

      // Create ride requests in database
      const batchNumber = await this.createRideRequests(rideId, selectedDrivers);

      logger.info(`💾 Created ride requests in database`, {
        rideId,
        batchNumber,
        requestCount: selectedDrivers.length,
      });

      // Broadcast to selected drivers via Socket.IO
      await this.broadcastRideRequestToDrivers(rideId, selectedDrivers, batchNumber);

      logger.info(`📡 Broadcasted ride requests via Socket.IO`, {
        rideId,
        batchNumber,
      });

      // Set timeout to handle no responses
      this.scheduleRequestTimeout(rideId, batchNumber, rankedDrivers);

      logger.info(`⏰ Scheduled timeout for ride requests`, {
        rideId,
        timeoutSeconds: this.REQUEST_TIMEOUT_SECONDS,
      });

      logger.info(`✅ Ride request sent to ${selectedDrivers.length} drivers for ride: ${rideId}`);

      return {
        success: true,
        driversNotified: selectedDrivers.length,
        batchNumber,
      };
    } catch (error) {
      logger.error('❌ Error in driver matching:', error);
      return { success: false, driversNotified: 0, batchNumber: 0 };
    }
  }

  /**
   * Find available drivers based on criteria
   */
  private async findAvailableDrivers(criteria: RideMatchingCriteria): Promise<DriverMatch[]> {
    const { pickupLatitude, pickupLongitude, serviceTierId, maxDistance } = criteria;

    logger.info(`Searching for drivers with criteria:`, {
      serviceTierId,
      maxDistance,
      pickup: { lat: pickupLatitude, lng: pickupLongitude }
    });

    // DEBUG: Check each condition separately
    logger.info('🔍 DEBUG: Checking driver conditions step by step...');
    
    // Step 1: Check approved drivers
    const { data: approvedDrivers } = await supabase
      .from('drivers')
      .select('id, status, service_tier_id')
      .eq('status', 'approved');
    logger.info(`✅ Step 1: Found ${approvedDrivers?.length || 0} approved drivers`);
    
    // Step 2: Check service tier match
    const { data: tierMatch } = await supabase
      .from('drivers')
      .select('id, service_tier_id')
      .eq('status', 'approved')
      .eq('service_tier_id', serviceTierId);
    logger.info(`✅ Step 2: Found ${tierMatch?.length || 0} drivers with matching service tier`);
    
    // Step 3: Check active vehicles
    const { data: withVehicles } = await supabase
      .from('drivers')
      .select(`
        id,
        vehicles:driver_vehicles!inner(id, is_active)
      `)
      .eq('status', 'approved')
      .eq('service_tier_id', serviceTierId)
      .eq('vehicles.is_active', true);
    logger.info(`✅ Step 3: Found ${withVehicles?.length || 0} drivers with active vehicles`);
    
    // Step 4: Check availability records
    const { data: withAvailability } = await supabase
      .from('drivers')
      .select(`
        id,
        availability:driver_availability!inner(is_online, is_available, last_seen_at)
      `)
      .eq('status', 'approved')
      .eq('service_tier_id', serviceTierId);
    logger.info(`✅ Step 4: Found ${withAvailability?.length || 0} drivers with availability records`);
    
    // Step 5: Check online and available
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: onlineDrivers } = await supabase
      .from('drivers')
      .select(`
        id,
        availability:driver_availability!inner(is_online, is_available, last_seen_at)
      `)
      .eq('status', 'approved')
      .eq('service_tier_id', serviceTierId)
      .eq('availability.is_online', true)
      .eq('availability.is_available', true)
      .gte('availability.last_seen_at', fiveMinutesAgo);
    logger.info(`✅ Step 5: Found ${onlineDrivers?.length || 0} drivers online and available (last 5 min)`);
    
    // Step 6: Check location data
    const { data: withLocation } = await supabase
      .from('driver_location_tracking')
      .select('driver_id, latitude, longitude, created_at')
      .in('driver_id', tierMatch?.map(d => d.id) || []);
    logger.info(`✅ Step 6: Found ${withLocation?.length || 0} location records for these drivers`);

    // Get drivers with latest location and availability
    const { data: driversData, error } = await supabase
      .from('drivers')
      .select(`
        id,
        user_id,
        rating,
        total_rides,
        service_tier_id,
        vehicles:driver_vehicles!inner(
          plate_number,
          manufacturer,
          model,
          color,
          is_active
        ),
        availability:driver_availability!inner(
          is_online,
          is_available,
          last_seen_at
        ),
        location_tracking:driver_location_tracking(
          latitude,
          longitude,
          created_at
        )
      `)
      .eq('status', 'approved')
      .eq('service_tier_id', serviceTierId)
      .eq('vehicles.is_active', true)
      .eq('availability.is_online', true)
      .eq('availability.is_available', true)
      .gte('availability.last_seen_at', fiveMinutesAgo);

    logger.info(`Query result: Found ${driversData?.length || 0} drivers, Error: ${error?.message || 'none'}`);
    
    if (error) {
      logger.error('Error fetching available drivers:', error);
      return [];
    }

    if (!driversData || driversData.length === 0) {
      logger.warn('No drivers returned from query');
      return [];
    }

    logger.info(`Processing ${driversData.length} drivers for location matching`);

    // Process drivers and calculate distances
    const driverMatches: DriverMatch[] = [];

    for (const driver of driversData) {
      // Get latest location - sort manually since we can't order nested relations
      const locations = driver.location_tracking || [];
      if (locations.length === 0) continue;
      
      // Sort by created_at descending and get the first one
      const latestLocation = locations.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      // Calculate distance from pickup point
      const distance = this.calculateDistance(
        pickupLatitude,
        pickupLongitude,
        parseFloat(latestLocation.latitude),
        parseFloat(latestLocation.longitude)
      );

      // Skip if too far
      if (distance > (maxDistance || this.MAX_SEARCH_RADIUS_KM)) continue;

      // TODO: Re-enable Socket.IO check when implementing Phase 2B real-time notifications
      // Check if driver is actually online via Socket.IO
      // if (!this.socketService.isDriverOnline(driver.id)) continue;

      // Estimate arrival time (assuming average speed of 30 km/h in city)
      const estimatedArrival = Math.ceil((distance / 30) * 60); // minutes

      const vehicleInfo = driver.vehicles[0];
      
      driverMatches.push({
        driverId: driver.id,
        userId: driver.user_id,
        distance,
        estimatedArrival,
        rating: parseFloat(driver.rating),
        totalRides: driver.total_rides,
        vehicleInfo: {
          plateNumber: vehicleInfo.plate_number,
          manufacturer: vehicleInfo.manufacturer,
          model: vehicleInfo.model,
          color: vehicleInfo.color,
        },
      });
    }

    logger.info(`Found ${driverMatches.length} available drivers within ${maxDistance}km`);
    return driverMatches;
  }

  /**
   * Rank drivers by best match using scoring algorithm
   */
  private rankDriversByBestMatch(drivers: DriverMatch[], criteria: RideMatchingCriteria): DriverMatch[] {
    return drivers
      .map(driver => ({
        ...driver,
        score: this.calculateDriverScore(driver, criteria),
      }))
      .sort((a, b) => b.score - a.score) // Higher score = better match
      .map(({ score, ...driver }) => driver); // Remove score from final result
  }

  /**
   * Calculate driver score based on multiple factors
   */
  private calculateDriverScore(driver: DriverMatch, criteria: RideMatchingCriteria): number {
    let score = 0;

    // Distance factor (closer is better) - 40% weight
    const maxDistance = criteria.maxDistance || this.MAX_SEARCH_RADIUS_KM;
    const distanceScore = Math.max(0, (maxDistance - driver.distance) / maxDistance) * 40;
    score += distanceScore;

    // Rating factor (higher rating is better) - 30% weight
    const ratingScore = (driver.rating / 5) * 30;
    score += ratingScore;

    // Experience factor (more rides is better) - 20% weight
    const experienceScore = Math.min(driver.totalRides / 100, 1) * 20; // Cap at 100 rides
    score += experienceScore;

    // Arrival time factor (faster arrival is better) - 10% weight
    const arrivalScore = Math.max(0, (30 - driver.estimatedArrival) / 30) * 10; // Cap at 30 minutes
    score += arrivalScore;

    return score;
  }

  /**
   * Create ride requests in database
   */
  private async createRideRequests(rideId: string, drivers: DriverMatch[]): Promise<number> {
    // Use a smaller batch number (seconds since epoch % 1 billion to keep it small)
    const batchNumber = Math.floor(Date.now() / 1000) % 1000000000;
    const expiresAt = new Date(Date.now() + this.REQUEST_TIMEOUT_SECONDS * 1000);

    const rideRequests = drivers.map(driver => ({
      ride_id: rideId,
      driver_id: driver.driverId,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      batch_number: batchNumber,
      distance_from_pickup: driver.distance,
      estimated_arrival: driver.estimatedArrival,
    }));

    const { error } = await supabase
      .from('ride_requests')
      .insert(rideRequests);

    if (error) {
      logger.error('Error creating ride requests:', error);
      throw error;
    }

    return batchNumber;
  }

  /**
   * Broadcast ride request to drivers via Socket.IO
   */
  private async broadcastRideRequestToDrivers(
    rideId: string,
    drivers: DriverMatch[],
    batchNumber: number
  ): Promise<void> {
    // Get ride details
    const { data: ride, error } = await supabase
      .from('rides')
      .select(`
        id,
        user_id,
        pickup_latitude,
        pickup_longitude,
        pickup_address,
        dropoff_latitude,
        dropoff_longitude,
        dropoff_address,
        estimated_fare,
        estimated_distance,
        estimated_duration,
        variant:ride_variants(
          title,
          vehicle_type:vehicle_types(name)
        )
      `)
      .eq('id', rideId)
      .single();

    if (error || !ride) {
      logger.error('Error fetching ride details:', error);
      return;
    }

    // Get customer details
    const { data: customer } = await supabase
      .from('users')
      .select('first_name, last_name, phone')
      .eq('id', ride.user_id)
      .single();

    const driverIds = drivers.map(d => d.driverId);
    
    const rideRequestData = {
      rideId,
      batchNumber,
      customer: {
        name: customer ? `${customer.first_name} ${customer.last_name}` : 'Customer',
        phone: customer?.phone,
      },
      pickup: {
        latitude: parseFloat(ride.pickup_latitude),
        longitude: parseFloat(ride.pickup_longitude),
        address: ride.pickup_address,
      },
      dropoff: ride.dropoff_latitude ? {
        latitude: parseFloat(ride.dropoff_latitude),
        longitude: parseFloat(ride.dropoff_longitude),
        address: ride.dropoff_address,
      } : null,
      fare: {
        estimated: parseFloat(ride.estimated_fare),
        currency: 'NGN', // TODO: Get from region
      },
      trip: {
        estimatedDistance: ride.estimated_distance ? parseFloat(ride.estimated_distance) : null,
        estimatedDuration: ride.estimated_duration,
      },
      vehicleType: (ride.variant as any)?.vehicle_type?.name || 'Standard',
      expiresAt: new Date(Date.now() + this.REQUEST_TIMEOUT_SECONDS * 1000).toISOString(),
      timeout: this.REQUEST_TIMEOUT_SECONDS,
    };

    // Broadcast via Socket.IO
    await this.socketService.broadcastRideRequestToDrivers(
      rideId,
      driverIds,
      rideRequestData
    );

    logger.info(`Broadcasted ride request ${rideId} to ${drivers.length} drivers`);
  }

  /**
   * Schedule timeout handling for ride requests
   */
  private scheduleRequestTimeout(
    rideId: string,
    batchNumber: number,
    allAvailableDrivers: DriverMatch[]
  ): void {
    setTimeout(async () => {
      await this.handleRequestTimeout(rideId, batchNumber, allAvailableDrivers);
    }, this.REQUEST_TIMEOUT_SECONDS * 1000);
  }

  /**
   * Handle timeout when no drivers respond
   */
  private async handleRequestTimeout(
    rideId: string,
    batchNumber: number,
    allAvailableDrivers: DriverMatch[]
  ): Promise<void> {
    try {
      // Check if ride is still searching
      const { data: ride } = await supabase
        .from('rides')
        .select('status')
        .eq('id', rideId)
        .single();

      if (!ride || ride.status !== 'searching') {
        return; // Ride was already accepted or cancelled
      }

      // Mark expired requests
      await supabase
        .from('ride_requests')
        .update({
          status: 'expired',
          responded_at: new Date().toISOString(),
        })
        .eq('ride_id', rideId)
        .eq('batch_number', batchNumber)
        .eq('status', 'pending');

      // Check if there are more drivers to try
      const usedDriverIds = await this.getUsedDriverIds(rideId);
      const remainingDrivers = allAvailableDrivers.filter(
        driver => !usedDriverIds.includes(driver.driverId)
      );

      if (remainingDrivers.length > 0) {
        // Send to next batch of drivers
        logger.info(`Timeout reached for ride ${rideId}, trying next batch of ${Math.min(remainingDrivers.length, this.MAX_DRIVERS_PER_REQUEST)} drivers`);
        
        const nextBatch = remainingDrivers.slice(0, this.MAX_DRIVERS_PER_REQUEST);
        const nextBatchNumber = await this.createRideRequests(rideId, nextBatch);
        await this.broadcastRideRequestToDrivers(rideId, nextBatch, nextBatchNumber);
        this.scheduleRequestTimeout(rideId, nextBatchNumber, allAvailableDrivers);
      } else {
        // No more drivers available
        logger.warn(`No drivers accepted ride ${rideId}, marking as no_drivers_available`);
        
        await supabase
          .from('rides')
          .update({
            status: 'no_drivers_available',
            updated_at: new Date().toISOString(),
          })
          .eq('id', rideId);

        // Notify customer
        await this.notifyCustomerNoDriversAvailable(rideId);
      }
    } catch (error) {
      logger.error('Error handling request timeout:', error);
    }
  }

  /**
   * Get driver IDs that have already been contacted for this ride
   */
  private async getUsedDriverIds(rideId: string): Promise<string[]> {
    const { data: requests } = await supabase
      .from('ride_requests')
      .select('driver_id')
      .eq('ride_id', rideId);

    return requests ? requests.map(r => r.driver_id) : [];
  }

  /**
   * Notify customer that no drivers are available
   */
  private async notifyCustomerNoDriversAvailable(rideId: string): Promise<void> {
    const { data: ride } = await supabase
      .from('rides')
      .select('user_id')
      .eq('id', rideId)
      .single();

    if (ride && this.socketService.isCustomerOnline(ride.user_id)) {
      // Notify via Socket.IO (implementation would depend on your socket service)
      // this.socketService.notifyCustomer(ride.user_id, 'ride:no_drivers_available', { rideId });
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
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
   * Get ride matching statistics
   */
  async getRideMatchingStats(rideId: string): Promise<any> {
    const { data: requests } = await supabase
      .from('ride_requests')
      .select('status, batch_number, distance_from_pickup, estimated_arrival, created_at, responded_at')
      .eq('ride_id', rideId)
      .order('created_at', { ascending: true });

    if (!requests) return null;

    const stats = {
      totalDriversContacted: requests.length,
      batchesUsed: [...new Set(requests.map(r => r.batch_number))].length,
      responses: {
        pending: requests.filter(r => r.status === 'pending').length,
        accepted: requests.filter(r => r.status === 'accepted').length,
        declined: requests.filter(r => r.status === 'declined').length,
        expired: requests.filter(r => r.status === 'expired').length,
      },
      averageDistance: requests.reduce((sum, r) => sum + parseFloat(r.distance_from_pickup), 0) / requests.length,
      averageArrivalTime: requests.reduce((sum, r) => sum + r.estimated_arrival, 0) / requests.length,
    };

    return stats;
  }
}