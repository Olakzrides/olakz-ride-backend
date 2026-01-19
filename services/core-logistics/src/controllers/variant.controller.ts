import { Request, Response } from 'express';
import { VariantService } from '../services/variant.service';
import { ResponseUtil } from '../utils/response.util';
import { logger } from '../config/logger';

export class VariantController {
  private variantService: VariantService;

  constructor() {
    this.variantService = new VariantService();
  }

  /**
   * Get all active variants
   * GET /api/variants
   */
  getActiveVariants = async (_req: Request, res: Response): Promise<Response> => {
    try {
      const variants = await this.variantService.getActiveVariants();

      return ResponseUtil.success(res, {
        variants,
      });
    } catch (error) {
      logger.error('Get active variants error:', error);
      return ResponseUtil.serverError(res, 'Failed to get variants');
    }
  };

  /**
   * Get ride product by handle
   * GET /api/products/:handle
   */
  getRideProductByHandle = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { handle } = req.params;

      const product = await this.variantService.getRideProductByHandle(handle);

      return ResponseUtil.success(res, {
        product,
      });
    } catch (error) {
      logger.error('Get ride product by handle error:', error);
      return ResponseUtil.serverError(res, 'Failed to get product');
    }
  };

  /**
   * Get variant by ID
   * GET /api/variants/:variantId
   */
  getVariant = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { variantId } = req.params;

      const variant = await this.variantService.getVariant(variantId);

      if (!variant) {
        return ResponseUtil.notFound(res, 'Variant not found');
      }

      return ResponseUtil.success(res, {
        variant,
      });
    } catch (error) {
      logger.error('Get variant error:', error);
      return ResponseUtil.serverError(res, 'Failed to get variant');
    }
  };
}
