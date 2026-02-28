import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import axios from 'axios';

interface CourierLocation {
  latitude: number;
  longitude: number;
  heading?: number;
  speed?: number;
  timestamp: string;
}

interface TrackingData {
  delivery: {
    id: string;
    orderNumber: string;
    status: string;
    pickupLocation: {
      latitude: number;
      longitude: number;
      address: string;
    };
    dropoffLocation: {
      latitude: number;
      longitude: number;
      address: string;
    };
  };
  courier?: {
    id: string;
    name: string;
    phone: string;
    rating: number;
    currentLocation?: CourierLocation;
    vehicle?: {
      plateNumber: string;
      make: string;
      model: string;
      color: string;
    };
  };
  eta?: {
    minutes: number;
    distance: number;
    lastUpdated: string;
  };
  route?: any;
}

/**
 * DeliveryTrackingService
 * Handles real-time tracking and ETA calculation for deliveries
 */
export class DeliveryTrackingService {
  private static readonly GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

  /**
   * Get delivery tracking information
   */
  static async getTrackingInfo(deliveryId: string): Promise<TrackingData> {
    try {
      logger.info('Getting tracking info for delivery:', { deliveryId });
      
      // Get delivery details
      const { data: delivery, error: deliveryError } = await supabase
        .from('deliveries')
        .select(`
          id,
          order_number,
          status,
          pickup_latitude,
          pickup_longitude,
          pickup_address,
          dropoff_latitude,
          dropoff_longitude,
          dropoff_address,
          courier_id
        `)
        .eq('id', deliveryId)
        .single();

      logger.info('Delivery query result:', { delivery, deliveryError });

      if (deliveryError || !delivery) {
        throw new Error('Delivery not found');
      }

      const trackingData: TrackingData = {
        delivery: {
          id: delivery.id,
          orderNumber: delivery.order_number,
          status: delivery.status,
          pickupLocation: {
            latitude: parseFloat(delivery.pickup_latitude),
            longitude: parseFloat(delivery.pickup_longitude),
            address: delivery.pickup_address,
          },
          dropoffLocation: {
            latitude: parseFloat(delivery.dropoff_latitude),
            longitude: parseFloat(delivery.dropoff_longitude),
            address: delivery.dropoff_address,
          },
        },
      };

      // If courier is assigned, get courier details and location
      if (delivery.courier_id) {
        const courierData = await this.getCourierTrackingData(delivery.courier_id);
        
        if (courierData) {
          trackingData.courier = courierData;

          // Calculate ETA if courier has current location
          if (courierData.currentLocation) {
            const eta = await this.calculateETA(
              courierData.currentLocation.latitude,
              courierData.currentLocation.longitude,
              delivery.status === 'picked_up' || delivery.status === 'in_transit' || delivery.status === 'arrived_delivery'
                ? parseFloat(delivery.dropoff_latitude)
                : parseFloat(delivery.pickup_latitude),
              delivery.status === 'picked_up' || delivery.status === 'in_transit' || delivery.status === 'arrived_delivery'
                ? parseFloat(delivery.dropoff_longitude)
                : parseFloat(delivery.pickup_longitude)
            );

            trackingData.eta = eta;
          }
        }
      }

      return trackingData;
    } catch (error: any) {
      logger.error('Get tracking info error:', error);
      throw error;
    }
  }

