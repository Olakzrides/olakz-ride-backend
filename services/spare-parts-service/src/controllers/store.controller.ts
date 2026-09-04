import { Request, Response } from 'express';
import { StoreService } from '../services/store.service';
import { ResponseUtil } from '../utils/response.util';

export class StoreController {
  // GET /api/spare-parts/categories
  // Query: store_id (optional) — if provided returns global + that store's custom categories
  listCategories = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { store_id } = req.query;
      const categories = await StoreService.listCategories(store_id as string | undefined);
      return ResponseUtil.success(res, { categories });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/stores
  // Query: lat, lng, radius, category_id, is_open, rating_min, limit, page
  listStores = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { lat, lng, radius, category_id, is_open, rating_min, limit, page } = req.query;
      const stores = await StoreService.listStores({
        lat:        lat        ? parseFloat(lat as string)        : undefined,
        lng:        lng        ? parseFloat(lng as string)        : undefined,
        radius:     radius     ? parseFloat(radius as string)     : undefined,
        categoryId: category_id as string | undefined,
        isOpen:     is_open    !== undefined ? is_open === 'true' : undefined,
        ratingMin:  rating_min ? parseFloat(rating_min as string) : undefined,
        limit:      limit      ? parseInt(limit as string)        : 20,
        page:       page       ? parseInt(page as string)         : 1,
      });
      return ResponseUtil.success(res, { stores });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/stores/:id
  getStore = async (req: Request, res: Response): Promise<Response> => {
    try {
      const store = await StoreService.getStore(req.params.id);
      if (!store) return ResponseUtil.notFound(res, 'Store not found');
      return ResponseUtil.success(res, { store });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/stores/:id/products
  // Query: category_id, limit, page
  getStoreProducts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { category_id, limit, page } = req.query;
      const result = await StoreService.getStoreProducts(req.params.id, {
        categoryId: category_id as string | undefined,
        limit:      limit ? parseInt(limit as string) : 20,
        page:       page  ? parseInt(page as string)  : 1,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/stores/:id/reviews
  // Query: limit, page
  getStoreReviews = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { limit, page } = req.query;
      const result = await StoreService.getStoreReviews(req.params.id, {
        limit: limit ? parseInt(limit as string) : 20,
        page:  page  ? parseInt(page as string)  : 1,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/products/:id
  getProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const product = await StoreService.getProduct(req.params.id);
      if (!product) return ResponseUtil.notFound(res, 'Product not found');
      return ResponseUtil.success(res, { product });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/products/:id/similar
  getSimilarProducts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const products = await StoreService.getSimilarProducts(req.params.id);
      return ResponseUtil.success(res, { products });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/products/:id/reviews
  // Query: limit, page
  getProductReviews = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { limit, page } = req.query;
      const result = await StoreService.getProductReviews(req.params.id, {
        limit: limit ? parseInt(limit as string) : 20,
        page:  page  ? parseInt(page as string)  : 1,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/search
  // Query: q (required), category_id, lat, lng, limit
  search = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { q, category_id, lat, lng, limit } = req.query;
      if (!q) return ResponseUtil.badRequest(res, 'q (search query) is required');
      const result = await StoreService.search(q as string, {
        categoryId: category_id as string | undefined,
        lat:        lat   ? parseFloat(lat as string)   : undefined,
        lng:        lng   ? parseFloat(lng as string)   : undefined,
        limit:      limit ? parseInt(limit as string)   : 20,
      });
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/delivery-options
  // Query: store_id (required), delivery_lat (required), delivery_lng (required)
  getDeliveryOptions = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { store_id, delivery_lat, delivery_lng } = req.query;
      if (!store_id || !delivery_lat || !delivery_lng) {
        return ResponseUtil.badRequest(
          res,
          'store_id, delivery_lat, and delivery_lng are required'
        );
      }
      const options = await StoreService.getDeliveryOptions({
        storeId:     store_id as string,
        deliveryLat: parseFloat(delivery_lat as string),
        deliveryLng: parseFloat(delivery_lng as string),
      });
      return ResponseUtil.success(res, { delivery_options: options });
    } catch (err: any) {
      if (err.message === 'Store not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
