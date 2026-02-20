import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';

/**
 * AuthCodeService
 * Generates and validates unique authentication codes for delivery pickups and deliveries
 * Format: GB1-A12-123 (3 segments, alphanumeric)
 */
export class AuthCodeService {
  private static readonly CODE_LENGTH = 11; // Including dashes
  private static readonly SEGMENT_LENGTHS = [3, 3, 3];
  private static readonly CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars (0, O, 1, I)

  /**
   * Generate a random segment of specified length
   */
  private static generateSegment(length: number): string {
    let segment = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * this.CHARACTERS.length);
      segment += this.CHARACTERS[randomIndex];
    }
    return segment;
  }

  /**
   * Generate a unique authentication code
   * Format: GB1-A12-123
   */
  public static async generateUniqueCode(type: 'pickup' | 'delivery'): Promise<string> {
    let code: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      // Generate code with 3 segments
      const segments = this.SEGMENT_LENGTHS.map(length => this.generateSegment(length));
      code = segments.join('-');

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

      isUnique = !data; // Code is unique if no record found
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
   * Validate code format
   */
  public static validateCodeFormat(code: string): boolean {
    // Check length
    if (code.length !== this.CODE_LENGTH) {
      return false;
    }

    // Check format: XXX-XXX-XXX
    const segments = code.split('-');
    if (segments.length !== 3) {
      return false;
    }

    // Check each segment length
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].length !== this.SEGMENT_LENGTHS[i]) {
        return false;
      }

      // Check if all characters are valid
      for (const char of segments[i]) {
        if (!this.CHARACTERS.includes(char)) {
          return false;
        }
      }
    }

    return true;
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
