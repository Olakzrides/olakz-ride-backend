import { Request, Response } from 'express';
import { AddressService } from '../services/address.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class AddressController {
  list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const addresses = await AddressService.list(userId);
      return ResponseUtil.success(res, { addresses });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  create = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { label, address } = req.body;
      if (!label || !address) return ResponseUtil.badRequest(res, 'label and address are required');
      const addr = await AddressService.create(userId, req.body);
      return ResponseUtil.created(res, { address: addr }, 'Address saved');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  update = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const addr = await AddressService.update(userId, req.params.id, req.body);
      return ResponseUtil.success(res, { address: addr }, 'Address updated');
    } catch (err: any) {
      if (err.message === 'Address not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  delete = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      await AddressService.delete(userId, req.params.id);
      return ResponseUtil.success(res, null, 'Address deleted');
    } catch (err: any) {
      if (err.message === 'Address not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
