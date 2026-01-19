import { supabase } from '../config/database';
import { logger } from '../config/logger';

export class VariantService {
  /**
   * Get ride product with variants
   */
  async getRideProduct(productId: string): Promise<any> {
    try {
      const { data: product, error: productError } = await supabase
        .from('ride_products')
        .select('*')
        .eq('id', productId)
        .eq('is_active', true)
        .single();

      if (productError) throw productError;

      // Get variants for this product
      const { data: variants, error: variantsError } = await supabase
        .from('ride_variants')
        .select('*, vehicle_type:vehicle_types(*)')
        .eq('product_id', productId)
        .eq('is_active', true)
        .order('base_price');

      if (variantsError) throw variantsError;

      return {
        ...product,
        variants: variants || [],
      };
    } catch (error) {
      logger.error('Get ride product error:', error);
      throw error;
    }
  }

  /**
   * Get variant by ID
   */
  async getVariant(variantId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('ride_variants')
        .select('*, vehicle_type:vehicle_types(*), product:ride_products(*)')
        .eq('id', variantId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      logger.error('Get variant error:', error);
      throw error;
    }
  }

  /**
   * Get all active variants
   */
  async getActiveVariants(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('ride_variants')
        .select('*, vehicle_type:vehicle_types(*), product:ride_products(*)')
        .eq('is_active', true)
        .order('base_price');

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Get active variants error:', error);
      throw error;
    }
  }

  /**
   * Get ride product by handle
   */
  async getRideProductByHandle(handle: string): Promise<any> {
    try {
      const { data: product, error: productError } = await supabase
        .from('ride_products')
        .select('*')
        .eq('handle', handle)
        .eq('is_active', true)
        .single();

      if (productError) throw productError;

      // Get variants for this product
      const { data: variants, error: variantsError } = await supabase
        .from('ride_variants')
        .select('*, vehicle_type:vehicle_types(*)')
        .eq('product_id', product.id)
        .eq('is_active', true)
        .order('base_price');

      if (variantsError) throw variantsError;

      return {
        ...product,
        variants: variants || [],
      };
    } catch (error) {
      logger.error('Get ride product by handle error:', error);
      throw error;
    }
  }
}
