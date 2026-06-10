import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { VendorStoreService } from '../services/vendor-store.service';
import { AnalyticsService } from '../services/analytics.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabase } from '../config/database';
import logger from '../utils/logger';

const PUBLIC_BUCKET = 'marketplace-images';

const ALLOWED_FILE_TYPES = ['product_image', 'store_logo', 'store_banner'];

async function ensurePublicBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === PUBLIC_BUCKET)) {
    await supabase.storage.createBucket(PUBLIC_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
    });
  }
}

export class VendorStoreController {
  getProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const store = await VendorStoreService.getProfile(ownerId);
      if (!store) return ResponseUtil.notFound(res, 'Store not found');
      return ResponseUtil.success(res, { store });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  updateProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const store = await VendorStoreService.updateProfile(ownerId, req.body);
      return ResponseUtil.success(res, { store }, 'Store profile updated');
    } catch (err: any) {
      if (err.message === 'Store not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  setOpenStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const { is_open } = req.body;
      if (is_open === undefined) return ResponseUtil.badRequest(res, 'is_open is required');
      await VendorStoreService.setOpenStatus(ownerId, is_open);
      return ResponseUtil.success(res, null, `Store is now ${is_open ? 'open' : 'closed'}`);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getStatistics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const stats = await VendorStoreService.getStatistics(ownerId);
      if (!stats) return ResponseUtil.notFound(res, 'Store not found');
      return ResponseUtil.success(res, { statistics: stats });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  listProducts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const { category_id, is_active, limit, page } = req.query;
      const products = await VendorStoreService.listProducts(ownerId, {
        categoryId: category_id as string | undefined,
        isActive: is_active !== undefined ? is_active === 'true' : undefined,
        limit: limit ? parseInt(limit as string) : 20,
        page: page ? parseInt(page as string) : 1,
      });
      return ResponseUtil.success(res, { products });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  createProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const { name, price } = req.body;
      if (!name || price === undefined) return ResponseUtil.badRequest(res, 'name and price are required');
      const product = await VendorStoreService.createProduct(ownerId, req.body);
      return ResponseUtil.created(res, { product }, 'Product created');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  updateProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const product = await VendorStoreService.updateProduct(ownerId, req.params.id, req.body);
      return ResponseUtil.success(res, { product }, 'Product updated');
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  deleteProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      await VendorStoreService.deleteProduct(ownerId, req.params.id);
      return ResponseUtil.success(res, null, 'Product deleted');
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  toggleAvailability = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const { is_available } = req.body;
      if (is_available === undefined) return ResponseUtil.badRequest(res, 'is_available is required');
      const product = await VendorStoreService.toggleProductAvailability(ownerId, req.params.id, is_available);
      return ResponseUtil.success(res, { product }, 'Availability updated');
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getUploadUrl = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const { file_type, file_name } = req.query as { file_type: string; file_name: string };

      if (!file_type || !file_name) {
        return ResponseUtil.badRequest(res, 'file_type and file_name are required');
      }

      if (!ALLOWED_FILE_TYPES.includes(file_type)) {
        return ResponseUtil.badRequest(res, `file_type must be one of: ${ALLOWED_FILE_TYPES.join(', ')}`);
      }

      await ensurePublicBucket();

      const ext = file_name.split('.').pop() || 'jpg';
      const filePath = `${ownerId}/${file_type}/${uuidv4()}.${ext}`;

      const { data, error } = await supabase.storage
        .from(PUBLIC_BUCKET)
        .createSignedUploadUrl(filePath);

      if (error) {
        logger.error('Failed to generate marketplace upload URL:', error);
        return ResponseUtil.serverError(res, 'Failed to generate upload URL');
      }

      const { data: urlData } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(filePath);

      return ResponseUtil.success(res, {
        signed_url: data.signedUrl,
        public_url: urlData.publicUrl,
        file_path: filePath,
        file_type,
        file_name,
      }, 'Upload URL generated');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getAnalyticsDashboard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const store = await VendorStoreService.getProfile(ownerId);
      if (!store) return ResponseUtil.notFound(res, 'Store not found');
      const data = await AnalyticsService.vendorDashboard(store.id);
      return ResponseUtil.success(res, data);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getAnalyticsOrders = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const store = await VendorStoreService.getProfile(ownerId);
      if (!store) return ResponseUtil.notFound(res, 'Store not found');
      const data = await AnalyticsService.vendorOrdersByDate(store.id, req.query.date_from as string, req.query.date_to as string);
      return ResponseUtil.success(res, { by_date: data });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getEarnings = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const store = await VendorStoreService.getProfile(ownerId);
      if (!store) return ResponseUtil.notFound(res, 'Store not found');
      const data = await AnalyticsService.vendorEarnings(store.id, req.query.date_from as string, req.query.date_to as string);
      return ResponseUtil.success(res, data);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
