import { Request, Response } from 'express';
import { WishlistService } from '../services/wishlist.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class WishlistController {
  add = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { product_id } = req.body;
      if (!product_id) return ResponseUtil.badRequest(res, 'product_id is required');
      await WishlistService.add(userId, product_id);
      return ResponseUtil.success(res, null, 'Added to wishlist');
    } catch (err: any) {
      if (err.message === 'Product not found') return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  remove = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      await WishlistService.remove(userId, req.params.product_id);
      return ResponseUtil.success(res, null, 'Removed from wishlist');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  list = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const items = await WishlistService.list(userId);
      return ResponseUtil.success(res, { items });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
