import { Request, Response } from 'express';
import { DiscoveryService } from '../services/discovery.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class DiscoveryController {
  private discoveryService = new DiscoveryService();

  /**
   * GET /api/auto-mech/categories
   */
  getCategories = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const categories = await this.discoveryService.getCategories();
      return ResponseUtil.success(res, categories);
    } catch (err: any) {
      logger.error('getCategories error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/top-rated
   * Query: latitude, longitude, radiusKm?, limit?
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
   * GET /api/auto-mech/vendors/nearby
   * Query: latitude, longitude, radiusKm?, category?, page?, limit?, excludeIds?
   */
  getNearby = async (req: Request, res: Response): Promise<Response> => {
    const { latitude, longitude, radiusKm, category, page, limit, excludeIds } = req.query;

    if (!latitude || !longitude) {
      return ResponseUtil.badRequest(res, 'latitude and longitude are required');
    }

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
   * GET /api/auto-mech/vendors/by-category
   * Query: category, categoryType (system|custom), latitude?, longitude?,
   *        nearbyRadiusKm?, topRatedMinRating?, page?, limit?
   */
  getVendorsByCategory = async (req: Request, res: Response): Promise<Response> => {
    const { category, categoryType, latitude, longitude, nearbyRadiusKm, topRatedMinRating, page, limit } = req.query;

    if (!category) {
      return ResponseUtil.badRequest(res, 'category is required');
    }
    if (!categoryType || !['system', 'custom'].includes(categoryType as string)) {
      return ResponseUtil.badRequest(res, 'categoryType must be "system" or "custom"');
    }

    try {
      const result = await this.discoveryService.getVendorsByCategory({
        category:          category as string,
        categoryType:      categoryType as 'system' | 'custom',
        latitude:          latitude         ? parseFloat(latitude as string)         : undefined,
        longitude:         longitude        ? parseFloat(longitude as string)        : undefined,
        nearbyRadiusKm:    nearbyRadiusKm   ? parseFloat(nearbyRadiusKm as string)   : undefined,
        topRatedMinRating: topRatedMinRating ? parseFloat(topRatedMinRating as string) : undefined,
        page:              page             ? parseInt(page as string, 10)           : 1,
        limit:             limit            ? parseInt(limit as string, 10)          : 20,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      logger.error('getVendorsByCategory error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/all
   * Query: latitude?, longitude?, category?, page?, limit?
   */
  getAllVendors = async (req: Request, res: Response): Promise<Response> => {
    const { latitude, longitude, category, page, limit } = req.query;

    if ((latitude && !longitude) || (!latitude && longitude)) {
      return ResponseUtil.badRequest(res, 'Provide both latitude and longitude, or neither');
    }

    try {
      const result = await this.discoveryService.getAllVendors({
        latitude:  latitude  ? parseFloat(latitude as string)  : undefined,
        longitude: longitude ? parseFloat(longitude as string) : undefined,
        category:  category  ? (category as any)               : undefined,
        page:      page      ? parseInt(page as string, 10)    : 1,
        limit:     limit     ? parseInt(limit as string, 10)   : 20,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      logger.error('getAllVendors error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/search
   * Query: latitude, longitude, query?, category?, radiusKm?, page?, limit?
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
        query:     query    ? (query as string)                : undefined,
        category:  category ? (category as any)               : undefined,
        radiusKm:  radiusKm ? parseFloat(radiusKm as string)  : undefined,
        page:      page     ? parseInt(page as string, 10)    : 1,
        limit:     limit    ? parseInt(limit as string, 10)   : 20,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      logger.error('search error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
