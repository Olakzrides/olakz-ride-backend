import { Request, Response } from 'express';
import { CategoryService } from '../services/category.service';
import { ResponseUtil } from '../utils/response.util';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabase } from '../config/database';
import { logger } from '../config/logger';
import Joi from 'joi';

const createCategorySchema = Joi.object({
  name:        Joi.string().min(2).max(100).required(),
  description: Joi.string().max(300).optional().allow(''),
  sortOrder:   Joi.number().integer().min(0).optional(),
});

const updateCategorySchema = Joi.object({
  name:        Joi.string().min(2).max(100).optional(),
  description: Joi.string().max(300).optional().allow(''),
  sortOrder:   Joi.number().integer().min(0).optional(),
  isActive:    Joi.boolean().optional(),
}).min(1);

export class CategoryController {
  private service = new CategoryService();

  /**
   * GET /api/car-wash/vendor/categories
   * Vendor's own categories (including inactive).
   */
  getMyCategories = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const { data: vendor } = await supabase
        .from('car_wash_vendors').select('id').eq('user_id', user.id).single();
      if (!vendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const categories = await this.service.getVendorCategories(vendor.id, true);
      return ResponseUtil.success(res, categories);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/car-wash/vendor/categories/all
   * Returns system categories + vendor's own custom categories combined.
   * Used when vendor is picking a category for a new service.
   */
  getAllCategories = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const { data: vendor } = await supabase
        .from('car_wash_vendors').select('id').eq('user_id', user.id).single();
      if (!vendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const categories = await this.service.getAllCategoriesForVendor(vendor.id);
      return ResponseUtil.success(res, categories);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/car-wash/vendor/categories/grouped
   * Services grouped by category — for dashboard overview.
   */
  getGroupedServices = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const { data: vendor } = await supabase
        .from('car_wash_vendors').select('id').eq('user_id', user.id).single();
      if (!vendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      // Pass includeInactive=true so vendor can see and toggle inactive services
      const grouped = await this.service.getServicesGroupedByCategory(vendor.id, true);
      return ResponseUtil.success(res, grouped);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/car-wash/vendor/categories
   */
  createCategory = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = createCategorySchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map(d => d.message));

    try {
      const { data: vendor } = await supabase
        .from('car_wash_vendors').select('id').eq('user_id', user.id).single();
      if (!vendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const category = await this.service.createCategory(vendor.id, user.id, value);
      return ResponseUtil.created(res, category, 'Category created');
    } catch (err: any) {
      if (err.message.includes('already exists')) return ResponseUtil.conflict(res, err.message);
      if (err.message.includes('approved')) return ResponseUtil.forbidden(res, err.message);
      logger.error('Create category error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PATCH /api/car-wash/vendor/categories/:categoryId
   */
  updateCategory = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = updateCategorySchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map(d => d.message));

    try {
      const { data: vendor } = await supabase
        .from('car_wash_vendors').select('id').eq('user_id', user.id).single();
      if (!vendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const category = await this.service.updateCategory(
        req.params.categoryId, vendor.id, user.id, value
      );
      return ResponseUtil.success(res, category, 'Category updated');
    } catch (err: any) {
      if (err.message === 'Category not found or does not belong to this vendor')
        return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * DELETE /api/car-wash/vendor/categories/:categoryId
   */
  deleteCategory = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const { data: vendor } = await supabase
        .from('car_wash_vendors').select('id').eq('user_id', user.id).single();
      if (!vendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const category = await this.service.deleteCategory(req.params.categoryId, vendor.id, user.id);
      return ResponseUtil.success(res, category, 'Category deactivated');
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PATCH /api/car-wash/vendor/services/:serviceId/category
   * Assign or unassign a service to a custom category.
   * Body: { categoryId: "uuid" } or { categoryId: null } to unassign
   */
  assignServiceCategory = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { categoryId } = req.body; // can be UUID string or null

    // Must explicitly send categoryId as a string UUID or null
    if (categoryId === undefined) {
      return ResponseUtil.badRequest(res, 'categoryId is required (send a UUID string to assign, or null to unassign)');
    }
    if (categoryId !== null && typeof categoryId !== 'string') {
      return ResponseUtil.badRequest(res, 'categoryId must be a UUID string or null');
    }

    try {
      const { data: vendor } = await supabase
        .from('car_wash_vendors').select('id').eq('user_id', user.id).single();
      if (!vendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      await this.service.assignServiceToCategory(
        req.params.serviceId, categoryId ?? null, vendor.id, user.id
      );
      return ResponseUtil.success(
        res,
        null,
        categoryId ? 'Service assigned to category' : 'Service unassigned from custom category'
      );
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
