import { logger } from '../config/logger';

export enum RideStatus {
  SEARCHING = 'searching',
  DRIVER_ASSIGNED = 'driver_assigned',
  DRIVER_ARRIVED = 'driver_arrived',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  TIMEOUT = 'timeout',
}

export interface RideStatusTransition {
  from: RideStatus;
  to: RideStatus;
  reason?: string;
  metadata?: any;
}

export class RideStateMachineService {
  // Define valid state transitions
  private static readonly VALID_TRANSITIONS: Map<RideStatus, RideStatus[]> = new Map([
    [RideStatus.SEARCHING, [RideStatus.DRIVER_ASSIGNED, RideStatus.CANCELLED, RideStatus.TIMEOUT]],
    [RideStatus.DRIVER_ASSIGNED, [RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED, RideStatus.SEARCHING]], // Can go back to searching if driver cancels
    [RideStatus.DRIVER_ARRIVED, [RideStatus.IN_PROGRESS, RideStatus.CANCELLED]],
    [RideStatus.IN_PROGRESS, [RideStatus.COMPLETED, RideStatus.CANCELLED]],
    [RideStatus.COMPLETED, []], // Final state
    [RideStatus.CANCELLED, []], // Final state
    [RideStatus.TIMEOUT, [RideStatus.SEARCHING]], // Can restart search after timeout
  ]);

  /**
   * Check if a status transition is valid
   */
  static isValidTransition(from: RideStatus, to: RideStatus): boolean {
    const allowedTransitions = this.VALID_TRANSITIONS.get(from);
    return allowedTransitions ? allowedTransitions.includes(to) : false;
  }

  /**
   * Get all valid next states for current status
   */
  static getValidNextStates(currentStatus: RideStatus): RideStatus[] {
    return this.VALID_TRANSITIONS.get(currentStatus) || [];
  }

  /**
   * Validate and log state transition
   */
  static validateTransition(transition: RideStatusTransition): {
    isValid: boolean;
    error?: string;
  } {
    const { from, to, reason } = transition;

    // Check if transition is valid
    if (!this.isValidTransition(from, to)) {
      const validStates = this.getValidNextStates(from);
      const error = `Invalid ride status transition from '${from}' to '${to}'. Valid transitions: ${validStates.join(', ')}`;
      
      logger.error('Invalid ride status transition:', {
        from,
        to,
        reason,
        validTransitions: validStates,
      });

      return { isValid: false, error };
    }

    logger.info('Valid ride status transition:', {
      from,
      to,
      reason,
      timestamp: new Date().toISOString(),
    });

    return { isValid: true };
  }

  /**
   * Check if status is a final state
   */
  static isFinalState(status: RideStatus): boolean {
    return status === RideStatus.COMPLETED || status === RideStatus.CANCELLED;
  }

  /**
   * Check if status allows cancellation
   */
  static canBeCancelled(status: RideStatus): boolean {
    const validNextStates = this.getValidNextStates(status);
    return validNextStates.includes(RideStatus.CANCELLED);
  }

  /**
   * Get human-readable status description
   */
  static getStatusDescription(status: RideStatus): string {
    const descriptions = {
      [RideStatus.SEARCHING]: 'Looking for a driver',
      [RideStatus.DRIVER_ASSIGNED]: 'Driver assigned and on the way',
      [RideStatus.DRIVER_ARRIVED]: 'Driver has arrived at pickup location',
      [RideStatus.IN_PROGRESS]: 'Ride is in progress',
      [RideStatus.COMPLETED]: 'Ride completed successfully',
      [RideStatus.CANCELLED]: 'Ride was cancelled',
      [RideStatus.TIMEOUT]: 'No driver found within time limit',
    };

    return descriptions[status] || 'Unknown status';
  }

  /**
   * Get expected next action for user based on current status
   */
  static getExpectedUserAction(status: RideStatus): string {
    const actions = {
      [RideStatus.SEARCHING]: 'Please wait while we find a driver',
      [RideStatus.DRIVER_ASSIGNED]: 'Your driver is on the way to pick you up',
      [RideStatus.DRIVER_ARRIVED]: 'Your driver has arrived. Please head to the pickup location',
      [RideStatus.IN_PROGRESS]: 'Enjoy your ride! You will arrive at your destination soon',
      [RideStatus.COMPLETED]: 'Please rate your driver and provide feedback',
      [RideStatus.CANCELLED]: 'Your ride was cancelled. You can book a new ride',
      [RideStatus.TIMEOUT]: 'No drivers available. Please try again or adjust your pickup location',
    };

    return actions[status] || 'Please contact support for assistance';
  }

  /**
   * Get cancellation fee policy based on current status
   */
  static getCancellationFeePolicy(status: RideStatus): {
    feeApplies: boolean;
    feePercentage: number;
    reason: string;
  } {
    switch (status) {
      case RideStatus.SEARCHING:
        return {
          feeApplies: false,
          feePercentage: 0,
          reason: 'No fee for cancelling before driver assignment',
        };
      
      case RideStatus.DRIVER_ASSIGNED:
        return {
          feeApplies: true,
          feePercentage: 10, // 10% of ride fare
          reason: 'Small fee applies as driver was already assigned',
        };
      
      case RideStatus.DRIVER_ARRIVED:
      case RideStatus.IN_PROGRESS:
        return {
          feeApplies: true,
          feePercentage: 50, // 50% of ride fare
          reason: 'Higher fee applies as driver has arrived or ride started',
        };
      
      default:
        return {
          feeApplies: false,
          feePercentage: 0,
          reason: 'Ride cannot be cancelled at this stage',
        };
    }
  }
}