/**
 * AdminRelayService — marketplace-service
 *
 * Calls core-logistics internal HTTP endpoints to relay marketplace order
 * status/location events to the admin Socket.IO room.
 *
 * This keeps the admin on a single Socket.IO connection (core-logistics)
 * while still receiving live marketplace updates in real-time.
 *
 * All calls are non-fatal — a failure here must never break the order flow.
 */

import axios from 'axios';
import logger from '../utils/logger';

const CORE_LOGISTICS_URL = process.env.CORE_LOGISTICS_URL || 'http://localhost:3001';
const INTERNAL_API_KEY   = process.env.INTERNAL_API_KEY   || 'olakz-internal-api-key-2026-secure';

const HEADERS = {
  'x-internal-api-key': INTERNAL_API_KEY,
  'Content-Type':       'application/json',
};

const TIMEOUT_MS = 3000; // never block the order flow for more than 3s

export async function notifyAdminMarketplaceStatus(
  orderId: string,
  status:  string,
  message?: string
): Promise<void> {
  try {
    await axios.post(
      `${CORE_LOGISTICS_URL}/api/internal/marketplace/emit/status-updated`,
      { order_id: orderId, status, message, updated_at: new Date().toISOString() },
      { headers: HEADERS, timeout: TIMEOUT_MS }
    );
  } catch (err: any) {
    logger.warn(`notifyAdminMarketplaceStatus failed for order ${orderId}:`, err.message);
  }
}

export async function notifyAdminNewMarketplaceOrder(
  orderId: string,
  storeName: string | null,
  status: string
): Promise<void> {
  try {
    await axios.post(
      `${CORE_LOGISTICS_URL}/api/internal/marketplace/emit/new-order`,
      { order_id: orderId, store_name: storeName, status, created_at: new Date().toISOString() },
      { headers: HEADERS, timeout: TIMEOUT_MS }
    );
  } catch (err: any) {
    logger.warn(`notifyAdminNewMarketplaceOrder failed for order ${orderId}:`, err.message);
  }
}

export async function notifyAdminMarketplaceRiderLocation(
  orderId:  string,
  riderId:  string,
  lat:      number,
  lng:      number,
  heading?: number
): Promise<void> {
  try {
    await axios.post(
      `${CORE_LOGISTICS_URL}/api/internal/marketplace/emit/rider-location`,
      { order_id: orderId, rider_id: riderId, lat, lng, heading, updated_at: new Date().toISOString() },
      { headers: HEADERS, timeout: TIMEOUT_MS }
    );
  } catch (err: any) {
    logger.warn(`notifyAdminMarketplaceRiderLocation failed for order ${orderId}:`, err.message);
  }
}
