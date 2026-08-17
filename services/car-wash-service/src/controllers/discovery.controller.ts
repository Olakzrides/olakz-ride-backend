import { Request, Response } from 'express';
import { DiscoveryService } from '../services/discovery.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class DiscoveryController {
  private discoveryService = new DiscoveryService();

  /**
   * GET /api/car-wash/categories
   * Returns the static list of wash categories shown as chips on the home screen.
   * No auth required.
   */
  getCategories = async (_req: Request, res: Response): Promise<Response> => {
    return ResponseUtil.success(res, this.discoveryService.getCategories());
  };

  /**
   * GET /api/car-wash/vendors/top-rated
   * Query: latitude, longitude, radiusKm?, limit?
   *
   * Powers the "Top rated Car wash" horizontal grid.
   * No auth required.
   */
  getTopRated = async (req: Request, res: Response): Promise<Response> => {
    const { latitude, longitude, radiusKm, limit } = req.query;

    if (!latitude || !longitude) {
      return ResponseUtil.badRequest(res, 'latitude and longitude are required');
    }

    try {
      const vendors = await this.discoveryService.getTopRated({
        latitude:  parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        radiusKm:  radiusKm ? parseFloat(radiusKm as string) : undefined,
        limit:     limit    ? parseInt(limit as string, 10)  : undefined,
      });
      return ResponseUtil.success(res, vendors);
    } catch (err: any) {
      logger.error('getTopRated error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/car-wash/vendors/nearby
   * Query: latitude, longitude, radiusKm?, category?, page?, limit?, excludeIds?
   *
   * Powers the "Other nearby" list section.
   * No auth required.
   */
  getNearby = async (req: Request, res: Response): Promise<Response> => {
    const { latitude, longitude, radiusKm, category, page, limit, excludeIds } = req.query;

    if (!latitude || !longitude) {
      return ResponseUtil.badRequest(res, 'latitude and longitude are required');
    }

    // excludeIds is comma-separated list of vendor IDs already shown in top-rated
    const excludeList = excludeIds
      ? (excludeIds as string).split(',').filter(Boolean)
      : [];

    try {
      const result = await this.discoveryService.getNearby({
        latitude:   parseFloat(latitude as string),
        longitude:  parseFloat(longitude as string),
        radiusKm:   radiusKm  ? parseFloat(radiusKm as string)   : undefined,
        category:   category  ? (category as any)                : undefined,
        page:       page      ? parseInt(page as string, 10)     : 1,
        limit:      limit     ? parseInt(limit as string, 10)    : 20,
        excludeIds: excludeList,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      logger.error('getNearby error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/car-wash/vendors/search
   * Query: latitude, longitude, query?, category?, radiusKm?, page?, limit?
   *
   * Powers the search bar + filter interaction.
   * No auth required.
   */
  search = async (req: Request, res: Response): Promise<Response> => {
    const { latitude, longitude, query, category, radiusKm, page, limit } = req.query;

    if (!latitude || !longitude) {
      return ResponseUtil.badRequest(res, 'latitude and longitude are required');
    }

    try {
      const result = await this.discoveryService.search({
        latitude:  parseFloat(latitude as string),
        longitude: parseFloat(longitude as string),
        query:     query     ? (query as string)                 : undefined,
        category:  category  ? (category as any)                : undefined,
        radiusKm:  radiusKm  ? parseFloat(radiusKm as string)   : undefined,
        page:      page      ? parseInt(page as string, 10)     : 1,
        limit:     limit     ? parseInt(limit as string, 10)    : 20,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      logger.error('search error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
