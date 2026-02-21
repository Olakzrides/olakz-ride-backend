import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { SocketService } from '../../../services/socket.service';

interface CourierMatch {
  courierId: string;
  userId: string;
  distance: number;
  estimatedArrival: number;
  rating: number;
  totalDeliveries: number;
  deliveryRating: number;
  vehicleInfo: {
    plateNumber: string;
    manufacturer: string;
    model: string;
    color: string;
  };
}

interface DeliveryMatchingCriteria {
  pickupLatitude: number;
  pickupLongitude: number;
  vehicleTypeId: string;
  regionId: string;
  maxDistance: number;
  maxCouriers: number;
}

/**
 * DeliveryMatchingService
 * Handles automatic courier matching for delivery orders
 * Adapted from RideMatchingService for delivery-specific logic
 */
export class DeliveryMatchingService {
  private socketService: SocketService;
  private readonly MAX_COURIERS_PER_REQUEST = 5;
  private readonly REQUEST_TIMEOUT_SECONDS = 600; // 10 minutes
  private readonly MAX_SEARCH_RADIUS_KM = 15;

  constructor(socketService: SocketService) {
    this.socketService = socketService;
  }

  /**
   * Find and broadcast delivery request to best matching couriers
   */
  async findAndNotifyCouriersForDelivery(
    deliveryId: string,
    criteria: DeliveryMatchingCriteria
  ): Promise<{ success: boolean; couriersNotified: number; batchNumber: number }> {
    try {
      logger.info(`🔍 Starting courier matching for delivery: ${deliveryId}`, {
        criteria,
      });

      // Find available couriers
      const availableCouriers = await this.findAvailableCouriers(criteria);

      logger.info(`📊 Found ${availableCouriers.length} available couriers`, {
        deliveryId,
        couriersFound: availableCouriers.length,
      });

      if (availableCouriers.length === 0) {
        logger.warn(`⚠️ No available couriers found for delivery: ${deliveryId}`, {
          criteria,
        });
        return { success: false, couriersNotified: 0, batchNumber: 0 };
      }

      // Rank couriers by best match
      const rankedCouriers = this.rankCouriersByBestMatch(availableCouriers, criteria);

      logger.info(`📈 Ranked ${rankedCouriers.length} couriers`, {
        deliveryId,
        topCourierDistance: rankedCouriers[0]?.distance,
      });

      // Select top couriers for first batch
      const selectedCouriers = rankedCouriers.slice(0, this.MAX_COURIERS_PER_REQUEST);

      logger.info(`✅ Selected ${selectedCouriers.length} couriers for first batch`, {
        deliveryId,
        courierIds: selectedCouriers.map(c => c.courierId),
      });

      // Create delivery requests in database
      const batchNumber = await this.createDeliveryRequests(deliveryId, selectedCouriers);

      logger.info(`💾 Created delivery requests in database`, {
        deliveryId,
        batchNumber,
        requestCount: selectedCouriers.length,
      });

      // Broadcast to selected couriers via Socket.IO
      await this.broadcastDeliveryRequestToCouriers(deliveryId, selectedCouriers, batchNumber);

      logger.info(`📡 Broadcasted delivery requests via Socket.IO`, {
        deliveryId,
        batchNumber,
      });

      // Set timeout to handle no responses
      this.scheduleRequestTimeout(deliveryId, batchNumber, rankedCouriers);

      logger.info(`⏰ Scheduled timeout for delivery requests`, {
        deliveryId,
        timeoutSeconds: this.REQUEST_TIMEOUT_SECONDS,
      });

      logger.info(`✅ Delivery request sent to ${selectedCouriers.length} couriers for delivery: ${deliveryId}`);

      return {
        success: true,
        couriersNotified: selectedCouriers.length,
        batchNumber,
      };
    } catch (error) {
      logger.error('❌ Error in courier matching:', error);
      return { success: false, couriersNotified: 0, batchNumber: 0 };
    }
  }

