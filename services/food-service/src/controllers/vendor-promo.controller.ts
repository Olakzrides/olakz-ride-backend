import { Request, Response } from 'express';
import { VendorPromoService } from '../services/vendor-promo.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';
import { supabase } from '../config/database';
import logger from '../utils/logger';

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isValidationError(msg: string): boolean {
  return (
    msg.includes('required') || msg.includes('must be') ||
    msg.includes('between') || msg.includes('after') ||
    msg.includes('already exists') || msg.includes('Cannot') ||
    msg.includes('Only') || msg.includes('already') || msg.includes('ended')
  );
}

/**
 * Resolve the restaurant_id for the authenticated vendor.
 */
async function getRestaurantId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('food_restaurants')
    .select('id')
    .eq('owner_id', userId)
    .single();
  return data?.id ?? null;
}

export class VendorPromoController {

  /**
   * GET /api/vendor/promos
   * List all promo campaigns for this vendor's restaurant.
   */
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const restaurantId = await getRestaurantId(userId);
      if (!restaurantId) { ResponseUtil.notFound(res, 'Restaurant not found for this vendor'); return; }

      const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit  = Math.min(100, parseInt(req.query.limit as string) || 20);
      const status = req.query.status as string | undefined;

      const result = await VendorPromoService.getAll(restaurantId, { status, page, limit });
      ResponseUtil.success(res, result, 'Promo campaigns retrieved');
    } catch (err) {
      logger.error('vendor food getAll promos', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch promos');
    }
  };

  /**
   * GET /api/vendor/promos/:promoId
   */
  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const promo = await VendorPromoService.getById(req.params.promoId, userId);
      if (!promo) { ResponseUtil.notFound(res, 'Promo'); return; }
      ResponseUtil.success(res, { promo }, 'Promo retrieved');
    } catch (err) {
      ResponseUtil.serverError(res, 'Failed to fetch promo');
    }
  };

  /**
   * POST /api/vendor/promos
   * Body: { code, discount_percent, max_discount_amount?, min_order_amount?,
   *         total_uses_limit?, per_user_limit?, starts_at, ends_at }
   */
  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const restaurantId = await getRestaurantId(userId);
      if (!restaurantId) { ResponseUtil.notFound(res, 'Restaurant not found for this vendor'); return; }

      const {
        code, discount_percent, max_discount_amount, min_order_amount,
        total_uses_limit, per_user_limit, starts_at, ends_at,
      } = req.body;

      const promo = await VendorPromoService.create({
        vendorId:          userId,
        restaurantId,
        code,
        discountPercent:   discount_percent,
        maxDiscountAmount: max_discount_amount,
        minOrderAmount:    min_order_amount,
        totalUsesLimit:    total_uses_limit,
        perUserLimit:      per_user_limit,
        startsAt:          starts_at,
        endsAt:            ends_at,
      });

      ResponseUtil.created(res, { promo }, 'Promo created. It will activate automatically on the start date.');
    } catch (err) {
      const msg = toMessage(err);
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      logger.error('vendor food create promo', { error: msg });
      ResponseUtil.serverError(res, 'Failed to create promo');
    }
  };

  /**
   * PATCH /api/vendor/promos/:promoId
   */
  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const {
        discount_percent, max_discount_amount, min_order_amount,
        total_uses_limit, per_user_limit, starts_at, ends_at,
      } = req.body;

      const promo = await VendorPromoService.update(req.params.promoId, userId, {
        discountPercent:   discount_percent,
        maxDiscountAmount: max_discount_amount,
        minOrderAmount:    min_order_amount,
        totalUsesLimit:    total_uses_limit,
        perUserLimit:      per_user_limit,
        startsAt:          starts_at,
        endsAt:            ends_at,
      });
      ResponseUtil.success(res, { promo }, 'Promo updated');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to update promo');
    }
  };

  pause   = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const promo = await VendorPromoService.pause(req.params.promoId, userId);
      ResponseUtil.success(res, { promo }, 'Promo paused');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to pause promo');
    }
  };

  resume  = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const promo = await VendorPromoService.resume(req.params.promoId, userId);
      ResponseUtil.success(res, { promo }, 'Promo resumed');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to resume promo');
    }
  };

  end     = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const promo = await VendorPromoService.end(req.params.promoId, userId);
      ResponseUtil.success(res, { promo }, 'Promo ended permanently');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to end promo');
    }
  };

  delete  = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      await VendorPromoService.delete(req.params.promoId, userId);
      ResponseUtil.success(res, { deleted: true }, 'Promo deleted');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to delete promo');
    }
  };

  getUses = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit  = Math.min(100, parseInt(req.query.limit as string) || 20);
      const result = await VendorPromoService.getUses(req.params.promoId, userId, { page, limit });
      ResponseUtil.success(res, result, 'Promo uses retrieved');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      ResponseUtil.serverError(res, 'Failed to fetch promo uses');
    }
  };

  /**
   * POST /api/food/orders/validate-promo
   * Customer-facing: validate a code before placing an order.
   * Body: { code, restaurant_id, subtotal }
   */
  validatePromo = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { code, restaurant_id, subtotal } = req.body;

      if (!code)          { ResponseUtil.badRequest(res, 'code is required'); return; }
      if (!restaurant_id) { ResponseUtil.badRequest(res, 'restaurant_id is required'); return; }
      if (!subtotal || subtotal <= 0) { ResponseUtil.badRequest(res, 'subtotal must be positive'); return; }

      const result = await VendorPromoService.validateCode({
        code,
        storeRef:    restaurant_id,
        serviceType: 'food',
        customerId:  userId,
        subtotal:    parseFloat(subtotal),
      });

      if (!result.valid) {
        ResponseUtil.badRequest(res, result.message);
        return;
      }

      ResponseUtil.success(res, {
        promo_id:        result.promoId,
        discount_amount: result.discountAmount,
        discount_percent: result.discountPercent,
        message:         result.message,
      }, 'Promo code applied');
    } catch (err) {
      ResponseUtil.serverError(res, 'Failed to validate promo code');
    }
  };
}
