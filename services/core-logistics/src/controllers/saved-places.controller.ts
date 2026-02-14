import { Request, Response } from 'express';
import { SavedPlacesService } from '../services/saved-places.service';
import { ResponseUtil } from '../utils/response.util';
import { MapsUtil } from '../utils/maps.util';
import { logger } from '../config/logger';

export class SavedPlacesController {
  private savedPlacesService: SavedPlacesService;

  constructor() {
    this.savedPlacesService = new SavedPlacesService();
  }

  /**
   * Get user's saved places
   * GET /api/saved-places
   */
  getSavedPlaces = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { type } = req.query;

      const places = await this.savedPlacesService.getUserSavedPlaces(
        userId,
        type as string | undefined
      );

      return ResponseUtil.success(res, {
        places: places.map(place => ({
          id: place.id,
          placeType: place.place_type,
          label: place.label,
          location: {
            latitude: parseFloat(place.latitude),
            longitude: parseFloat(place.longitude),
            address: place.address,
          },
          isDefault: place.is_default,
          createdAt: place.created_at,
          updatedAt: place.updated_at,
        })),
        total: places.length,
      });
    } catch (error: any) {
      logger.error('Get saved places error:', error);
      return ResponseUtil.error(res, 'Failed to get saved places');
    }
  };

  /**
   * Create a saved place
   * POST /api/saved-places
   */
  createSavedPlace = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { placeType, label, location, isDefault } = req.body;

      // Validate input
      if (!placeType || !location) {
        return ResponseUtil.badRequest(res, 'Missing required fields');
      }

      if (!['home', 'work', 'favorite'].includes(placeType)) {
        return ResponseUtil.badRequest(res, 'Invalid place type');
      }

      if (!MapsUtil.validateCoordinates(location.latitude, location.longitude)) {
        return ResponseUtil.badRequest(res, 'Invalid coordinates');
      }

      const result = await this.savedPlacesService.createSavedPlace(userId, {
        placeType,
        label,
        location,
        isDefault,
      });

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      return ResponseUtil.success(res, {
        place: {
          id: result.place!.id,
          placeType: result.place!.place_type,
          label: result.place!.label,
          location: {
            latitude: parseFloat(result.place!.latitude),
            longitude: parseFloat(result.place!.longitude),
            address: result.place!.address,
          },
          isDefault: result.place!.is_default,
          createdAt: result.place!.created_at,
        },
        message: 'Saved place created successfully',
      });
    } catch (error: any) {
      logger.error('Create saved place error:', error);
      return ResponseUtil.error(res, 'Failed to create saved place');
    }
  };

  /**
   * Update a saved place
   * PUT /api/saved-places/:id
   */
  updateSavedPlace = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { placeType, label, location, isDefault } = req.body;

      // Validate place type if provided
      if (placeType && !['home', 'work', 'favorite'].includes(placeType)) {
        return ResponseUtil.badRequest(res, 'Invalid place type');
      }

      // Validate coordinates if location provided
      if (location && !MapsUtil.validateCoordinates(location.latitude, location.longitude)) {
        return ResponseUtil.badRequest(res, 'Invalid coordinates');
      }

      const result = await this.savedPlacesService.updateSavedPlace(id, userId, {
        placeType,
        label,
        location,
        isDefault,
      });

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      return ResponseUtil.success(res, {
        place: {
          id: result.place!.id,
          placeType: result.place!.place_type,
          label: result.place!.label,
          location: {
            latitude: parseFloat(result.place!.latitude),
            longitude: parseFloat(result.place!.longitude),
            address: result.place!.address,
          },
          isDefault: result.place!.is_default,
          updatedAt: result.place!.updated_at,
        },
        message: 'Saved place updated successfully',
      });
    } catch (error: any) {
      logger.error('Update saved place error:', error);
      return ResponseUtil.error(res, 'Failed to update saved place');
    }
  };

  /**
   * Delete a saved place
   * DELETE /api/saved-places/:id
   */
  deleteSavedPlace = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      const result = await this.savedPlacesService.deleteSavedPlace(id, userId);

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      return ResponseUtil.success(res, {
        message: 'Saved place deleted successfully',
      });
    } catch (error: any) {
      logger.error('Delete saved place error:', error);
      return ResponseUtil.error(res, 'Failed to delete saved place');
    }
  };

  /**
   * Set a place as default
   * POST /api/saved-places/:id/set-default
   */
  setDefaultPlace = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      const result = await this.savedPlacesService.setDefaultPlace(id, userId);

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      return ResponseUtil.success(res, {
        message: 'Place set as default successfully',
      });
    } catch (error: any) {
      logger.error('Set default place error:', error);
      return ResponseUtil.error(res, 'Failed to set default place');
    }
  };
}