  /**
   * Find available couriers based on criteria
   * Filters by service_types to only include couriers who do deliveries
   */
  private async findAvailableCouriers(criteria: DeliveryMatchingCriteria): Promise<CourierMatch[]> {
    const { pickupLatitude, pickupLongitude, regionId, maxDistance } = criteria;

    logger.info(`Searching for couriers with criteria:`, {
      regionId,
      maxDistance,
      pickup: { lat: pickupLatitude, lng: pickupLongitude }
    });

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Get couriers with service_types containing 'delivery'
    // No vehicle type filtering - any vehicle can do deliveries
    const { data: couriersData, error } = await supabase
      .from('drivers')
      .select(`
        id,
        user_id,
        rating,
        total_rides,
        total_deliveries,
        delivery_rating,
        service_types,
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
      .contains('service_types', ['delivery']) // Filter by service_types containing 'delivery'
      .eq('vehicles.is_active', true)
      .eq('availability.is_online', true)
      .eq('availability.is_available', true)
      .gte('availability.last_seen_at', fiveMinutesAgo);

    logger.info(`Query result: Found ${couriersData?.length || 0} couriers, Error: ${error?.message || 'none'}`);
    
    if (error) {
      logger.error('Error fetching available couriers:', error);
      return [];
    }

    if (!couriersData || couriersData.length === 0) {
      logger.warn('No couriers returned from query');
      return [];
    }

    logger.info(`Processing ${couriersData.length} couriers for location matching`);

    // Process couriers and calculate distances
    const courierMatches: CourierMatch[] = [];

    for (const courier of couriersData) {
      // Get latest location
      const locations = courier.location_tracking || [];
      if (locations.length === 0) continue;
      
      // Sort by created_at descending and get the first one
      const latestLocation = locations.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      // Calculate distance from pickup point using Haversine
      const distance = this.calculateDistance(
        pickupLatitude,
        pickupLongitude,
        parseFloat(latestLocation.latitude),
        parseFloat(latestLocation.longitude)
      );

      // Skip if too far
      if (distance > (maxDistance || this.MAX_SEARCH_RADIUS_KM)) continue;

      // Estimate arrival time
      const estimatedArrival = Math.ceil((distance / 30) * 60); // minutes

      const vehicleInfo = courier.vehicles[0];
      
      courierMatches.push({
        courierId: courier.id,
        userId: courier.user_id,
        distance,
        estimatedArrival,
        rating: parseFloat(courier.rating) || 0,
        totalDeliveries: courier.total_deliveries || 0,
        deliveryRating: parseFloat(courier.delivery_rating) || 0,
        vehicleInfo: {
          plateNumber: vehicleInfo.plate_number,
          manufacturer: vehicleInfo.manufacturer,
          model: vehicleInfo.model,
          color: vehicleInfo.color,
        },
      });
    }

    logger.info(`Found ${courierMatches.length} available couriers within ${maxDistance}km`);
    
    // Refine ETAs using Google Maps Distance Matrix API if available
    if (courierMatches.length > 0) {
      await this.refineCourierETAs(courierMatches, { latitude: pickupLatitude, longitude: pickupLongitude });
    }
    
    return courierMatches;
  }

  /**
   * Refine courier ETAs using Google Maps Distance Matrix API
   */
  private async refineCourierETAs(
    couriers: CourierMatch[],
    pickupLocation: { latitude: number; longitude: number }
  ): Promise<void> {
    try {
      const { MapsUtil } = await import('../../../utils/maps.util');
      
      // Get courier locations
      const courierLocations = await Promise.all(
        couriers.map(async (courier) => {
          const { data: location } = await supabase
            .from('driver_location_tracking')
            .select('latitude, longitude')
            .eq('driver_id', courier.courierId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          
          return location ? {
            latitude: parseFloat(location.latitude),
            longitude: parseFloat(location.longitude),
          } : null;
        })
      );

      // Filter out couriers without locations
      const validCouriers = couriers.filter((_, index) => courierLocations[index] !== null);
      const validLocations = courierLocations.filter(loc => loc !== null) as { latitude: number; longitude: number }[];

      if (validLocations.length === 0) return;

      // Get distance matrix from Google Maps
      const distanceMatrix = await MapsUtil.getDistanceMatrix(
        validLocations,
        [pickupLocation]
      );

      // Update courier ETAs with Google Maps data
      validCouriers.forEach((courier, index) => {
        const result = distanceMatrix[index][0];
        courier.distance = result.distance;
        courier.estimatedArrival = result.duration;
      });

      logger.info('Refined courier ETAs using Google Maps Distance Matrix API');
    } catch (error) {
      logger.error('Error refining courier ETAs:', error);
      // Continue with Haversine-based estimates
    }
  }

  /**
   * Rank couriers by best match using scoring algorithm
   */
  private rankCouriersByBestMatch(couriers: CourierMatch[], criteria: DeliveryMatchingCriteria): CourierMatch[] {
    return couriers
      .map(courier => ({
        ...courier,
        score: this.calculateCourierScore(courier, criteria),
      }))
      .sort((a, b) => b.score - a.score) // Higher score = better match
      .map(({ score, ...courier }) => courier); // Remove score from final result
  }

  /**
   * Calculate courier score based on multiple factors
   * Prioritizes delivery experience over ride experience
   */
  private calculateCourierScore(courier: CourierMatch, criteria: DeliveryMatchingCriteria): number {
    let score = 0;

    // Distance factor (closer is better) - 40% weight
    const maxDistance = criteria.maxDistance || this.MAX_SEARCH_RADIUS_KM;
    const distanceScore = Math.max(0, (maxDistance - courier.distance) / maxDistance) * 40;
    score += distanceScore;

    // Delivery rating factor (higher rating is better) - 25% weight
    // Use delivery_rating if available, otherwise fall back to general rating
    const effectiveRating = courier.deliveryRating > 0 ? courier.deliveryRating : courier.rating;
    const ratingScore = (effectiveRating / 5) * 25;
    score += ratingScore;

    // Delivery experience factor (more deliveries is better) - 20% weight
    const experienceScore = Math.min(courier.totalDeliveries / 50, 1) * 20; // Cap at 50 deliveries
    score += experienceScore;

    // Arrival time factor (faster arrival is better) - 15% weight
    const arrivalScore = Math.max(0, (30 - courier.estimatedArrival) / 30) * 15; // Cap at 30 minutes
    score += arrivalScore;

    return score;
  }

  /**
   * Create delivery requests in database
   */
  private async createDeliveryRequests(deliveryId: string, couriers: CourierMatch[]): Promise<number> {
    const batchNumber = Math.floor(Date.now() / 1000) % 1000000000;
    const expiresAt = new Date(Date.now() + this.REQUEST_TIMEOUT_SECONDS * 1000);

    const deliveryRequests = couriers.map(courier => ({
      delivery_id: deliveryId,
      courier_id: courier.courierId,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      batch_number: batchNumber,
      distance_from_pickup: courier.distance,
      estimated_arrival: courier.estimatedArrival,
    }));

    const { error } = await supabase
      .from('delivery_requests')
      .insert(deliveryRequests);

    if (error) {
      logger.error('Error creating delivery requests:', error);
      throw error;
    }

    return batchNumber;
  }

  /**
   * Broadcast delivery request to couriers via Socket.IO
   */
  private async broadcastDeliveryRequestToCouriers(
    deliveryId: string,
    couriers: CourierMatch[],
    batchNumber: number
  ): Promise<void> {
    // Get delivery details
    const { data: delivery, error } = await supabase
      .from('deliveries')
      .select(`
        id,
        customer_id,
        order_number,
        pickup_latitude,
        pickup_longitude,
        pickup_address,
        dropoff_latitude,
        dropoff_longitude,
        dropoff_address,
        estimated_fare,
        distance_km,
        package_description,
        delivery_type,
        scheduled_pickup_at,
        vehicle_type:vehicle_types(name, display_name)
      `)
      .eq('id', deliveryId)
      .single();

    if (error || !delivery) {
      logger.error('Error fetching delivery details:', error);
      return;
    }

    // Get customer details
    const { data: customer } = await supabase
      .from('users')
      .select('first_name, last_name, phone')
      .eq('id', delivery.customer_id)
      .single();

    const courierIds = couriers.map(c => c.courierId);
    
    const deliveryRequestData = {
      deliveryId,
      orderNumber: delivery.order_number,
      batchNumber,
      customer: {
        name: customer ? `${customer.first_name} ${customer.last_name}` : 'Customer',
        phone: customer?.phone,
      },
      pickup: {
        latitude: parseFloat(delivery.pickup_latitude),
        longitude: parseFloat(delivery.pickup_longitude),
        address: delivery.pickup_address,
      },
      dropoff: {
        latitude: parseFloat(delivery.dropoff_latitude),
        longitude: parseFloat(delivery.dropoff_longitude),
        address: delivery.dropoff_address,
      },
      package: {
        description: delivery.package_description,
      },
      fare: {
        estimated: parseFloat(delivery.estimated_fare),
        currency: 'NGN', // TODO: Get from region
      },
      trip: {
        estimatedDistance: delivery.distance_km ? parseFloat(delivery.distance_km) : null,
      },
      deliveryType: delivery.delivery_type,
      scheduledPickupAt: delivery.scheduled_pickup_at,
      vehicleType: (delivery.vehicle_type as any)?.display_name || 'Any Vehicle',
      expiresAt: new Date(Date.now() + this.REQUEST_TIMEOUT_SECONDS * 1000).toISOString(),
      timeout: this.REQUEST_TIMEOUT_SECONDS,
    };

    // Broadcast via Socket.IO
    await this.socketService.broadcastDeliveryRequestToCouriers(
      deliveryId,
      courierIds,
      deliveryRequestData
    );

    logger.info(`Broadcasted delivery request ${deliveryId} to ${couriers.length} couriers`);
  }

  /**
   * Schedule timeout handling for delivery requests
   */
  private scheduleRequestTimeout(
    deliveryId: string,
    batchNumber: number,
    allAvailableCouriers: CourierMatch[]
  ): void {
    setTimeout(async () => {
      await this.handleRequestTimeout(deliveryId, batchNumber, allAvailableCouriers);
    }, this.REQUEST_TIMEOUT_SECONDS * 1000);
  }

  /**
   * Handle timeout when no couriers respond
   */
  private async handleRequestTimeout(
    deliveryId: string,
    batchNumber: number,
    allAvailableCouriers: CourierMatch[]
  ): Promise<void> {
    try {
      // Check if delivery is still searching
      const { data: delivery } = await supabase
        .from('deliveries')
        .select('status')
        .eq('id', deliveryId)
        .single();

      if (!delivery || delivery.status !== 'searching') {
        return; // Delivery was already accepted or cancelled
      }

      // Mark expired requests
      await supabase
        .from('delivery_requests')
        .update({
          status: 'expired',
          responded_at: new Date().toISOString(),
        })
        .eq('delivery_id', deliveryId)
        .eq('batch_number', batchNumber)
        .eq('status', 'pending');

      // Check if there are more couriers to try
      const usedCourierIds = await this.getUsedCourierIds(deliveryId);
      const remainingCouriers = allAvailableCouriers.filter(
        courier => !usedCourierIds.includes(courier.courierId)
      );

      if (remainingCouriers.length > 0) {
        // Send to next batch of couriers
        logger.info(`Timeout reached for delivery ${deliveryId}, trying next batch of ${Math.min(remainingCouriers.length, this.MAX_COURIERS_PER_REQUEST)} couriers`);
        
        const nextBatch = remainingCouriers.slice(0, this.MAX_COURIERS_PER_REQUEST);
        const nextBatchNumber = await this.createDeliveryRequests(deliveryId, nextBatch);
        await this.broadcastDeliveryRequestToCouriers(deliveryId, nextBatch, nextBatchNumber);
        this.scheduleRequestTimeout(deliveryId, nextBatchNumber, allAvailableCouriers);
      } else {
        // No more couriers available
        logger.warn(`No couriers accepted delivery ${deliveryId}, marking as no_couriers_available`);
        
        await supabase
          .from('deliveries')
          .update({
            status: 'no_couriers_available',
            updated_at: new Date().toISOString(),
          })
          .eq('id', deliveryId);

        // Notify customer
        await this.notifyCustomerNoCouriersAvailable(deliveryId);
      }
    } catch (error) {
      logger.error('Error handling request timeout:', error);
    }
  }

  /**
   * Get courier IDs that have already been contacted for this delivery
   */
  private async getUsedCourierIds(deliveryId: string): Promise<string[]> {
    const { data: requests } = await supabase
      .from('delivery_requests')
      .select('courier_id')
      .eq('delivery_id', deliveryId);

    return requests ? requests.map(r => r.courier_id) : [];
  }

  /**
   * Notify customer that no couriers are available
   */
  private async notifyCustomerNoCouriersAvailable(deliveryId: string): Promise<void> {
    const { data: delivery } = await supabase
      .from('deliveries')
      .select('customer_id')
      .eq('id', deliveryId)
      .single();

    if (delivery && this.socketService.isCustomerOnline(delivery.customer_id)) {
      // Notify via Socket.IO
      // this.socketService.notifyCustomer(delivery.customer_id, 'delivery:no_couriers_available', { deliveryId });
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
   * Get delivery matching statistics
   */
  async getDeliveryMatchingStats(deliveryId: string): Promise<any> {
    const { data: requests } = await supabase
      .from('delivery_requests')
      .select('status, batch_number, distance_from_pickup, estimated_arrival, created_at, responded_at')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: true });

    if (!requests) return null;

    const stats = {
      totalCouriersContacted: requests.length,
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
