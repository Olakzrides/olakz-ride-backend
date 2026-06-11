import { config } from '../config/env';
import { RouteInfo, Coordinates } from '../types';
import { logger } from '../config/logger';
import axios from 'axios';

/**
 * Maps Service with Google Maps API Integration
 * Supports real Google Maps APIs with fallback to mock/calculated data
 */
export class MapsUtil {
  private static readonly GOOGLE_MAPS_BASE_URL = 'https://maps.googleapis.com/maps/api';
  
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
   * Get route information between two points using Google Maps Directions API
   * Falls back to calculated data if API fails or mock mode is enabled
   */
  static async getDirections(
    origin: Coordinates,
    destination: Coordinates
  ): Promise<RouteInfo> {
    // Use mock data if enabled
    if (config.mock.useMockMaps) {
      logger.info('Using mock maps data');
      return this.getMockDirections();
    }

    // Try Google Maps API if key is available
    if (config.googleMapsApiKey) {
      try {
        return await this.getGoogleDirections(origin, destination);
      } catch (error) {
        logger.error('Google Maps API error, falling back to calculated data:', error);
        return this.getCalculatedDirections(origin, destination);
      }
    }

    // Fallback to calculated data
    logger.warn('No Google Maps API key, using calculated data');
    return this.getCalculatedDirections(origin, destination);
  }

