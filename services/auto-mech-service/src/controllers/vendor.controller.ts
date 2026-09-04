import { Request, Response } from 'express';
import { VendorService } from '../services/vendor.service';
import { ReviewService } from '../services/review.service';
import { CategoryService } from '../services/category.service';
import { ResponseUtil } from '../utils/response.util';
import { StorageUtil } from '../utils/storage.util';
import { AuthRequest } from '../middleware/auth.middleware';
import { createVendorSchema, updateVendorSchema } from '../validators/vendor.validator';
import { searchVendorsSchema } from '../validators/booking.validator';
import { logger } from '../config/logger';

export class VendorController {
  private vendorService  = new VendorService();
  private reviewService  = new ReviewService();
  private categoryService = new CategoryService();

  // ── Customer/Public endpoints ────────────────────────────────

  /**
   * GET /api/auto-mech/vendors/search
   */
  searchVendors = async (req: Request, res: Response): Promise<Response> => {
    const { error, value } = searchVendorsSchema.validate(req.query, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const result = await this.vendorService.searchVendors(value);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      logger.error('Search vendors error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/top-rated
   */
  getTopRatedVendors = async (req: Request, res: Response): Promise<Response> => {
    const { latitude, longitude, limit } = req.query as any;
    if (!latitude || !longitude) {
      return ResponseUtil.badRequest(res, 'latitude and longitude are required');
    }

    try {
      const vendors = await this.vendorService.getTopRatedVendors(
        parseFloat(latitude),
        parseFloat(longitude),
        limit ? parseInt(limit, 10) : 10
      );
      return ResponseUtil.success(res, vendors);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/:vendorId
   */
  getVendorProfile = async (req: Request, res: Response): Promise<Response> => {
    try {
      const vendor = await this.vendorService.getVendorById(req.params.vendorId);
      return ResponseUtil.success(res, vendor);
    } catch (err: any) {
      if (err.message === 'Vendor not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/:vendorId/reviews
   */
  getVendorReviews = async (req: Request, res: Response): Promise<Response> => {
    const page  = parseInt((req.query.page  as string) || '1',  10);
    const limit = parseInt((req.query.limit as string) || '10', 10);

    try {
      const [reviews, summary] = await Promise.all([
        this.reviewService.getVendorReviews(req.params.vendorId, page, limit),
        this.reviewService.getVendorRatingSummary(req.params.vendorId),
      ]);
      return ResponseUtil.success(res, { ...reviews, summary });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/:vendorId/categories
   * Public — returns this vendor's categories (system + custom) with their
   * active services nested inside. Used for the category tabs on the vendor
   * profile screen so customers can browse services by category.
   */
  getVendorCategories = async (req: Request, res: Response): Promise<Response> => {
    try {
      const categories = await this.categoryService.getVendorCategoriesForCustomer(req.params.vendorId);
      return ResponseUtil.success(res, categories);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendor/reviews  (vendor reads their own reviews)
   */
  getMyReviews = async (req: Request, res: Response): Promise<Response> => {
    const user  = (req as AuthRequest).user!;
    const page  = parseInt((req.query.page  as string) || '1',  10);
    const limit = parseInt((req.query.limit as string) || '10', 10);

    try {
      const { data: myVendor } = await (await import('../config/database')).supabase
        .from('auto_mech_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const [reviews, summary] = await Promise.all([
        this.reviewService.getVendorReviews(myVendor.id, page, limit),
        this.reviewService.getVendorRatingSummary(myVendor.id),
      ]);
      return ResponseUtil.success(res, { ...reviews, summary });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── Vendor owner endpoints ────────────────────────────────────

  /**
   * POST /api/auto-mech/vendors/register
   */
  registerVendor = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = createVendorSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const vendor = await this.vendorService.createVendor(user.id, value);
      return ResponseUtil.created(res, vendor, 'Vendor registered successfully. Awaiting admin approval.');
    } catch (err: any) {
      if (err.message.includes('already have')) return ResponseUtil.conflict(res, err.message);
      logger.error('Register vendor error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendors/me
   */
  getMyVendorProfile = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const vendor = await this.vendorService.getMyVendorProfile(user.id);
      return ResponseUtil.success(res, vendor);
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PATCH /api/auto-mech/vendors/me
   */
  updateMyVendorProfile = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = updateVendorSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const { data: myVendor } = await (await import('../config/database')).supabase
        .from('auto_mech_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const vendor = await this.vendorService.updateVendor(myVendor.id, user.id, value);
      return ResponseUtil.success(res, vendor, 'Vendor profile updated');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/auto-mech/vendors/me/images
   */
  uploadVendorImages = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;

    try {
      const { data: myVendor } = await (await import('../config/database')).supabase
        .from('auto_mech_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const updates: { coverImageUrl?: string; logoUrl?: string } = {};

      if (files?.cover?.[0]) {
        const { url } = await StorageUtil.uploadFile(files.cover[0], `vendors/${myVendor.id}/cover`);
        updates.coverImageUrl = url;
      }
      if (files?.logo?.[0]) {
        const { url } = await StorageUtil.uploadFile(files.logo[0], `vendors/${myVendor.id}/logo`);
        updates.logoUrl = url;
      }

      if (Object.keys(updates).length === 0) {
        return ResponseUtil.badRequest(res, 'No images provided (use "cover" or "logo" field)');
      }

      const vendor = await this.vendorService.updateVendorImages(myVendor.id, user.id, updates);
      return ResponseUtil.success(res, vendor, 'Images updated');
    } catch (err: any) {
      logger.error('Upload vendor images error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // ── Vendor Dashboard endpoints ─────────────────────────────────────────────

  /**
   * GET /api/auto-mech/vendor/store-details
   */
  getStoreDetails = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const details = await this.vendorService.getStoreDetails(user.id);
      return ResponseUtil.success(res, { store_details: details });
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PUT /api/auto-mech/vendor/store-details
   */
  updateStoreDetails = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const details = await this.vendorService.updateStoreDetails(user.id, req.body);
      return ResponseUtil.success(res, { store_details: details }, 'Store details updated');
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PATCH /api/auto-mech/vendor/store-details/toggle
   * Toggle is_open on/off — body: { is_open: boolean }
   * Single-purpose endpoint so the vendor app just needs to send { is_open: true/false }
   */
  toggleStoreOpen = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { is_open } = req.body;
    if (is_open === undefined) {
      return ResponseUtil.badRequest(res, 'is_open is required (true or false)');
    }
    try {
      const details = await this.vendorService.updateStoreDetails(user.id, { is_open: Boolean(is_open) });
      return ResponseUtil.success(
        res,
        { is_open: details.is_open },
        `Shop is now ${details.is_open ? 'open' : 'closed'}`
      );
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendor/store-operations
   */
  getStoreOperations = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const ops = await this.vendorService.getStoreOperations(user.id);
      return ResponseUtil.success(res, { store_operations: ops });
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PUT /api/auto-mech/vendor/store-operations
   */
  updateStoreOperations = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const ops = await this.vendorService.updateStoreOperations(user.id, req.body);
      return ResponseUtil.success(res, { store_operations: ops }, 'Store operations updated');
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-mech/vendor/statistics
   */
  getStatistics = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    try {
      const stats = await this.vendorService.getStatistics(user.id);
      return ResponseUtil.success(res, { statistics: stats });
    } catch (err: any) {
      if (err.message.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
