import { Request, Response } from 'express';
import { InternalService } from '../services/internal.service';
import { ResponseUtil } from '../utils/response';

export class InternalController {
  provisionVendor = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { owner_id, vendor_id, business_name, address } = req.body;
      if (!owner_id || !vendor_id || !business_name || !address) {
        return ResponseUtil.badRequest(res, 'owner_id, vendor_id, business_name and address are required');
      }
      const store = await InternalService.provisionVendor(req.body);
      return ResponseUtil.created(res, { store }, 'Marketplace store provisioned');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
