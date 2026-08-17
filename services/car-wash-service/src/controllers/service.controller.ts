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
   * DELETE /api/auto-wash/vendors/me/services/:serviceId
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
