/**
 * AutoMechNotificationService
 *
 * Two channels:
 *  1. Real-time socket → customer/vendor via AutoMechSocketService (local)
 *  2. Admin notification → core-logistics internal bridge
 */

import axios from 'axios';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { getAutoMechSocketService } from './auto-mech-socket.service';
import { supabase } from '../config/database';

const INTERNAL_HEADERS = {
  'x-internal-api-key': config.internalApiKey,
  'Content-Type': 'application/json',
};

export class AutoMechNotificationService {
  /**
   * Called on every booking status change.
   */
  static async notifyBookingStatusChanged(params: {
    bookingId:    string;
    customerId:   string;
    vendorId:     string;
    status:       string;
    vendorName?:  string;
    serviceName?: string;
  }): Promise<void> {
    const { bookingId, customerId, vendorId, status } = params;

    let vendorName  = params.vendorName  ?? 'Auto Mech';
    let serviceName = params.serviceName ?? 'Mech Service';

    if (!params.vendorName || !params.serviceName) {
      try {
        const { data: booking } = await supabase
          .from('auto_mech_bookings')
          .select('auto_mech_vendors(business_name), auto_mech_services(name)')
          .eq('id', bookingId)
          .single();

        if (booking) {
          vendorName  = (booking as any).auto_mech_vendors?.business_name ?? vendorName;
          serviceName = (booking as any).auto_mech_services?.name         ?? serviceName;
        }
      } catch {
        // non-fatal — use defaults
      }
    }

    const socketSvc = getAutoMechSocketService();

    if (socketSvc) {
      socketSvc.emitBookingStatusToCustomer(customerId, bookingId, status, vendorName, serviceName);
    }

    const coreUrl = config.coreLogisticsServiceUrl;
    axios.post(
      `${coreUrl}/api/internal/auto-mech/emit/status-updated`,
      {
        booking_id: bookingId,
        status,
        vendor_name: vendorName,
        updated_at: new Date().toISOString(),
      },
      { headers: INTERNAL_HEADERS, timeout: 3000 }
    ).catch((err: any) => {
      logger.warn('AutoMech admin socket notify failed (non-fatal)', { error: err.message, bookingId });
    });
  }

  /**
   * Called when a new booking is created.
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

    const socketSvc = getAutoMechSocketService();

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

    if (socketSvc) {
      socketSvc.emitNewBookingToVendor(vendorId, bookingId, bookingType, serviceName, customerName, scheduledAt);
    }

    const coreUrl = config.coreLogisticsServiceUrl;
    axios.post(
      `${coreUrl}/api/internal/auto-mech/emit/new-booking`,
      {
        booking_id:   bookingId,
        vendor_name:  vendorName,
        status:       'pending',
        booking_type: bookingType,
        created_at:   new Date().toISOString(),
      },
      { headers: INTERNAL_HEADERS, timeout: 3000 }
    ).catch((err: any) => {
      logger.warn('AutoMech admin new-booking notify failed (non-fatal)', { error: err.message, bookingId });
    });
  }
}
