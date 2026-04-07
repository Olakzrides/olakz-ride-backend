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
      const { product_id, quantity = 1 } = req.body;
      if (!product_id) return ResponseUtil.badRequest(res, 'product_id is required');
      const result = await CartService.addItem(userId, product_id, quantity);
      return ResponseUtil.success(res, result, 'Item added to cart');
    } catch (err: any) {
      if (err.message === 'Product not found') return ResponseUtil.notFound(res, err.message);
      if (err.message?.includes('not available')) return ResponseUtil.badRequest(res, err.message);
      return ResponseUtil.serverError(res, err.message);
    }
  };

  updateItem = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as AuthRequest).user!.id;
      const { cart_item_id, quantity } = req.body;
      if (!cart_item_id || quantity === undefined) return ResponseUtil.badRequest(res, 'cart_item_id and quantity are required');
      const item = await CartService.updateItem(userId, cart_item_id, quantity);
      return ResponseUtil.success(res, { cart_item: item }, 'Cart updated');
    } catch (err: any) {
      if (err.message?.includes('not found')) return ResponseUtil.notFound(res, err.message);
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
