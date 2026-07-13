import { Request, Response } from 'express';
import { RestaurantService } from '../services/restaurant.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class RestaurantController {
  listRestaurants = async (req: Request, res: Response): Promise<Response> => {
    try {
      const {
        lat, lng, radius, cuisine_type, rating_min, is_open, limit, page,
      } = req.query;

      const result = await RestaurantService.listRestaurants({
        lat: lat ? parseFloat(lat as string) : undefined,
        lng: lng ? parseFloat(lng as string) : undefined,
        radiusKm: radius ? parseFloat(radius as string) : 15,
        cuisineType: cuisine_type as string | undefined,
        ratingMin: rating_min ? parseFloat(rating_min as string) : undefined,
        isOpen: is_open !== undefined ? is_open === 'true' : undefined,
        limit: limit ? parseInt(limit as string) : 20,
        offset: page ? (parseInt(page as string) - 1) * (limit ? parseInt(limit as string) : 20) : 0,
      });

      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getRestaurant = async (req: Request, res: Response): Promise<Response> => {
    try {
      const restaurant = await RestaurantService.getRestaurantWithMenu(req.params.id);
      if (!restaurant) return ResponseUtil.notFound(res, 'Restaurant not found');
      return ResponseUtil.success(res, restaurant);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getMenu = async (req: Request, res: Response): Promise<Response> => {
    try {
      const menu = await RestaurantService.getMenu(req.params.id);
      return ResponseUtil.success(res, { menu });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getCategories = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const categories = await RestaurantService.getCategories();
      return ResponseUtil.success(res, { categories });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const item = await RestaurantService.getMenuItem(req.params.id);
      if (!item) return ResponseUtil.notFound(res, 'Item not found');
      return ResponseUtil.success(res, item);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  search = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { query, lat, lng, limit } = req.query;
      if (!query) return ResponseUtil.badRequest(res, 'query parameter is required');

      const result = await RestaurantService.search({
        query: query as string,
        lat: lat ? parseFloat(lat as string) : undefined,
        lng: lng ? parseFloat(lng as string) : undefined,
        limit: limit ? parseInt(limit as string) : 10,
      });

      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/food/delivery-options
   * Returns available vehicle types with estimated fares for a given restaurant and delivery location
   */
  getDeliveryOptions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { restaurant_id, delivery_lat, delivery_lng } = req.body;
      if (!restaurant_id || !delivery_lat || !delivery_lng) {
        return ResponseUtil.badRequest(res, 'restaurant_id, delivery_lat, and delivery_lng are required');
      }
      const options = await RestaurantService.getDeliveryOptions({
        restaurantId: restaurant_id,
        deliveryLat: parseFloat(delivery_lat),
        deliveryLng: parseFloat(delivery_lng),
      });
      return ResponseUtil.success(res, { delivery_options: options });
    } catch (err: any) {
      if (err.message === 'Restaurant not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