  /**
   * Get directions from Google Maps Directions API
   */
  private static async getGoogleDirections(
    origin: Coordinates,
    destination: Coordinates
  ): Promise<RouteInfo> {
    const url = `${this.GOOGLE_MAPS_BASE_URL}/directions/json`;
    
    const params = {
      origin: `${origin.latitude},${origin.longitude}`,
      destination: `${destination.latitude},${destination.longitude}`,
      mode: 'driving',
      key: config.googleMapsApiKey,
    };

    logger.info('Fetching Google Maps directions', { origin, destination });

    const response = await axios.get(url, { params, timeout: 5000 });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${response.data.status}`);
    }

    const route = response.data.routes[0];
    const leg = route.legs[0];

    // Distance in meters, convert to km
    const distance = Math.round((leg.distance.value / 1000) * 100) / 100;
    // Duration in seconds, convert to minutes
    const duration = Math.round(leg.duration.value / 60);

    logger.info('Google Maps directions fetched successfully', {
      distance,
      duration,
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
    });

    return {
      distance,
      duration,
      distanceText: leg.distance.text,
      durationText: leg.duration.text,
      polyline: route.overview_polyline?.points,
    };
  }

  /**
   * Get calculated directions using Haversine formula
   * Used as fallback when Google Maps API is unavailable
   */
  private static getCalculatedDirections(
    origin: Coordinates,
    destination: Coordinates
  ): RouteInfo {
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
   * Get mock directions for testing
   */
  private static getMockDirections(): RouteInfo {
    const distance = config.mock.mockDistanceKm;
    const duration = config.mock.mockDurationMin;

    return {
      distance,
      duration,
      distanceText: `${distance.toFixed(1)} km`,
      durationText: `${duration} min`,
    };
  }

  /**
   * Get distance and duration using Google Maps Distance Matrix API
   * More efficient for multiple origin-destination pairs
   */
  static async getDistanceMatrix(
    origins: Coordinates[],
    destinations: Coordinates[]
  ): Promise<{ distance: number; duration: number }[][]> {
    // Use mock data if enabled
    if (config.mock.useMockMaps) {
      return origins.map(() =>
        destinations.map(() => ({
          distance: config.mock.mockDistanceKm,
          duration: config.mock.mockDurationMin,
        }))
      );
    }

    // Try Google Maps API if key is available
    if (config.googleMapsApiKey) {
      try {
        const url = `${this.GOOGLE_MAPS_BASE_URL}/distancematrix/json`;
        
        const params = {
          origins: origins.map(o => `${o.latitude},${o.longitude}`).join('|'),
          destinations: destinations.map(d => `${d.latitude},${d.longitude}`).join('|'),
          mode: 'driving',
          key: config.googleMapsApiKey,
        };

        const response = await axios.get(url, { params, timeout: 5000 });

        if (response.data.status !== 'OK') {
          throw new Error(`Google Maps API error: ${response.data.status}`);
        }

        return response.data.rows.map((row: any) =>
          row.elements.map((element: any) => ({
            distance: Math.round((element.distance.value / 1000) * 100) / 100,
            duration: Math.round(element.duration.value / 60),
          }))
        );
      } catch (error) {
        logger.error('Distance Matrix API error, falling back to calculated data:', error);
      }
    }

    // Fallback to calculated distances
    return origins.map(origin =>
      destinations.map(destination => {
        const distance = this.calculateDistance(origin, destination);
        const duration = Math.round((distance / 30) * 60);
        return { distance, duration };
      })
    );
  }

  /**
   * Geocode an address to coordinates using Google Maps Geocoding API
   */
  static async geocodeAddress(address: string): Promise<Coordinates | null> {
    // Try Google Maps API if key is available
    if (config.googleMapsApiKey) {
      try {
        const url = `${this.GOOGLE_MAPS_BASE_URL}/geocode/json`;
        
        const params = {
          address,
          key: config.googleMapsApiKey,
        };

        const response = await axios.get(url, { params, timeout: 5000 });

        if (response.data.status !== 'OK') {
          logger.warn(`Geocoding failed: ${response.data.status}`);
          return null;
        }

        const location = response.data.results[0].geometry.location;
        return {
          latitude: location.lat,
          longitude: location.lng,
        };
      } catch (error) {
        logger.error('Geocoding API error:', error);
        return null;
      }
    }

    logger.warn('No Google Maps API key for geocoding');
    return null;
  }

  /**
   * Reverse geocode coordinates to address using Google Maps Geocoding API
   */
  static async reverseGeocode(coordinates: Coordinates): Promise<string | null> {
    // Try Google Maps API if key is available
    if (config.googleMapsApiKey) {
      try {
        const url = `${this.GOOGLE_MAPS_BASE_URL}/geocode/json`;
        
        const params = {
          latlng: `${coordinates.latitude},${coordinates.longitude}`,
          key: config.googleMapsApiKey,
        };

        const response = await axios.get(url, { params, timeout: 5000 });

        if (response.data.status !== 'OK') {
          logger.warn(`Reverse geocoding failed: ${response.data.status}`);
          return null;
        }

        return response.data.results[0].formatted_address;
      } catch (error) {
        logger.error('Reverse geocoding API error:', error);
        return null;
      }
    }

    logger.warn('No Google Maps API key for reverse geocoding');
    return null;
  }

  /**
   * Extract the Nigerian state name from coordinates using Google Maps reverse geocoding.
   * Parses the address_components for administrative_area_level_1 (state).
   * Returns null if the location is outside Nigeria or the API is unavailable.
   *
   * Examples:
   *   Lagos Island coords  → "Lagos"
   *   Abuja coords         → "FCT"
   *   Port Harcourt coords → "Rivers"
   */
  static async getStateFromCoordinates(coordinates: Coordinates): Promise<string | null> {
    if (!config.googleMapsApiKey) {
      logger.warn('No Google Maps API key — cannot resolve state from coordinates');
      return null;
    }

    try {
      const url = `${this.GOOGLE_MAPS_BASE_URL}/geocode/json`;
      const params = {
        latlng: `${coordinates.latitude},${coordinates.longitude}`,
        result_type: 'administrative_area_level_1',
        key: config.googleMapsApiKey,
      };

      const response = await axios.get(url, { params, timeout: 5000 });

      if (response.data.status !== 'OK' || !response.data.results?.length) {
        // Fallback: try without result_type filter and parse components
        const fallbackParams = {
          latlng: `${coordinates.latitude},${coordinates.longitude}`,
          key: config.googleMapsApiKey,
        };
        const fallbackResponse = await axios.get(url, { params: fallbackParams, timeout: 5000 });

        if (fallbackResponse.data.status !== 'OK' || !fallbackResponse.data.results?.length) {
          logger.warn('Reverse geocoding returned no results', { coordinates });
          return null;
        }

        return this.extractStateFromComponents(fallbackResponse.data.results);
      }

      return this.extractStateFromComponents(response.data.results);
    } catch (error) {
      logger.error('getStateFromCoordinates error:', error);
      return null;
    }
  }

  /**
   * Parse Google Maps address_components to extract the state (administrative_area_level_1).
   * Normalises "Federal Capital Territory" → "FCT" to match our Nigerian states list.
   */
  private static extractStateFromComponents(results: any[]): string | null {
    for (const result of results) {
      const components: any[] = result.address_components ?? [];
      const stateComponent = components.find((c: any) =>
        c.types?.includes('administrative_area_level_1')
      );
      if (stateComponent) {
        const raw: string = stateComponent.long_name ?? stateComponent.short_name ?? '';
        if (/federal capital territory/i.test(raw) || /abuja/i.test(raw)) return 'FCT';
        return raw.replace(/\s+state$/i, '').trim() || null;
      }
    }
    return null;
  }

  /**
   * Resolve Nigerian state from coordinates AND/OR address string.
   *
   * Strategy (in order):
   *   1. Try Google Maps reverse geocoding (most accurate, skipped if no key or mock mode)
   *   2. Fall back to parsing the address string for known state/city names
   *   3. Return null if neither works (fare service will default to 'low' tier)
   */
  static async resolveNigerianState(
    coordinates: Coordinates,
    addressHint?: string
  ): Promise<string | null> {
    // 1. Try Google Maps (skip if mock mode or no key)
    if (config.googleMapsApiKey && !config.mock.useMockMaps) {
      try {
        const stateFromCoords = await this.getStateFromCoordinates(coordinates);
        if (stateFromCoords) {
          logger.info('State resolved from coordinates', { state: stateFromCoords });
          return stateFromCoords;
        }
      } catch (err) {
        logger.warn('Google Maps state resolution failed, trying address fallback', { err });
      }
    }

    // 2. Parse address string
    if (addressHint) {
      const stateFromAddress = this.extractStateFromAddress(addressHint);
      if (stateFromAddress) {
        logger.info('State resolved from address string', { state: stateFromAddress, address: addressHint });
        return stateFromAddress;
      }
    }

    logger.warn('Could not resolve Nigerian state — will default to low tier', { coordinates, addressHint });
    return null;
  }

  /**
   * Parse a free-text address string and return the matching Nigerian state name.
   * Checks major city names first, then direct state name matching.
   *
   * Examples:
   *   "10 Ogunbadewa Street Ikorodu, Lagos" → "Lagos"
   *   "Wuse 2, Abuja"                       → "FCT"
   *   "Trans Amadi, Port Harcourt"          → "Rivers"
   */
  static extractStateFromAddress(address: string): string | null {
    if (!address) return null;

    const lower = address.toLowerCase();

    // City → State mappings (checked before state names to avoid ambiguity)
    const cityToState: Record<string, string> = {
      'abuja':           'FCT',
      'port harcourt':   'Rivers',
      'ikorodu':         'Lagos',
      'ikeja':           'Lagos',
      'victoria island': 'Lagos',
      'lekki':           'Lagos',
      'surulere':        'Lagos',
      'yaba':            'Lagos',
      'apapa':           'Lagos',
      'oshodi':          'Lagos',
      'mushin':          'Lagos',
      'agege':           'Lagos',
      'ojota':           'Lagos',
      'ketu':            'Lagos',
      'berger':          'Lagos',
      'ajah':            'Lagos',
      'sangotedo':       'Lagos',
      'badagry':         'Lagos',
      'epe':             'Lagos',
      'ibadan':          'Oyo',
      'benin city':      'Edo',
      'warri':           'Delta',
      'asaba':           'Delta',
      'enugu city':      'Enugu',
      'owerri':          'Imo',
      'uyo':             'Akwa Ibom',
      'calabar':         'Cross River',
      'maiduguri':       'Borno',
      'jos':             'Plateau',
      'ilorin':          'Kwara',
      'abeokuta':        'Ogun',
      'akure':           'Ondo',
      'osogbo':          'Osun',
      'ado-ekiti':       'Ekiti',
      'ado ekiti':       'Ekiti',
      'awka':            'Anambra',
      'onitsha':         'Anambra',
      'nnewi':           'Anambra',
      'umuahia':         'Abia',
      'aba':             'Abia',
      'abakaliki':       'Ebonyi',
      'yenagoa':         'Bayelsa',
      'lokoja':          'Kogi',
      'lafia':           'Nasarawa',
      'minna':           'Niger',
      'birnin kebbi':    'Kebbi',
      'sokoto city':     'Sokoto',
      'gusau':           'Zamfara',
      'dutse':           'Jigawa',
      'damaturu':        'Yobe',
      'jalingo':         'Taraba',
      'yola':            'Adamawa',
      'gombe city':      'Gombe',
      'bauchi city':     'Bauchi',
      'makurdi':         'Benue',
      'kaduna city':     'Kaduna',
      'kano city':       'Kano',
      'katsina city':    'Katsina',
    };

    for (const [city, state] of Object.entries(cityToState)) {
      if (lower.includes(city)) return state;
    }

    // Direct state name matching with word boundaries
    const nigerianStates = [
      'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa',
      'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti',
      'Enugu', 'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
      'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
      'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
    ];

    for (const state of nigerianStates) {
      const regex = new RegExp(`\\b${state.replace(' ', '\\s+')}\\b`, 'i');
      if (regex.test(address)) return state;
    }

    return null;
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
