import { Request, Response } from 'express';
import { CartService } from '../services/cart.service';
import { ResponseUtil } from '../utils/response.util';
import { AuthRequest } from '../middleware/auth.middleware';

export class CartController {
  // GET /api/spare-parts/cart
  getCart = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const cart   = await CartService.getCart(userId);
      return ResponseUtil.success(res, { cart });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // POST /api/spare-parts/cart/add
  // Body: { product_id, quantity }
  addItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId              = (req as AuthRequest).user!.id;
      const { product_id, quantity } = req.body;

      if (!product_id) {
        return ResponseUtil.badRequest(res, 'product_id is required');
      }
      const qty = parseInt(quantity) || 1;
      if (qty < 1) {
        return ResponseUtil.badRequest(res, 'quantity must be at least 1');
      }

      const result = await CartService.addItem(userId, product_id, qty);

      return ResponseUtil.success(
        res,
        {
          cart_item:      result.cartItem,
          cart_cleared:   result.cart_cleared,
          previous_store: result.previous_store ?? null,
        },
        result.cart_cleared
          ? `Previous cart from "${result.previous_store}" was cleared`
          : 'Item added to cart'
      );
    } catch (err: any) {
      if (err.message?.includes('not found'))    return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('not available')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // PUT /api/spare-parts/cart/update
  // Body: { cart_item_id, quantity }  — quantity 0 removes the item
  updateItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId                   = (req as AuthRequest).user!.id;
      const { cart_item_id, quantity } = req.body;

      if (!cart_item_id || quantity === undefined) {
        return ResponseUtil.badRequest(res, 'cart_item_id and quantity are required');
      }

      const item = await CartService.updateItem(userId, cart_item_id, parseInt(quantity));

      return ResponseUtil.success(
        res,
        { cart_item: item },
        item === null ? 'Item removed from cart' : 'Cart updated'
      );
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // DELETE /api/spare-parts/cart/remove
  // Body: { cart_item_id }
  removeItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId         = (req as AuthRequest).user!.id;
      const { cart_item_id } = req.body;

      if (!cart_item_id) {
        return ResponseUtil.badRequest(res, 'cart_item_id is required');
      }

      await CartService.removeItem(userId, cart_item_id);
      return ResponseUtil.success(res, null, 'Item removed from cart');
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  // DELETE /api/spare-parts/cart
  clearCart = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      await CartService.clearCart(userId);
      return ResponseUtil.success(res, null, 'Cart cleared');
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };
}
