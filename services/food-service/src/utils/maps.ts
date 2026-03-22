import axios from 'axios';
import config from '../config';
import logger from './logger';

export interface RouteInfo {
  distanceKm: number;
  durationMinutes: number;
  distanceText: string;
  durationText: string;
}

export class MapsUtil {
  /**
   * Haversine formula — straight-line distance in km
   */
  static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 100) / 100;
  }

  /**
   * Get route info — tries Google Maps Directions API, falls back to Haversine
   */
  static async getRouteInfo(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): Promise<RouteInfo> {
    if (config.googleMapsApiKey) {
      try {
        const response = await axios.get(
          'https://maps.googleapis.com/maps/api/directions/json',
          {
            params: {
              origin: `${originLat},${originLng}`,
              destination: `${destLat},${destLng}`,
              mode: 'driving',
              key: config.googleMapsApiKey,
            },
            timeout: 5000,
          }
        );

        if (response.data.status === 'OK') {
          const leg = response.data.routes[0].legs[0];
          const distanceKm = Math.round((leg.distance.value / 1000) * 100) / 100;
          const durationMinutes = Math.round(leg.duration.value / 60);
          return {
            distanceKm,
            durationMinutes,
            distanceText: leg.distance.text,
            durationText: leg.duration.text,
          };
        }
      } catch (err) {
        logger.warn('Google Maps Directions API failed, falling back to Haversine', { err });
      }
    }

    // Fallback
    const distanceKm = this.calculateDistance(originLat, originLng, destLat, destLng);
    const durationMinutes = Math.round((distanceKm / 30) * 60);
    return {
      distanceKm,
      durationMinutes,
      distanceText: `${distanceKm.toFixed(1)} km`,
      durationText: `${durationMinutes} min`,
    };
  }
}
