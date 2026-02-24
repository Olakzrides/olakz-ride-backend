import { Request, Response } from 'express';
import { GooglePlacesService } from '../services/google-places.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

/**
 * LocationsController
 * Handles Google Places API proxy endpoints
 */
export class LocationsController {
  /**
   * Get place autocomplete suggestions
   * GET /api/locations/autocomplete
   */
  getAutocomplete = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const {
        input,
        location,
        radius,
        types,
        components,
        language,
      } = req.query;

      if (!input || typeof input !== 'string') {
        return ResponseUtil.badRequest(res, 'Search input is required');
      }

      const result = await GooglePlacesService.getAutocomplete({
        input: input as string,
        location: location as string,
        radius: radius ? parseInt(radius as string) : undefined,
        types: types as string,
        components: components as string,
        language: language as string,
      });

      logger.info('Autocomplete request processed:', {
        userId,
        input,
        resultsCount: result.predictions?.length || 0,
      });

      return ResponseUtil.success(res, {
        predictions: result.predictions,
        status: result.status,
      });
    } catch (error: any) {
      logger.error('Autocomplete error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch autocomplete suggestions');
    }
  };

  /**
   * Get place details by place_id
   * GET /api/locations/place-details
   */
  getPlaceDetails = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { place_id, fields, language } = req.query;

      if (!place_id || typeof place_id !== 'string') {
        return ResponseUtil.badRequest(res, 'Place ID is required');
      }

      const result = await GooglePlacesService.getPlaceDetails({
        placeId: place_id as string,
        fields: fields as string,
        language: language as string,
      });

      logger.info('Place details request processed:', {
        userId,
        placeId: place_id,
        placeName: result.result?.name,
      });

      return ResponseUtil.success(res, {
        result: result.result,
        status: result.status,
      });
    } catch (error: any) {
      logger.error('Place details error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch place details');
    }
  };

  /**
   * Geocode an address
   * GET /api/locations/geocode
   */
  geocodeAddress = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { address } = req.query;

      if (!address || typeof address !== 'string') {
        return ResponseUtil.badRequest(res, 'Address is required');
      }

      const result = await GooglePlacesService.geocodeAddress(address as string);

      logger.info('Geocode request processed:', {
        userId,
        address,
      });

      return ResponseUtil.success(res, result);
    } catch (error: any) {
      logger.error('Geocode error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to geocode address');
    }
  };

  /**
   * Reverse geocode coordinates
   * GET /api/locations/reverse-geocode
   */
  reverseGeocode = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { latitude, longitude } = req.query;

      if (!latitude || !longitude) {
        return ResponseUtil.badRequest(res, 'Latitude and longitude are required');
      }

      const lat = parseFloat(latitude as string);
      const lng = parseFloat(longitude as string);

      if (isNaN(lat) || isNaN(lng)) {
        return ResponseUtil.badRequest(res, 'Invalid latitude or longitude');
      }

      const result = await GooglePlacesService.reverseGeocode(lat, lng);

      logger.info('Reverse geocode request processed:', {
        userId,
        latitude: lat,
        longitude: lng,
      });

      return ResponseUtil.success(res, result);
    } catch (error: any) {
      logger.error('Reverse geocode error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to reverse geocode location');
    }
  };
}
