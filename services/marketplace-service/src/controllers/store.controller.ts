import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { ResponseUtil } from '../utils/response';

export class StoreController {
  listCategories = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const categories = await StoreService.listCategories();
      return ResponseUtil.success(res, { categories });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  listStores = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { lat, lng, radius, category_id, is_open, rating_min, limit, page } = req.query;
      const stores = await StoreService.listStores({
        lat: lat ? parseFloat(lat as string) : undefined,
        lng: lng ? parseFloat(lng as string) : undefined,
        radius: radius ? parseFloat(radius as string) : undefined,
        categoryId: category_id as string | undefined,
        isOpen: is_open !== undefined ? is_open === 'true' : undefined,
        ratingMin: rating_min ? parseFloat(rating_min as string) : undefined,
        limit: limit ? parseInt(limit as string) : 20,
        page: page ? parseInt(page as string) : 1,
      });
      return ResponseUtil.success(res, { stores });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getStore = async (req: Request, res: Response): Promise<Response> => {
    try {
      const store = await StoreService.getStore(req.params.id);
      if (!store) return ResponseUtil.notFound(res, 'Store not found');
      return ResponseUtil.success(res, { store });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getStoreProducts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { category_id, limit, page } = req.query;
      const result = await StoreService.getStoreProducts(req.params.id, {
        categoryId: category_id as string | undefined,
        limit: limit ? parseInt(limit as string) : 20,
        page: page ? parseInt(page as string) : 1,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const product = await StoreService.getProduct(req.params.id);
      if (!product) return ResponseUtil.notFound(res, 'Product not found');
      return ResponseUtil.success(res, { product });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  search = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { query, lat, lng, limit } = req.query;
      if (!query) return ResponseUtil.badRequest(res, 'query is required');
      const result = await StoreService.search(query as string, {
        lat: lat ? parseFloat(lat as string) : undefined,
        lng: lng ? parseFloat(lng as string) : undefined,
        limit: limit ? parseInt(limit as string) : 20,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getSimilarProducts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const products = await StoreService.getSimilarProducts(req.params.id);
      return ResponseUtil.success(res, { products });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
