import { Request, Response } from 'express';
import { VendorRegistrationService } from '../services/vendor-registration.service';
import ResponseUtil from '../utils/response';
import logger from '../utils/logger';

interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

const VALID_BUSINESS_TYPES = ['restaurant', 'marketplace', 'carwash', 'mechanics'];

export class VendorRegistrationController {
  /**
   * POST /api/vendor/register
   */
  register = async (req: AuthRequest, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.id;
      const { business_name, business_type, email, phone, gender, city, state, address, service_type } = req.body;

      if (!business_name || !business_type || !email || !phone) {
        return ResponseUtil.error(res, 'business_name, business_type, email, and phone are required', 400);
      }

      if (!VALID_BUSINESS_TYPES.includes(business_type)) {
        return ResponseUtil.error(res, `business_type must be one of: ${VALID_BUSINESS_TYPES.join(', ')}`, 400);
      }

      const vendor = await VendorRegistrationService.register({
        userId, business_name, business_type, email, phone, gender, city, state, address, service_type,
      });

      return ResponseUtil.success(res, 'Registration submitted successfully', { vendor }, 201);
    } catch (err: any) {
      if (err.message?.includes('already')) return ResponseUtil.error(res, err.message, 400);
      logger.error('Vendor register error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PUT /api/vendor/register/documents
   */
  submitDocuments = async (req: AuthRequest, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.id;
      const { logo_url, profile_picture_url, nin_number, cac_document_url, store_images } = req.body;

      const vendor = await VendorRegistrationService.submitDocuments({
        userId, logo_url, profile_picture_url, nin_number, cac_document_url, store_images,
      });

      return ResponseUtil.success(res, 'Documents submitted successfully', { vendor });
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      logger.error('Vendor documents error:', err);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/vendor/register/status
   */
  getStatus = async (req: AuthRequest, res: Response): Promise<Response> => {
    try {
      const status = await VendorRegistrationService.getStatus(req.user!.id);
      if (!status) return ResponseUtil.notFound(res, 'No registration found');
      return ResponseUtil.success(res, 'Status retrieved', { status });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/vendor/register/upload-url?file_type=logo&file_name=logo.jpg
   */
  getUploadUrl = async (req: AuthRequest, res: Response): Promise<Response> => {
    try {
      const userId = req.user!.id;
      const { file_type, file_name } = req.query as { file_type: string; file_name: string };

      if (!file_type || !file_name) {
        return ResponseUtil.error(res, 'file_type and file_name are required', 400);
      }

      const signedUrl = await VendorRegistrationService.getSignedUploadUrl(userId, file_type, file_name);
      return ResponseUtil.success(res, 'Upload URL generated', { signed_url: signedUrl, file_type, file_name });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * GET /api/vendor/admin/vendors  (admin)
   */
  adminGetAll = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { status, business_type, page, limit } = req.query;
      const result = await VendorRegistrationService.adminGetAll({
        status: status as string,
        business_type: business_type as string,
        page: page ? parseInt(page as string) : 1,
        limit: limit ? parseInt(limit as string) : 20,
      });
      return ResponseUtil.success(res, 'Vendors retrieved', result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PUT /api/vendor/admin/vendors/:id/approve  (admin)
   */
  adminApprove = async (req: Request, res: Response): Promise<Response> => {
    try {
      const adminId = (req as any).user!.id;
      const vendor = await VendorRegistrationService.adminApprove(req.params.id, adminId);
      return ResponseUtil.success(res, 'Vendor approved', { vendor });
    } catch (err: any) {
      if (err.message === 'Vendor not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  /**
   * PUT /api/vendor/admin/vendors/:id/reject  (admin)
   */
  adminReject = async (req: Request, res: Response): Promise<Response> => {
    try {
      const adminId = (req as any).user!.id;
      const { reason } = req.body;
      if (!reason) return ResponseUtil.error(res, 'reason is required', 400);
      const vendor = await VendorRegistrationService.adminReject(req.params.id, adminId, reason);
      return ResponseUtil.success(res, 'Vendor rejected', { vendor });
    } catch (err: any) {
      if (err.message === 'Vendor not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
