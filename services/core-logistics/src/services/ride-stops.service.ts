import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { Location } from '../types';
import { MapsUtil } from '../utils/maps.util';

export interface RideStopData {
  stopOrder: number;
  stopType: 'pickup' | 'waypoint' | 'dropoff';
  location: Location;
  notes?: string;
}

export class RideStopsService {
  /**
   * Add a stop to a cart
   */
  async addStopToCart(cartId: string, stopData: RideStopData): Promise<{ success: boolean; stop?: any; error?: string }> {
    try {
      // Verify cart exists
      const { data: cart, error: cartError } = await supabase
        .from('ride_carts')
        .select('id, user_id')
        .eq('id', cartId)
        .single();

      if (cartError || !cart) {
        return { success: false, error: 'Cart not found' };
      }

      // Check max stops limit
      const { count, error: countError } = await supabase
        .from('ride_stops')
        .select('*', { count: 'exact', head: true })
        .eq('cart_id', cartId);

      if (countError) {
        logger.error('Error counting stops:', countError);
        return { success: false, error: 'Failed to count stops' };
      }

      if (count && count >= config.stops.maxStopsPerRide) {
        return { success: false, error: `Maximum ${config.stops.maxStopsPerRide} stops allowed per ride` };
      }

      // Create stop
      const { data: stop, error: insertError } = await supabase
        .from('ride_stops')
        .insert({
          cart_id: cartId,
          stop_order: stopData.stopOrder,
          stop_type: stopData.stopType,
          latitude: stopData.location.latitude,
          longitude: stopData.location.longitude,
          address: stopData.location.address,
          notes: stopData.notes,
        })
        .select()
        .single();

      if (insertError) {
        logger.error('Error adding stop:', insertError);
        return { success: false, error: 'Failed to add stop' };
      }

      logger.info(`Stop added to cart ${cartId}:`, {
        stopId: stop.id,
        stopType: stopData.stopType,
        stopOrder: stopData.stopOrder,
      });

      return { success: true, stop };
    } catch (error) {
      logger.error('Error in addStopToCart:', error);
      return { success: false, error: 'Failed to add stop' };
    }
  }

  /**
   * Get stops for a cart
   */
  async getCartStops(cartId: string): Promise<any[]> {
    try {
      const { data: stops, error } = await supabase
        .from('ride_stops')
        .select('*')
        .eq('cart_id', cartId)
        .order('stop_order', { ascending: true });

      if (error) {
        logger.error('Error fetching cart stops:', error);
        return [];
      }

      return stops || [];
    } catch (error) {
      logger.error('Error in getCartStops:', error);
      return [];
    }
  }

  /**
   * Remove a stop from cart
   */
  async removeStopFromCart(stopId: string, cartId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('ride_stops')
        .delete()
        .eq('id', stopId)
        .eq('cart_id', cartId);

      if (error) {
        logger.error('Error removing stop:', error);
        return { success: false, error: 'Failed to remove stop' };
      }

      logger.info(`Stop ${stopId} removed from cart ${cartId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error in removeStopFromCart:', error);
      return { success: false, error: 'Failed to remove stop' };
    }
  }

  /**
   * Reorder stops in a cart
   */
  async reorderStops(cartId: string, stopOrders: { stopId: string; order: number }[]): Promise<{ success: boolean; error?: string }> {
    try {
      // Update each stop's order
      for (const { stopId, order } of stopOrders) {
        const { error } = await supabase
          .from('ride_stops')
          .update({ stop_order: order, updated_at: new Date().toISOString() })
          .eq('id', stopId)
          .eq('cart_id', cartId);

        if (error) {
          logger.error('Error reordering stop:', error);
          return { success: false, error: 'Failed to reorder stops' };
        }
      }

      logger.info(`Stops reordered for cart ${cartId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error in reorderStops:', error);
      return { success: false, error: 'Failed to reorder stops' };
    }
  }

  /**
   * Calculate fare with multiple stops
   * Base fare + distance fare + (waypoint fee × number of waypoints)
   */
  async calculateFareWithStops(
    pickupLocation: Location,
    dropoffLocation: Location,
    waypoints: Location[],
    baseFare: number,
    pricePerKm: number,
    pricePerMinute: number
  ): Promise<{
    totalFare: number;
    totalDistance: number;
    totalDuration: number;
    waypointFee: number;
    fareBreakdown: any;
  }> {
    try {
      // Build route with all stops
      const allLocations = [pickupLocation, ...waypoints, dropoffLocation];
      
      let totalDistance = 0;
      let totalDuration = 0;

      // Calculate distance and duration for each leg
      for (let i = 0; i < allLocations.length - 1; i++) {
        const origin = allLocations[i];
        const destination = allLocations[i + 1];

        const routeInfo = await MapsUtil.getDirections(
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: destination.latitude, longitude: destination.longitude }
        );

        totalDistance += routeInfo.distance;
        totalDuration += routeInfo.duration;
      }

      // Calculate fare components
      const distanceFare = pricePerKm * totalDistance;
      const timeFare = pricePerMinute * totalDuration;
      const waypointFee = waypoints.length * config.stops.feePerWaypoint;

      const totalFare = Math.round(baseFare + distanceFare + timeFare + waypointFee);

      return {
        totalFare,
        totalDistance,
        totalDuration,
        waypointFee,
        fareBreakdown: {
          baseFare,
          distanceFare,
          timeFare,
          waypointFee,
          waypointCount: waypoints.length,
          feePerWaypoint: config.stops.feePerWaypoint,
        },
      };
    } catch (error) {
      logger.error('Error calculating fare with stops:', error);
      throw error;
    }
  }

