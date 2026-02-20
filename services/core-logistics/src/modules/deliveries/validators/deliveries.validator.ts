/**
 * Delivery Request Validators
 * Validation schemas for delivery-related requests
 */

export class DeliveryValidator {
  /**
   * Validate phone number format
   */
  static validatePhoneNumber(phone: string): boolean {
    // Basic phone validation - adjust regex based on your requirements
    const phoneRegex = /^\+?[\d\s-()]{10,}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Validate location object
   */
  static validateLocation(location: any): { valid: boolean; error?: string } {
    if (!location) {
      return { valid: false, error: 'Location is required' };
    }

    if (typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
      return { valid: false, error: 'Location must have valid latitude and longitude' };
    }

    if (location.latitude < -90 || location.latitude > 90) {
      return { valid: false, error: 'Latitude must be between -90 and 90' };
    }

    if (location.longitude < -180 || location.longitude > 180) {
      return { valid: false, error: 'Longitude must be between -180 and 180' };
    }

    return { valid: true };
  }

  /**
   * Validate delivery type
   */
  static validateDeliveryType(type: string): boolean {
    return ['instant', 'scheduled'].includes(type);
  }

  /**
   * Validate payment method
   */
  static validatePaymentMethod(method: string): boolean {
    return ['cash', 'wallet', 'card'].includes(method);
  }

  /**
   * Validate scheduled pickup time
   */
  static validateScheduledTime(scheduledAt: string): { valid: boolean; error?: string } {
    const scheduledDate = new Date(scheduledAt);
    const now = new Date();

    if (isNaN(scheduledDate.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }

    // Must be in the future
    if (scheduledDate <= now) {
      return { valid: false, error: 'Scheduled time must be in the future' };
    }

    // Must be within 7 days
    const maxDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    if (scheduledDate > maxDate) {
      return { valid: false, error: 'Scheduled time cannot be more than 7 days in advance' };
    }

    // Must be at least 30 minutes from now
    const minDate = new Date(now.getTime() + 30 * 60 * 1000);
    if (scheduledDate < minDate) {
      return { valid: false, error: 'Scheduled time must be at least 30 minutes from now' };
    }

    return { valid: true };
  }

  /**
   * Validate authentication code format
   */
  static validateCodeFormat(code: string): boolean {
    // Format: GB1-A12-123 (3 segments, alphanumeric)
    const codeRegex = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
    return codeRegex.test(code);
  }

  /**
   * Validate package description length
   */
  static validatePackageDescription(description: string): { valid: boolean; error?: string } {
    if (description && description.length > 500) {
      return { valid: false, error: 'Package description cannot exceed 500 characters' };
    }
    return { valid: true };
  }

  /**
   * Validate create delivery request
   */
  static validateCreateDeliveryRequest(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate recipient name
    if (!data.recipientName || typeof data.recipientName !== 'string' || data.recipientName.trim().length === 0) {
      errors.push('Recipient name is required');
    }

    // Validate recipient phone
    if (!data.recipientPhone || !this.validatePhoneNumber(data.recipientPhone)) {
      errors.push('Valid recipient phone number is required');
    }

    // Validate pickup location
    const pickupValidation = this.validateLocation(data.pickupLocation);
    if (!pickupValidation.valid) {
      errors.push(`Pickup location: ${pickupValidation.error}`);
    }

    // Validate dropoff location
    const dropoffValidation = this.validateLocation(data.dropoffLocation);
    if (!dropoffValidation.valid) {
      errors.push(`Dropoff location: ${dropoffValidation.error}`);
    }

    // Validate vehicle type
    if (!data.vehicleTypeId || typeof data.vehicleTypeId !== 'string') {
      errors.push('Vehicle type ID is required');
    }

    // Validate delivery type
    if (!data.deliveryType || !this.validateDeliveryType(data.deliveryType)) {
      errors.push('Delivery type must be instant or scheduled');
    }

    // Validate scheduled time if scheduled delivery
    if (data.deliveryType === 'scheduled') {
      if (!data.scheduledPickupAt) {
        errors.push('Scheduled pickup time is required for scheduled deliveries');
      } else {
        const timeValidation = this.validateScheduledTime(data.scheduledPickupAt);
        if (!timeValidation.valid) {
          errors.push(timeValidation.error!);
        }
      }
    }

    // Validate payment method
    if (!data.paymentMethod || !this.validatePaymentMethod(data.paymentMethod)) {
      errors.push('Valid payment method is required (cash, wallet, or card)');
    }

    // Validate region ID
    if (!data.regionId || typeof data.regionId !== 'string') {
      errors.push('Region ID is required');
    }

    // Validate package description if provided
    if (data.packageDescription) {
      const descValidation = this.validatePackageDescription(data.packageDescription);
      if (!descValidation.valid) {
        errors.push(descValidation.error!);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
