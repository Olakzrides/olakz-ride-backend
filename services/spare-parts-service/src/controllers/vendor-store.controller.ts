import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { VendorStoreService } from '../services/vendor-store.service';
import { ResponseUtil } from '../utils/response.util';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabase } from '../config/database';
import { logger } from '../config/logger';

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'spare-parts';

const ALLOWED_FILE_TYPES = ['product_image', 'store_logo', 'store_banner'];

// ─────────────────────────────────────────────────────────────────────────────
// STORE PROFILE
// ─────────────────────────────────────────────────────────────────────────────

export class VendorStoreController {
  // GET /api/spare-parts/vendor/store
  getProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const store   = await VendorStoreService.getProfile(ownerId);
      if (!store) return ResponseUtil.notFound(res, 'Store not found');
      return ResponseUtil.success(res, { store });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // PUT /api/spare-parts/vendor/store
  updateProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const store   = await VendorStoreService.updateProfile(ownerId, req.body);
      return ResponseUtil.success(res, { store }, 'Store profile updated');
    } catch (err: any) {
      if (err.message === 'Store not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // PUT /api/spare-parts/vendor/store/status
  setOpenStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId    = (req as AuthRequest).user!.id;
      const { is_open } = req.body;
      if (is_open === undefined) {
        return ResponseUtil.badRequest(res, 'is_open is required');
      }
      await VendorStoreService.setOpenStatus(ownerId, Boolean(is_open));
      return ResponseUtil.success(
        res,
        null,
        `Store is now ${is_open ? 'open' : 'closed'}`
      );
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/vendor/store/statistics
  getStatistics = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const stats   = await VendorStoreService.getStatistics(ownerId);
      if (!stats) return ResponseUtil.notFound(res, 'Store not found');
      return ResponseUtil.success(res, { statistics: stats });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // GET /api/spare-parts/vendor/upload-url
  // Query: file_type (product_image | store_logo | store_banner), file_name
  getUploadUrl = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const { file_type, file_name } = req.query as {
        file_type: string;
        file_name: string;
      };

      if (!file_type || !file_name) {
        return ResponseUtil.badRequest(res, 'file_type and file_name are required');
      }
      if (!ALLOWED_FILE_TYPES.includes(file_type)) {
        return ResponseUtil.badRequest(
          res,
          `file_type must be one of: ${ALLOWED_FILE_TYPES.join(', ')}`
        );
      }

      const ext      = file_name.split('.').pop() || 'jpg';
      const filePath = `${ownerId}/${file_type}/${uuidv4()}.${ext}`;

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUploadUrl(filePath);

      if (error || !data) {
        logger.error('Failed to generate spare parts upload URL:', error);
        return ResponseUtil.serverError(res, 'Failed to generate upload URL');
      }

      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filePath);

      return ResponseUtil.success(
        res,
        {
          signed_url: data.signedUrl,
          public_url: urlData.publicUrl,
          file_path:  filePath,
          file_type,
          file_name,
        },
        'Upload URL generated'
      );
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PRODUCTS
  // ─────────────────────────────────────────────────────────────────────────

  // GET /api/spare-parts/vendor/products
  // Query: category_id, is_active, limit, page
  listProducts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const { category_id, is_active, limit, page } = req.query;

      const products = await VendorStoreService.listProducts(ownerId, {
        categoryId: category_id as string | undefined,
        isActive:   is_active !== undefined ? is_active === 'true' : undefined,
        limit:      limit ? parseInt(limit as string) : 20,
        page:       page  ? parseInt(page as string)  : 1,
      });
      return ResponseUtil.success(res, { products });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // POST /api/spare-parts/vendor/products
  createProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId        = (req as AuthRequest).user!.id;
      const { name, price } = req.body;

      if (!name || price === undefined) {
        return ResponseUtil.badRequest(res, 'name and price are required');
      }
      if (typeof price !== 'number' || price <= 0) {
        return ResponseUtil.badRequest(res, 'price must be a positive number');
      }

      const product = await VendorStoreService.createProduct(ownerId, req.body);
      return ResponseUtil.created(res, { product }, 'Product created');
    } catch (err: any) {
      if (err.message === 'Store not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // PUT /api/spare-parts/vendor/products/:id
  updateProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId = (req as AuthRequest).user!.id;
      const product = await VendorStoreService.updateProduct(
        ownerId,
        req.params.id,
        req.body
      );
      return ResponseUtil.success(res, { product }, 'Product updated');
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // DELETE /api/spare-parts/vendor/products/:id
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

  // PUT /api/spare-parts/vendor/products/:id/availability
  toggleAvailability = async (req: Request, res: Response): Promise<Response> => {
    try {
      const ownerId       = (req as AuthRequest).user!.id;
      const { is_available } = req.body;

      if (is_available === undefined) {
        return ResponseUtil.badRequest(res, 'is_available is required');
      }
      const product = await VendorStoreService.toggleProductAvailability(
        ownerId,
        req.params.id,
        Boolean(is_available)
      );
      return ResponseUtil.success(
        res,
        { product },
        `Product is now ${is_available ? 'available' : 'unavailable'}`
      );
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
