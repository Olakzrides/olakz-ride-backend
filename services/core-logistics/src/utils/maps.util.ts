import { config } from '../config/env';
import { RouteInfo, Coordinates } from '../types';

/**
 * Mock Maps Service for Phase 1
 * Returns fixed distance and duration estimates
 * Will be replaced with Google Maps API in Phase 3
 */
export class MapsUtil {
  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  static calculateDistance(point1: Coordinates, point2: Coordinates): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(point2.latitude - point1.latitude);
    const dLon = this.toRadians(point2.longitude - point1.longitude);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(point1.latitude)) *
        Math.cos(this.toRadians(point2.latitude)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Get route information between two points
   * Phase 1: Returns mock data
   * Phase 3: Will integrate Google Maps Directions API
   */
  static async getDirections(
    origin: Coordinates,
    destination: Coordinates
  ): Promise<RouteInfo> {
    if (config.mock.useMockMaps) {
      // Use mock data for Phase 1
      const distance = config.mock.mockDistanceKm;
      const duration = config.mock.mockDurationMin;

      return {
        distance,
        duration,
        distanceText: `${distance.toFixed(1)} km`,
        durationText: `${duration} min`,
      };
    }

    // Calculate actual distance using Haversine
    const distance = this.calculateDistance(origin, destination);
    // Estimate duration: assume average speed of 30 km/h in city traffic
    const duration = Math.round((distance / 30) * 60);

    return {
      distance,
      duration,
      distanceText: `${distance.toFixed(1)} km`,
      durationText: `${duration} min`,
    };
  }

  /**
   * Validate coordinates
   */
  static validateCoordinates(latitude: number, longitude: number): boolean {
    return (
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  /**
   * Format coordinates for display
   */
  static formatCoordinates(latitude: number, longitude: number): string {
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
