import { Request, Response } from 'express';
import { CarWashServiceService } from '../services/car-wash-service.service';
import { ResponseUtil } from '../utils/response.util';
import { AuthRequest } from '../middleware/auth.middleware';
import { createWashServiceSchema, updateWashServiceSchema } from '../validators/service.validator';
import { supabase } from '../config/database';
import { logger } from '../config/logger';

export class ServiceController {
  private service = new CarWashServiceService();

  /**
   * GET /api/auto-wash/vendors/:vendorId/services
   * Public endpoint — list active services for a vendor.
   */
  getVendorServices = async (req: Request, res: Response): Promise<Response> => {
    try {
      const services = await this.service.getVendorServices(req.params.vendorId);
      return ResponseUtil.success(res, services);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-wash/services/:serviceId
   */
  getService = async (req: Request, res: Response): Promise<Response> => {
    try {
      const svc = await this.service.getServiceById(req.params.serviceId);
      return ResponseUtil.success(res, svc);
    } catch (err: any) {
      if (err.message === 'Service not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * POST /api/auto-wash/vendors/me/services
   */
  createService = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = createWashServiceSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const { data: myVendor } = await supabase
        .from('car_wash_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const svc = await this.service.createService(myVendor.id, user.id, value);
      return ResponseUtil.created(res, svc, 'Service created');
    } catch (err: any) {
      if (err.message.includes('approved')) return ResponseUtil.forbidden(res, err.message);
      logger.error('Create service error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PATCH /api/auto-wash/vendors/me/services/:serviceId
   */
  updateService = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = updateWashServiceSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const { data: myVendor } = await supabase
        .from('car_wash_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const svc = await this.service.updateService(req.params.serviceId, myVendor.id, user.id, value);
      return ResponseUtil.success(res, svc, 'Service updated');
    } catch (err: any) {
      if (err.message === 'Service not found or does not belong to this vendor')
        return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PATCH /api/car-wash/vendor/services/:serviceId/toggle
   * Toggle is_active on a service — activates if inactive, deactivates if active.
   * The service is NEVER deleted.
   */
  toggleService = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;

    try {
      const { data: myVendor } = await supabase
        .from('car_wash_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      // Read current state
      const { data: current } = await supabase
        .from('car_wash_services')
        .select('id, is_active')
        .eq('id', req.params.serviceId)
        .eq('vendor_id', myVendor.id)
        .single();

      if (!current) return ResponseUtil.notFound(res, 'Service not found');

      const newState = !(current as any).is_active;

      const { data, error } = await supabase
        .from('car_wash_services')
        .update({ is_active: newState, updated_at: new Date().toISOString() })
        .eq('id', req.params.serviceId)
        .select('*')
        .single();

      if (error) return ResponseUtil.serverError(res, error.message);

      return ResponseUtil.success(
        res,
        data,
        newState ? 'Service activated' : 'Service deactivated'
      );
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * DELETE /api/car-wash/vendor/services/:serviceId
   * @deprecated Use PATCH /services/:serviceId/toggle instead.
   * Kept for backward compatibility — deactivates service, does NOT delete it.
   */
  deleteService = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;

    try {
      const { data: myVendor } = await supabase
        .from('car_wash_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      await this.service.deleteService(req.params.serviceId, myVendor.id, user.id);
      return ResponseUtil.success(res, null, 'Service deactivated');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/auto-wash/vendors/me/services
   * Vendor's own services including inactive ones.
   */
  getMyServices = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;

    try {
      const { data: myVendor } = await supabase
        .from('car_wash_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const services = await this.service.getVendorServices(myVendor.id, true); // include inactive
      return ResponseUtil.success(res, services);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
