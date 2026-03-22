import { Request, Response } from 'express';
import { CartService } from '../services/cart.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../middleware/auth.middleware';

export class CartController {
  getCart = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const cart = await CartService.getCart(userId);
      if (!cart) return ResponseUtil.success(res, { cart: null, message: 'Cart is empty' });
      return ResponseUtil.success(res, { cart });
    } catch (err: any) {
      return ResponseUtil.serverError(res, err.message);
    }
  };

  addItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { item_id, quantity = 1, extras, special_instructions } = req.body;

      if (!item_id) return ResponseUtil.badRequest(res, 'item_id is required');
      if (quantity < 1) return ResponseUtil.badRequest(res, 'quantity must be at least 1');

      const cartItem = await CartService.addItem({
        userId,
        itemId: item_id,
        quantity,
        selectedExtras: extras,
        specialInstructions: special_instructions,
      });

      return ResponseUtil.success(res, { cart_item: cartItem }, 'Item added to cart');
    } catch (err: any) {
      if (err.message === 'Item not found') return ResponseUtil.notFound(res, err.message);
      if (err.message === 'Item is not available') return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  updateItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { cart_item_id, quantity } = req.body;

      if (!cart_item_id) return ResponseUtil.badRequest(res, 'cart_item_id is required');
      if (quantity === undefined) return ResponseUtil.badRequest(res, 'quantity is required');

      const result = await CartService.updateItem({ userId, cartItemId: cart_item_id, quantity });
      return ResponseUtil.success(res, { cart_item: result }, 'Cart updated');
    } catch (err: any) {
      if (err.message === 'Unauthorized') return ResponseUtil.forbidden(res);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  removeItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { cart_item_id } = req.query;

      if (!cart_item_id) return ResponseUtil.badRequest(res, 'cart_item_id is required');

      await CartService.removeItem(userId, cart_item_id as string);
      return ResponseUtil.success(res, null, 'Item removed from cart');
    } catch (err: any) {
      if (err.message === 'Unauthorized') return ResponseUtil.forbidden(res);
      return ResponseUtil.serverError(res, err.message);
    }
  };

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
