import { logger } from '../../../config/logger';

export interface ScheduledDeliveryValidation {
  isValid: boolean;
  error?: string;
  scheduledFor?: Date;
}

/**
 * ScheduledDeliveryService
 * Validates and manages scheduled delivery bookings
 */
export class ScheduledDeliveryService {
  private static readonly MIN_ADVANCE_HOURS = 1; // Minimum 1 hour advance booking
  private static readonly MAX_ADVANCE_DAYS = 7; // Maximum 7 days advance booking

  /**
   * Validate scheduled delivery date/time
   */
  static validateScheduledTime(scheduledFor: string | Date): ScheduledDeliveryValidation {
    try {
      const scheduledDate = new Date(scheduledFor);
      const now = new Date();

      // Check if date is valid
      if (isNaN(scheduledDate.getTime())) {
        return {
          isValid: false,
          error: 'Invalid date format',
        };
      }

      // Check if date is in the past
      if (scheduledDate <= now) {
        return {
          isValid: false,
          error: 'Scheduled time must be in the future',
        };
      }

      // Calculate time difference in hours
      const hoursDifference = (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Check minimum advance booking time
      if (hoursDifference < this.MIN_ADVANCE_HOURS) {
        return {
          isValid: false,
          error: `Scheduled delivery must be at least ${this.MIN_ADVANCE_HOURS} hour(s) in advance`,
        };
      }

      // Check maximum advance booking time
      const daysDifference = hoursDifference / 24;
      if (daysDifference > this.MAX_ADVANCE_DAYS) {
        return {
          isValid: false,
          error: `Scheduled delivery cannot be more than ${this.MAX_ADVANCE_DAYS} days in advance`,
        };
      }

      logger.info('Scheduled delivery time validated:', {
        scheduledFor: scheduledDate.toISOString(),
        hoursInAdvance: hoursDifference.toFixed(2),
      });

      return {
        isValid: true,
        scheduledFor: scheduledDate,
      };
    } catch (error: any) {
      logger.error('Validate scheduled time error:', error);
      return {
        isValid: false,
        error: 'Failed to validate scheduled time',
      };
    }
  }

  /**
   * Check if delivery type is valid
   */
  static isValidDeliveryType(deliveryType: string): boolean {
    return ['instant', 'scheduled'].includes(deliveryType);
  }

  /**
   * Get minimum and maximum booking times
   */
  static getBookingLimits(): {
    minAdvanceHours: number;
    maxAdvanceDays: number;
    minDateTime: Date;
    maxDateTime: Date;
  } {
    const now = new Date();
    const minDateTime = new Date(now.getTime() + this.MIN_ADVANCE_HOURS * 60 * 60 * 1000);
    const maxDateTime = new Date(now.getTime() + this.MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000);

    return {
      minAdvanceHours: this.MIN_ADVANCE_HOURS,
      maxAdvanceDays: this.MAX_ADVANCE_DAYS,
      minDateTime,
      maxDateTime,
    };
  }

  /**
   * Format scheduled time for display
   */
  static formatScheduledTime(scheduledFor: Date): string {
    return scheduledFor.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