  /**
   * Copy stops from cart to ride when ride is created
   */
  async copyStopsToRide(cartId: string, rideId: string): Promise<void> {
    try {
      // Get cart stops
      const { data: cartStops, error: fetchError } = await supabase
        .from('ride_stops')
        .select('*')
        .eq('cart_id', cartId)
        .order('stop_order', { ascending: true });

      if (fetchError || !cartStops || cartStops.length === 0) {
        return; // No stops to copy
      }

      // Create ride stops
      const rideStops = cartStops.map(stop => ({
        ride_id: rideId,
        stop_order: stop.stop_order,
        stop_type: stop.stop_type,
        latitude: stop.latitude,
        longitude: stop.longitude,
        address: stop.address,
        notes: stop.notes,
      }));

      const { error: insertError } = await supabase
        .from('ride_stops')
        .insert(rideStops);

      if (insertError) {
        logger.error('Error copying stops to ride:', insertError);
      } else {
        logger.info(`Copied ${rideStops.length} stops from cart ${cartId} to ride ${rideId}`);
      }
    } catch (error) {
      logger.error('Error in copyStopsToRide:', error);
    }
  }

  /**
   * Get stops for a ride
   */
  async getRideStops(rideId: string): Promise<any[]> {
    try {
      const { data: stops, error } = await supabase
        .from('ride_stops')
        .select('*')
        .eq('ride_id', rideId)
        .order('stop_order', { ascending: true });

      if (error) {
        logger.error('Error fetching ride stops:', error);
        return [];
      }

      return stops || [];
    } catch (error) {
      logger.error('Error in getRideStops:', error);
      return [];
    }
  }

  /**
   * Update stop arrival/departure times
   */
  async updateStopTimes(
    stopId: string,
    arrivalTime?: Date,
    departureTime?: Date
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updateData: any = { updated_at: new Date().toISOString() };
      
      if (arrivalTime) {
        updateData.arrival_time = arrivalTime.toISOString();
      }
      
      if (departureTime) {
        updateData.departure_time = departureTime.toISOString();
        
        // Calculate wait time if both times are set
        if (arrivalTime) {
          const waitTimeMs = departureTime.getTime() - arrivalTime.getTime();
          updateData.wait_time_minutes = Math.round(waitTimeMs / 60000);
        }
      }

      const { error } = await supabase
        .from('ride_stops')
        .update(updateData)
        .eq('id', stopId);

      if (error) {
        logger.error('Error updating stop times:', error);
        return { success: false, error: 'Failed to update stop times' };
      }

      return { success: true };
    } catch (error) {
      logger.error('Error in updateStopTimes:', error);
      return { success: false, error: 'Failed to update stop times' };
    }
  }
}
