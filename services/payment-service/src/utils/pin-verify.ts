/**
 * PIN verification helper — payment-service
 *
 * Calls auth-service internal endpoint to verify a user's transaction PIN
 * before executing a PIN-gated transaction (transfer, withdrawal).
 *
 * Throws a typed error so controllers can return the right HTTP status.
 */

import axios from 'axios';
import config from '../config';
import logger from '../utils/logger';

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3003';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY  || config.internalApiKey || 'olakz-internal-api-key-2026-secure';

export class PinError extends Error {
  constructor(
    public readonly code: 'PIN_NOT_SET' | 'INVALID_PIN' | 'PIN_LOCKED' | 'PIN_REQUIRED',
    message: string
  ) {
    super(message);
    this.name = 'PinError';
  }
}

/**
 * Verify the user's transaction PIN.
 * Throws PinError if PIN is not set, incorrect, or locked.
 * Returns void on success.
 */
export async function verifyTransactionPin(userId: string, pin: string | undefined): Promise<void> {
  if (!pin) {
    throw new PinError('PIN_REQUIRED', 'Transaction PIN is required to complete this action');
  }

  try {
    const response = await axios.post(
      `${AUTH_SERVICE_URL}/api/internal/pin/verify`,
      { user_id: userId, pin },
      {
        headers: {
          'x-internal-api-key': INTERNAL_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    if (!response.data?.valid) {
      throw new PinError('INVALID_PIN', 'Incorrect PIN. Please try again.');
    }
  } catch (err: any) {
    if (err instanceof PinError) throw err;

    const code    = err?.response?.data?.error?.code;
    const message = err?.response?.data?.error?.message || err.message;

    if (code === 'PIN_NOT_SET') {
      throw new PinError('PIN_NOT_SET', 'You need to set up your transaction PIN first. Go to Security → Manage PIN.');
    }
    if (code === 'INVALID_PIN') {
      throw new PinError('INVALID_PIN', 'Incorrect PIN. Please try again.');
    }
    if (code === 'PIN_LOCKED') {
      throw new PinError('PIN_LOCKED', message || 'PIN temporarily locked due to too many failed attempts.');
    }

    logger.error('PIN verification service error:', err.message);
    throw new PinError('PIN_REQUIRED', 'PIN verification failed. Please try again.');
  }
}
