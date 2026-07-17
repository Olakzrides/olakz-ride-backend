import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';

/**
 * AuthCodeService
 * Generates and validates unique authentication codes for delivery pickups and deliveries.
 * Format: 4-digit numeric code (e.g. 3847)
 */
export class AuthCodeService {

  /**
   * Generate a 4-digit numeric code
   */
  private static generateRawCode(): string {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Generate a unique 4-digit code for pickup or delivery
   */
  public static async generateUniqueCode(type: 'pickup' | 'delivery'): Promise<string> {
    let code: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      code = this.generateRawCode();

      // Check uniqueness in database
      const columnName = type === 'pickup' ? 'pickup_code' : 'delivery_code';

      const { data, error } = await supabase
        .from('deliveries')
        .select('id')
        .eq(columnName, code)
        .maybeSingle();

      if (error) {
        logger.error(`Error checking code uniqueness:`, error);
        throw new Error('Failed to generate unique code');
      }

      isUnique = !data;
      attempts++;

      if (!isUnique) {
        logger.warn(`Code collision detected for ${type} code: ${code}. Regenerating...`);
      }
    }

    if (!isUnique) {
      throw new Error(`Failed to generate unique ${type} code after ${maxAttempts} attempts`);
    }

    logger.info(`Generated unique ${type} code: ${code!}`);
    return code!;
  }

  /**
   * Generate both pickup and delivery codes for a new delivery
   */
  public static async generateDeliveryCodes(): Promise<{
    pickupCode: string;
    deliveryCode: string;
  }> {
    const [pickupCode, deliveryCode] = await Promise.all([
      this.generateUniqueCode('pickup'),
      this.generateUniqueCode('delivery'),
    ]);

    return { pickupCode, deliveryCode };
  }

  /**
   * Validate code format — must be exactly 4 numeric digits
   */
  public static validateCodeFormat(code: string): boolean {
    return /^\d{4}$/.test(code);
  }

  /**
   * Verify pickup code for a delivery
   */
  public static async verifyPickupCode(
    deliveryId: string,
    providedCode: string
  ): Promise<boolean> {
    try {
      // Validate format first
      if (!this.validateCodeFormat(providedCode)) {
        return false;
      }

      // Get delivery
      const { data: delivery, error } = await supabase
        .from('deliveries')
        .select('id, pickup_code, pickup_code_verified_at, status')
        .eq('id', deliveryId)
        .single();

      if (error || !delivery) {
        logger.error(`Delivery not found: ${deliveryId}`, error);
        return false;
      }

      // Check if already verified
      if (delivery.pickup_code_verified_at) {
        return false;
      }

      // Verify code matches
      if (delivery.pickup_code !== providedCode) {
        logger.warn(`Invalid pickup code attempt for delivery ${deliveryId}`);
        return false;
      }

      // Update verification timestamp
      const { error: updateError } = await supabase
        .from('deliveries')
        .update({
          pickup_code_verified_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      if (updateError) {
        logger.error(`Failed to update pickup verification:`, updateError);
        return false;
      }

      logger.info(`Pickup code verified successfully for delivery ${deliveryId}`);
      return true;
    } catch (error) {
      logger.error(`Error verifying pickup code:`, error);
      return false;
    }
  }

  /**
   * Verify delivery code for a delivery
   */
  public static async verifyDeliveryCode(
    deliveryId: string,
    providedCode: string
  ): Promise<boolean> {
    try {
      // Validate format first
      if (!this.validateCodeFormat(providedCode)) {
        return false;
      }

      // Get delivery
      const { data: delivery, error } = await supabase
        .from('deliveries')
        .select('id, delivery_code, delivery_code_verified_at, pickup_code_verified_at, status')
        .eq('id', deliveryId)
        .single();

      if (error || !delivery) {
        logger.error(`Delivery not found: ${deliveryId}`, error);
        return false;
      }

      // Check if pickup was verified first
      if (!delivery.pickup_code_verified_at) {
        return false;
      }

      // Check if already verified
      if (delivery.delivery_code_verified_at) {
        return false;
      }

      // Verify code matches
      if (delivery.delivery_code !== providedCode) {
        logger.warn(`Invalid delivery code attempt for delivery ${deliveryId}`);
        return false;
      }

      // Update verification timestamp
      const { error: updateError } = await supabase
        .from('deliveries')
        .update({
          delivery_code_verified_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      if (updateError) {
        logger.error(`Failed to update delivery verification:`, updateError);
        return false;
      }

      logger.info(`Delivery code verified successfully for delivery ${deliveryId}`);
      return true;
    } catch (error) {
      logger.error(`Error verifying delivery code:`, error);
      return false;
    }
  }

  /**
   * Check if a code has expired (optional - for future use)
   * Codes expire after delivery completion or cancellation
   */
  public static async isCodeExpired(code: string, type: 'pickup' | 'delivery'): Promise<boolean> {
    const columnName = type === 'pickup' ? 'pickup_code' : 'delivery_code';
    
    const { data, error } = await supabase
      .from('deliveries')
      .select('status, delivered_at, cancelled_at')
      .eq(columnName, code)
      .maybeSingle();

    if (error || !data) {
      return true; // Consider expired if not found
    }

    // Code is expired if delivery is completed or cancelled
    return data.status === 'delivered' || data.status === 'cancelled';
  }
}
