import { Request, Response } from 'express';
import { MenuService } from '../services/menu.service';
import { VendorProfileService } from '../services/vendor-profile.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

async function getRestaurant(req: Request, res: Response) {
  const ownerId = (req as AuthRequest).user!.id;
  const r = await VendorProfileService.getByOwnerId(ownerId);
  if (!r) { ResponseUtil.notFound(res, 'No restaurant found for this vendor'); return null; }
  return r;
}

export class MenuController {
  // ─── Categories ──────────────────────────────────────────────────────────────
  getCategories = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      return ResponseUtil.success(res, { categories: await MenuService.getCategories(r.id) });
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  createCategory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      if (!req.body.name) return ResponseUtil.badRequest(res, 'name is required');
      const cat = await MenuService.createCategory(r.id, req.body);
      return ResponseUtil.created(res, { category: cat }, 'Category created');
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  updateCategory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      const cat = await MenuService.updateCategory(req.params.id, r.id, req.body);
      return ResponseUtil.success(res, { category: cat }, 'Category updated');
    } catch (e: any) {
      if (e.message === 'Category not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  deleteCategory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      await MenuService.deleteCategory(req.params.id, r.id);
      return ResponseUtil.success(res, null, 'Category deleted');
    } catch (e: any) {
      if (e.message === 'Category not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  // ─── Products ─────────────────────────────────────────────────────────────────
  getProducts = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      const { category_id, is_active } = req.query;
      const products = await MenuService.getProducts(r.id, {
        category_id: category_id as string,
        is_active: is_active !== undefined ? is_active === 'true' : undefined,
      });
      return ResponseUtil.success(res, { products });
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  createProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      const { name, price } = req.body;
      if (!name || price === undefined) return ResponseUtil.badRequest(res, 'name and price are required');
      const product = await MenuService.createProduct(r.id, req.body);
      return ResponseUtil.created(res, { product }, 'Product created');
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  updateProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      const product = await MenuService.updateProduct(req.params.id, r.id, req.body);
      return ResponseUtil.success(res, { product }, 'Product updated');
    } catch (e: any) {
      if (e.message === 'Product not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  deleteProduct = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      await MenuService.deleteProduct(req.params.id, r.id);
      return ResponseUtil.success(res, null, 'Product deleted');
    } catch (e: any) {
      if (e.message === 'Product not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  updateProductAvailability = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      const { is_available } = req.body;
      if (is_available === undefined) return ResponseUtil.badRequest(res, 'is_available is required');
      const product = await MenuService.updateProductAvailability(req.params.id, r.id, is_available);
      return ResponseUtil.success(res, { product }, 'Availability updated');
    } catch (e: any) {
      if (e.message === 'Product not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  // ─── Extras ───────────────────────────────────────────────────────────────────
  getExtras = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      return ResponseUtil.success(res, { extras: await MenuService.getExtras(r.id) });
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  createExtra = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      if (!req.body.name) return ResponseUtil.badRequest(res, 'name is required');
      const extra = await MenuService.createExtra(r.id, req.body);
      return ResponseUtil.created(res, { extra }, 'Extra created');
    } catch (e: any) { return ResponseUtil.serverError(res, e.message); }
  };

  updateExtra = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      const extra = await MenuService.updateExtra(req.params.id, r.id, req.body);
      return ResponseUtil.success(res, { extra }, 'Extra updated');
    } catch (e: any) {
      if (e.message === 'Extra not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };

  deleteExtra = async (req: Request, res: Response): Promise<Response> => {
    try {
      const r = await getRestaurant(req, res);
      if (!r) return res as any;
      await MenuService.deleteExtra(req.params.id, r.id);
      return ResponseUtil.success(res, null, 'Extra deleted');
    } catch (e: any) {
      if (e.message === 'Extra not found') return ResponseUtil.notFound(res, e.message);
      return ResponseUtil.serverError(res, e.message);
    }
  };
}
