/**
 * CarWashNotificationService
 *
 * Two channels:
 *  1. Real-time socket → customer/vendor via CarWashSocketService (local)
 *  2. Admin notification → core-logistics internal bridge (same pattern as food-service)
 */

import axios from 'axios';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { getCarWashSocketService } from './car-wash-socket.service';
import { supabase } from '../config/database';

const INTERNAL_HEADERS = {
  'x-internal-api-key': config.internalApiKey,
  'Content-Type': 'application/json',
};

export class CarWashNotificationService {
  /**
   * Called on every booking status change.
   * Emits to:
   *   1. Customer socket  → carwash:booking:status_updated
   *   2. Vendor socket    → carwash:booking:status_updated
   *   3. Admin (core-logistics bridge) → admin:car-wash:status_changed
   */
  static async notifyBookingStatusChanged(params: {
    bookingId:   string;
    customerId:  string;
    vendorId:    string;
    status:      string;
    vendorName?: string;
    serviceName?: string;
  }): Promise<void> {
    const { bookingId, customerId, vendorId, status } = params;

    // Resolve names if not provided
    let vendorName  = params.vendorName  ?? 'Car Wash';
    let serviceName = params.serviceName ?? 'Wash Service';

    if (!params.vendorName || !params.serviceName) {
      try {
        const { data: booking } = await supabase
          .from('car_wash_bookings')
          .select('car_wash_vendors(business_name), car_wash_services(name)')
          .eq('id', bookingId)
          .single();

        if (booking) {
          vendorName  = (booking as any).car_wash_vendors?.business_name ?? vendorName;
          serviceName = (booking as any).car_wash_services?.name         ?? serviceName;
        }
      } catch {
        // non-fatal — use defaults
      }
    }

    const socketSvc = getCarWashSocketService();

    // 1. Notify customer
    if (socketSvc) {
      socketSvc.emitBookingStatusToCustomer(customerId, bookingId, status, vendorName, serviceName);
    }

    // 2. Notify admin via core-logistics bridge (non-blocking)
    const coreUrl = config.coreLogisticsServiceUrl;
    axios.post(
      `${coreUrl}/api/internal/car-wash/emit/status-updated`,
      {
        booking_id: bookingId,
        status,
        vendor_name: vendorName,
        updated_at: new Date().toISOString(),
      },
      { headers: INTERNAL_HEADERS, timeout: 3000 }
    ).catch((err: any) => {
      logger.warn('CarWash admin socket notify failed (non-fatal)', { error: err.message, bookingId });
    });
  }

  /**
   * Called when a new booking is created.
   * Emits to:
   *   1. Vendor socket  → carwash:booking:new
   *   2. Admin (core-logistics bridge) → admin:car-wash:new
   */
  static async notifyNewBooking(params: {
    bookingId:    string;
    customerId:   string;
    vendorId:     string;
    bookingType:  string;
    serviceName:  string;
    vendorName:   string;
    scheduledAt:  string | null;
  }): Promise<void> {
    const { bookingId, customerId, vendorId, bookingType, serviceName, vendorName, scheduledAt } = params;

    const socketSvc = getCarWashSocketService();

    // Resolve customer name for vendor notification
    let customerName = 'Customer';
    try {
      const { data: user } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', customerId)
        .single();
      if (user) {
        const u = user as any;
        customerName = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Customer';
      }
    } catch {
      // non-fatal
    }

    // 1. Notify vendor socket
    if (socketSvc) {
      socketSvc.emitNewBookingToVendor(vendorId, bookingId, bookingType, serviceName, customerName, scheduledAt);
    }

    // 2. Notify admin via core-logistics bridge (non-blocking)
    const coreUrl = config.coreLogisticsServiceUrl;
    axios.post(
      `${coreUrl}/api/internal/car-wash/emit/new-booking`,
      {
        booking_id:   bookingId,
        vendor_name:  vendorName,
        status:       'pending',
        booking_type: bookingType,
        created_at:   new Date().toISOString(),
      },
      { headers: INTERNAL_HEADERS, timeout: 3000 }
    ).catch((err: any) => {
      logger.warn('CarWash admin new-booking notify failed (non-fatal)', { error: err.message, bookingId });
    });
  }
}
