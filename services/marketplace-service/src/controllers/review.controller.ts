import { Request, Response } from 'express';
import { ReviewService } from '../services/review.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class ReviewController {
  submitReview = async (req: Request, res: Response): Promise<Response> => {
    try {
      const customerId = (req as AuthRequest).user!.id;
      const { store_rating, comment, product_ratings } = req.body;
      if (!store_rating) return ResponseUtil.badRequest(res, 'store_rating is required');
      const review = await ReviewService.submitReview(req.params.id, customerId, store_rating, comment, product_ratings || []);
      return ResponseUtil.created(res, { review }, 'Review submitted');
    } catch (err: any) {
      if (err.message === 'Order not found') return ResponseUtil.notFound(res, err.message);
      if (err.message === 'Unauthorized') return ResponseUtil.forbidden(res, err.message);
      if (err.message?.includes('already submitted') || err.message?.includes('Can only review'))
        return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getStoreReviews = async (req: Request, res: Response): Promise<Response> => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const page = parseInt(req.query.page as string) || 1;
      const result = await ReviewService.getStoreReviews(req.params.id, limit, page);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  getProductReviews = async (req: Request, res: Response): Promise<Response> => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const page = parseInt(req.query.page as string) || 1;
      const result = await ReviewService.getProductReviews(req.params.id, limit, page);
      return ResponseUtil.success(res, result);
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