  /**
   * Get courier tracking data
   */
  private static async getCourierTrackingData(courierId: string): Promise<{
    id: string;
    name: string;
    phone: string;
    rating: number;
    currentLocation?: CourierLocation;
    vehicle?: {
      plateNumber: string;
      make: string;
      model: string;
      color: string;
    };
  } | null> {
    try {
      logger.info('Getting courier tracking data for courier:', { courierId });
      
      // Get courier details
      const { data: courier, error: courierError } = await supabase
        .from('drivers')
        .select('id, user_id, delivery_rating')
        .eq('id', courierId)
        .single();

      logger.info('Courier query result:', { courier, courierError });

      if (courierError || !courier) {
        logger.error('Failed to get courier details:', courierError);
        return null;
      }

      // Get user details separately
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('first_name, last_name, phone')
        .eq('id', courier.user_id)
        .single();

      logger.info('User query result:', { user, userError });

      if (userError || !user) {
        logger.error('Failed to get user details:', userError);
        return null;
      }

      // Get courier's current location
      const { data: location } = await supabase
        .from('driver_locations')
        .select('latitude, longitude, heading, speed, created_at')
        .eq('driver_id', courierId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      logger.info('Courier location query result:', { location, courierId });

      // Get courier's vehicle
      logger.info('Querying driver_vehicles table:', { 
        courierId, 
        query: 'SELECT plate_number, manufacturer, model, color FROM driver_vehicles WHERE driver_id = ? AND is_active = true' 
      });
      
      const { data: vehicle, error: vehicleError } = await supabase
        .from('driver_vehicles')
        .select('plate_number, manufacturer, model, color')
        .eq('driver_id', courierId)
        .eq('is_active', true)
        .single();

      logger.info('Courier vehicle query result:', { 
        vehicle, 
        vehicleError,
        courierId,
        hasVehicle: !!vehicle,
        vehicleDetails: vehicle ? {
          plateNumber: vehicle.plate_number,
          manufacturer: vehicle.manufacturer,
          model: vehicle.model,
          color: vehicle.color
        } : null
      });

      const result = {
        id: courier.id,
        name: `${user.first_name} ${user.last_name}`,
        phone: user.phone,
        rating: parseFloat(courier.delivery_rating) || 0,
        currentLocation: location ? {
          latitude: parseFloat(location.latitude),
          longitude: parseFloat(location.longitude),
          heading: location.heading,
          speed: location.speed,
          timestamp: location.created_at,
        } : undefined,
        vehicle: vehicle ? {
          plateNumber: vehicle.plate_number,
          make: vehicle.manufacturer,
          model: vehicle.model,
          color: vehicle.color,
        } : undefined,
      };

      logger.info('Final courier tracking data:', result);
      
      return result;
    } catch (error: any) {
      logger.error('Get courier tracking data error:', error);
      return null;
    }
  }

  /**
   * Calculate ETA using Google Maps Distance Matrix API
   */
  private static async calculateETA(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): Promise<{
    minutes: number;
    distance: number;
    lastUpdated: string;
  }> {
    try {
      if (!this.GOOGLE_MAPS_API_KEY) {
        // Fallback to Haversine calculation if no API key
        return this.calculateETAHaversine(fromLat, fromLng, toLat, toLng);
      }

      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
        {
          params: {
            origins: `${fromLat},${fromLng}`,
            destinations: `${toLat},${toLng}`,
            mode: 'driving',
            departure_time: 'now',
            traffic_model: 'best_guess',
            key: this.GOOGLE_MAPS_API_KEY,
          },
          timeout: 5000,
        }
      );

      if (
        response.data.status === 'OK' &&
        response.data.rows[0]?.elements[0]?.status === 'OK'
      ) {
        const element = response.data.rows[0].elements[0];
        const durationInSeconds = element.duration_in_traffic?.value || element.duration.value;
        const distanceInMeters = element.distance.value;

        return {
          minutes: Math.ceil(durationInSeconds / 60),
          distance: parseFloat((distanceInMeters / 1000).toFixed(2)),
          lastUpdated: new Date().toISOString(),
        };
      }

      // Fallback to Haversine if API fails
      return this.calculateETAHaversine(fromLat, fromLng, toLat, toLng);
    } catch (error: any) {
      logger.error('Calculate ETA error:', error);
      // Fallback to Haversine calculation
      return this.calculateETAHaversine(fromLat, fromLng, toLat, toLng);
    }
  }

  /**
   * Calculate ETA using Haversine formula (fallback)
   */
  private static calculateETAHaversine(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
  ): {
    minutes: number;
    distance: number;
    lastUpdated: string;
  } {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(toLat - fromLat);
    const dLon = this.toRad(toLng - fromLng);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(fromLat)) *
        Math.cos(this.toRad(toLat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Assume average speed of 30 km/h in city traffic
    const averageSpeed = 30;
    const minutes = Math.ceil((distance / averageSpeed) * 60);

    return {
      minutes,
      distance: parseFloat(distance.toFixed(2)),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Convert degrees to radians
   */
  private static toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Update courier location (called by courier app every 10 seconds)
   */
  static async updateCourierLocation(
    courierId: string,
    location: {
      latitude: number;
      longitude: number;
      heading?: number;
      speed?: number;
    }
  ): Promise<void> {
    try {
      // Insert new location record (driver_locations table doesn't have updated_at, only created_at)
      const { error } = await supabase
        .from('driver_locations')
        .insert({
          driver_id: courierId,
          latitude: location.latitude,
          longitude: location.longitude,
          heading: location.heading,
          speed: location.speed,
          created_at: new Date().toISOString(),
        });

      if (error) {
        logger.error('Update courier location error:', error);
        throw new Error('Failed to update location');
      }

      // Broadcast location update via WebSocket
      const { socketService } = await import('../../../index');
      if (socketService) {
        // Get active delivery for this courier
        const { data: delivery } = await supabase
          .from('deliveries')
          .select('id, customer_id, status')
          .eq('courier_id', courierId)
          .in('status', ['assigned', 'arrived_pickup', 'picked_up', 'in_transit', 'arrived_delivery'])
          .single();

        if (delivery) {
          // Broadcast to customer
          const customerSocketId = socketService['customerSockets'].get(delivery.customer_id);
          if (customerSocketId) {
            socketService['io'].to(customerSocketId).emit('delivery:location:updated', {
              deliveryId: delivery.id,
              location: {
                latitude: location.latitude,
                longitude: location.longitude,
                heading: location.heading,
                speed: location.speed,
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      }
    } catch (error: any) {
      logger.error('Update courier location error:', error);
      throw error;
    }
  }
}
