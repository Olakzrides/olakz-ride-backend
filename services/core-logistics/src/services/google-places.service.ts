import axios from 'axios';
import { logger } from '../config/logger';

/**
 * GooglePlacesService
 * Proxy service for Google Places API to avoid CORS issues and secure API key
 */
export class GooglePlacesService {
  private static readonly GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
  private static readonly PLACES_AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
  private static readonly PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

  /**
   * Get place autocomplete suggestions
   */
  static async getAutocomplete(params: {
    input: string;
    location?: string; // lat,lng
    radius?: number;
    types?: string;
    components?: string; // country:ng
    language?: string;
  }): Promise<any> {
    try {
      if (!this.GOOGLE_MAPS_API_KEY) {
        throw new Error('Google Maps API key not configured');
      }

      if (!params.input || params.input.trim().length === 0) {
        return {
          predictions: [],
          status: 'ZERO_RESULTS',
        };
      }

      const requestParams: any = {
        input: params.input,
        key: this.GOOGLE_MAPS_API_KEY,
      };

      // Add optional parameters
      if (params.location) {
        requestParams.location = params.location;
      }

      if (params.radius) {
        requestParams.radius = params.radius;
      }

      if (params.types) {
        requestParams.types = params.types;
      }

      if (params.components) {
        requestParams.components = params.components;
      }

      if (params.language) {
        requestParams.language = params.language;
      }

      logger.info('Google Places Autocomplete request:', {
        input: params.input,
        location: params.location,
        radius: params.radius,
      });

      const response = await axios.get(this.PLACES_AUTOCOMPLETE_URL, {
        params: requestParams,
        timeout: 5000,
      });

      if (response.data.status === 'OK' || response.data.status === 'ZERO_RESULTS') {
        logger.info('Google Places Autocomplete success:', {
          input: params.input,
          resultsCount: response.data.predictions?.length || 0,
        });

        return {
          predictions: response.data.predictions || [],
          status: response.data.status,
        };
      }

      logger.error('Google Places Autocomplete error:', {
        status: response.data.status,
        errorMessage: response.data.error_message,
      });

      throw new Error(response.data.error_message || 'Failed to fetch autocomplete suggestions');
    } catch (error: any) {
      logger.error('Google Places Autocomplete error:', error);
      
      if (error.response) {
        throw new Error(error.response.data?.error_message || 'Failed to fetch autocomplete suggestions');
      }
      
      throw new Error(error.message || 'Failed to fetch autocomplete suggestions');
    }
  }

  /**
   * Get place details by place_id
   */
  static async getPlaceDetails(params: {
    placeId: string;
    fields?: string;
    language?: string;
  }): Promise<any> {
    try {
      if (!this.GOOGLE_MAPS_API_KEY) {
        throw new Error('Google Maps API key not configured');
      }

      if (!params.placeId) {
        throw new Error('Place ID is required');
      }

      const requestParams: any = {
        place_id: params.placeId,
        key: this.GOOGLE_MAPS_API_KEY,
      };

      // Default fields if not provided
      if (params.fields) {
        requestParams.fields = params.fields;
      } else {
        // Request commonly needed fields
        requestParams.fields = [
          'place_id',
          'formatted_address',
          'geometry',
          'name',
          'address_components',
          'types',
          'plus_code',
        ].join(',');
      }

      if (params.language) {
        requestParams.language = params.language;
      }

      logger.info('Google Place Details request:', {
        placeId: params.placeId,
        fields: requestParams.fields,
      });

      const response = await axios.get(this.PLACE_DETAILS_URL, {
        params: requestParams,
        timeout: 5000,
      });

      if (response.data.status === 'OK') {
        logger.info('Google Place Details success:', {
          placeId: params.placeId,
          name: response.data.result?.name,
        });

        return {
          result: response.data.result,
          status: response.data.status,
        };
      }

      logger.error('Google Place Details error:', {
        status: response.data.status,
        errorMessage: response.data.error_message,
      });

      throw new Error(response.data.error_message || 'Failed to fetch place details');
    } catch (error: any) {
      logger.error('Google Place Details error:', error);
      
      if (error.response) {
        throw new Error(error.response.data?.error_message || 'Failed to fetch place details');
      }
      
      throw new Error(error.message || 'Failed to fetch place details');
    }
  }

  /**
   * Geocode an address to get coordinates
   */
  static async geocodeAddress(address: string): Promise<{
    latitude: number;
    longitude: number;
    formattedAddress: string;
  }> {
    try {
      if (!this.GOOGLE_MAPS_API_KEY) {
        throw new Error('Google Maps API key not configured');
      }

      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address,
          key: this.GOOGLE_MAPS_API_KEY,
        },
        timeout: 5000,
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        return {
          latitude: result.geometry.location.lat,
          longitude: result.geometry.location.lng,
          formattedAddress: result.formatted_address,
        };
      }

      throw new Error('Address not found');
    } catch (error: any) {
      logger.error('Geocode address error:', error);
      throw new Error(error.message || 'Failed to geocode address');
    }
  }

  /**
   * Reverse geocode coordinates to get address
   */
  static async reverseGeocode(latitude: number, longitude: number): Promise<{
    formattedAddress: string;
    addressComponents: any[];
  }> {
    try {
      if (!this.GOOGLE_MAPS_API_KEY) {
        throw new Error('Google Maps API key not configured');
      }

      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          latlng: `${latitude},${longitude}`,
          key: this.GOOGLE_MAPS_API_KEY,
        },
        timeout: 5000,
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        return {
          formattedAddress: result.formatted_address,
          addressComponents: result.address_components,
        };
      }

      throw new Error('Location not found');
    } catch (error: any) {
      logger.error('Reverse geocode error:', error);
      throw new Error(error.message || 'Failed to reverse geocode location');
    }
  }
}
