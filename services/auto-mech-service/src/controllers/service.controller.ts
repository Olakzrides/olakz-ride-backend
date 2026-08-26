import { Request, Response } from 'express';
import { AutoMechServiceService } from '../services/auto-mech-service.service';
import { ResponseUtil } from '../utils/response.util';
import { AuthRequest } from '../middleware/auth.middleware';
import { createMechServiceSchema, updateMechServiceSchema } from '../validators/service.validator';
import { supabase } from '../config/database';
import { logger } from '../config/logger';

export class ServiceController {
  private service = new AutoMechServiceService();

  /**
   * GET /api/auto-mech/vendors/:vendorId/services
   * Public — list active services for a vendor.
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
   * GET /api/auto-mech/services/:serviceId
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
   * POST /api/auto-mech/vendor/services  (dashboard)
   */
  createService = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = createMechServiceSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const { data: myVendor } = await supabase
        .from('auto_mech_vendors')
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
   * PATCH /api/auto-mech/vendor/services/:serviceId
   */
  updateService = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;
    const { error, value } = updateMechServiceSchema.validate(req.body, { abortEarly: false });
    if (error) return ResponseUtil.validationError(res, error.details.map((d) => d.message));

    try {
      const { data: myVendor } = await supabase
        .from('auto_mech_vendors')
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
   * PATCH /api/auto-mech/vendor/services/:serviceId/toggle
   * Toggle is_active — activates if inactive, deactivates if active.
   */
  toggleService = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;

    try {
      const { data: myVendor } = await supabase
        .from('auto_mech_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const { data: current } = await supabase
        .from('auto_mech_services')
        .select('id, is_active')
        .eq('id', req.params.serviceId)
        .eq('vendor_id', myVendor.id)
        .single();

      if (!current) return ResponseUtil.notFound(res, 'Service not found');

      const newState = !(current as any).is_active;

      const { data, error } = await supabase
        .from('auto_mech_services')
        .update({ is_active: newState, updated_at: new Date().toISOString() })
        .eq('id', req.params.serviceId)
        .select('*')
        .single();

      if (error) return ResponseUtil.serverError(res, error.message);

      const svc = this.service.mapRowPublic(data);

      return ResponseUtil.success(
        res,
        svc,
        newState ? 'Service activated' : 'Service deactivated'
      );
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * DELETE /api/auto-mech/vendor/services/:serviceId
   * Deactivates service (soft delete).
   */
  deleteService = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;

    try {
      const { data: myVendor } = await supabase
        .from('auto_mech_vendors')
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
   * GET /api/auto-mech/vendor/services
   * Vendor's own services including inactive ones.
   */
  getMyServices = async (req: Request, res: Response): Promise<Response> => {
    const user = (req as AuthRequest).user!;

    try {
      const { data: myVendor } = await supabase
        .from('auto_mech_vendors')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!myVendor) return ResponseUtil.notFound(res, 'Vendor profile not found');

      const services = await this.service.getVendorServices(myVendor.id, true);
      return ResponseUtil.success(res, services);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
