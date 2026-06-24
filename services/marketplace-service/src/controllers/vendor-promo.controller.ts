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
    msg.includes('required') || msg.includes('must be') || msg.includes('between') ||
    msg.includes('after') || msg.includes('already exists') || msg.includes('Cannot') ||
    msg.includes('Only') || msg.includes('already') || msg.includes('ended')
  );
}

async function getStoreId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('marketplace_stores')
    .select('id')
    .eq('owner_id', userId)
    .single();
  return data?.id ?? null;
}

export class VendorPromoController {

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId  = (req as AuthRequest).user!.id;
      const storeId = await getStoreId(userId);
      if (!storeId) { ResponseUtil.notFound(res, 'Marketplace store not found for this vendor'); return; }

      const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit  = Math.min(100, parseInt(req.query.limit as string) || 20);
      const status = req.query.status as string | undefined;

      const result = await VendorPromoService.getAll(storeId, { status, page, limit });
      ResponseUtil.success(res, result, 'Promo campaigns retrieved');
    } catch (err) {
      logger.error('vendor marketplace getAll promos', { error: toMessage(err) });
      ResponseUtil.serverError(res, 'Failed to fetch promos');
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const promo  = await VendorPromoService.getById(req.params.promoId, userId);
      if (!promo) { ResponseUtil.notFound(res, 'Promo'); return; }
      ResponseUtil.success(res, { promo }, 'Promo retrieved');
    } catch (err) {
      ResponseUtil.serverError(res, 'Failed to fetch promo');
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId  = (req as AuthRequest).user!.id;
      const storeId = await getStoreId(userId);
      if (!storeId) { ResponseUtil.notFound(res, 'Marketplace store not found for this vendor'); return; }

      const {
        code, discount_percent, max_discount_amount, min_order_amount,
        total_uses_limit, per_user_limit, starts_at, ends_at,
      } = req.body;

      const promo = await VendorPromoService.create({
        vendorId: userId, storeId,
        code, discountPercent: discount_percent,
        maxDiscountAmount: max_discount_amount, minOrderAmount: min_order_amount,
        totalUsesLimit: total_uses_limit, perUserLimit: per_user_limit,
        startsAt: starts_at, endsAt: ends_at,
      });

      ResponseUtil.created(res, { promo }, 'Promo created. It will activate automatically on the start date.');
    } catch (err) {
      const msg = toMessage(err);
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      logger.error('vendor marketplace create promo', { error: msg });
      ResponseUtil.serverError(res, 'Failed to create promo');
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { discount_percent, max_discount_amount, min_order_amount, total_uses_limit, per_user_limit, starts_at, ends_at } = req.body;
      const promo = await VendorPromoService.update(req.params.promoId, userId, {
        discountPercent: discount_percent, maxDiscountAmount: max_discount_amount,
        minOrderAmount: min_order_amount, totalUsesLimit: total_uses_limit,
        perUserLimit: per_user_limit, startsAt: starts_at, endsAt: ends_at,
      });
      ResponseUtil.success(res, { promo }, 'Promo updated');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to update promo');
    }
  };

  pause = async (req: Request, res: Response): Promise<void> => {
    try {
      const promo = await VendorPromoService.pause(req.params.promoId, (req as AuthRequest).user!.id);
      ResponseUtil.success(res, { promo }, 'Promo paused');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to pause promo');
    }
  };

  resume = async (req: Request, res: Response): Promise<void> => {
    try {
      const promo = await VendorPromoService.resume(req.params.promoId, (req as AuthRequest).user!.id);
      ResponseUtil.success(res, { promo }, 'Promo resumed');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to resume promo');
    }
  };

  end = async (req: Request, res: Response): Promise<void> => {
    try {
      const promo = await VendorPromoService.end(req.params.promoId, (req as AuthRequest).user!.id);
      ResponseUtil.success(res, { promo }, 'Promo ended permanently');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      if (isValidationError(msg)) { ResponseUtil.badRequest(res, msg); return; }
      ResponseUtil.serverError(res, 'Failed to end promo');
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      await VendorPromoService.delete(req.params.promoId, (req as AuthRequest).user!.id);
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
      const page   = Math.max(1, parseInt(req.query.page  as string) || 1);
      const limit  = Math.min(100, parseInt(req.query.limit as string) || 20);
      const result = await VendorPromoService.getUses(req.params.promoId, (req as AuthRequest).user!.id, { page, limit });
      ResponseUtil.success(res, result, 'Promo uses retrieved');
    } catch (err) {
      const msg = toMessage(err);
      if (msg === 'Promo not found') { ResponseUtil.notFound(res, 'Promo'); return; }
      ResponseUtil.serverError(res, 'Failed to fetch promo uses');
    }
  };

  /**
   * POST /api/marketplace/orders/validate-promo
   * Customer-facing: validate a code before placing an order.
   * Body: { code, store_id, subtotal }
   */
  validatePromo = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { code, store_id, subtotal } = req.body;

      if (!code)     { ResponseUtil.badRequest(res, 'code is required'); return; }
      if (!store_id) { ResponseUtil.badRequest(res, 'store_id is required'); return; }
      if (!subtotal || subtotal <= 0) { ResponseUtil.badRequest(res, 'subtotal must be positive'); return; }

      const result = await VendorPromoService.validateCode({
        code,
        storeId:    store_id,
        customerId: userId,
        subtotal:   parseFloat(subtotal),
      });

      if (!result.valid) {
        ResponseUtil.badRequest(res, result.message);
        return;
      }

      ResponseUtil.success(res, {
        promo_id:         result.promoId,
        discount_amount:  result.discountAmount,
        discount_percent: result.discountPercent,
        message:          result.message,
      }, 'Promo code applied');
    } catch (err) {
      ResponseUtil.serverError(res, 'Failed to validate promo code');
    }
  };
}
