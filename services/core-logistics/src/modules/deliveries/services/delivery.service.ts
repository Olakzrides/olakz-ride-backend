import { supabase } from '../../../config/database';
import { logger } from '../../../config/logger';
import { AuthCodeService } from './auth-code.service';
import { DeliveryFareService } from './delivery-fare.service';
import { DeliveryPaymentService } from './delivery-payment.service';
import { DeliveryNotificationService } from './delivery-notification.service';

interface CreateDeliveryParams {
  customerId: string;
  customerEmail: string;
  recipientName: string;
  recipientPhone: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress: string;
  dropoffLatitude: number;
  dropoffLongitude: number;
  dropoffAddress: string;
  packageDescription?: string;
  packagePhotoUrl?: string;
  vehicleTypeId: string;
  deliveryType: 'instant' | 'scheduled';
  scheduledPickupAt?: string;
  paymentMethod: 'cash' | 'wallet' | 'card';
  cardId?: string;
  cardDetails?: {
    cardNumber: string;
    cvv: string;
    expiryMonth: string;
    expiryYear: string;
    cardholderName?: string;
    pin?: string;
  };
  regionId: string;
  serviceChannelId?: string;
}

interface UpdateStatusParams {
  deliveryId: string;
  status: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  notes?: string;
  updatedBy?: string;
}

/**
 * DeliveryService
 * Main service for managing delivery orders
 */
export class DeliveryService {
  private static readonly DEFAULT_SERVICE_CHANNEL_ID = '91f84fab-1252-47e1-960a-e498daa91c35';
  private static readonly DEFAULT_REGION_ID = '00000000-0000-0000-0000-000000000001'; // Lagos, Nigeria

  /**
   * Create a new delivery order with payment and photo URL
   */
  public static async createDelivery(params: CreateDeliveryParams) {
    try {
      // Use default region if not provided (Lagos, Nigeria)
      const regionId = params.regionId || this.DEFAULT_REGION_ID;

      // Step 1: Generate authentication codes
      const { pickupCode, deliveryCode } = await AuthCodeService.generateDeliveryCodes();

      // Step 2: Calculate fare
      const fareBreakdown = await DeliveryFareService.calculateFare({
        vehicleTypeId: params.vehicleTypeId,
        regionId: regionId,
        pickupLatitude: params.pickupLatitude,
        pickupLongitude: params.pickupLongitude,
        dropoffLatitude: params.dropoffLatitude,
        dropoffLongitude: params.dropoffLongitude,
        deliveryType: params.deliveryType,
      });

      // Step 3: Create delivery record
      const { data: delivery, error } = await supabase
        .from('deliveries')
        .insert({
          customer_id: params.customerId,
          recipient_name: params.recipientName,
          recipient_phone: params.recipientPhone,
          pickup_latitude: params.pickupLatitude,
          pickup_longitude: params.pickupLongitude,
          pickup_address: params.pickupAddress,
          dropoff_latitude: params.dropoffLatitude,
          dropoff_longitude: params.dropoffLongitude,
          dropoff_address: params.dropoffAddress,
          package_description: params.packageDescription,
          package_photo_url: params.packagePhotoUrl,
          vehicle_type_id: params.vehicleTypeId,
          delivery_type: params.deliveryType,
          scheduled_pickup_at: params.scheduledPickupAt,
          pickup_code: pickupCode,
          delivery_code: deliveryCode,
          estimated_fare: fareBreakdown.finalFare,
          currency_code: fareBreakdown.currencyCode,
          distance_km: fareBreakdown.distance,
          payment_method: params.paymentMethod,
          payment_status: 'pending',
          region_id: regionId,
          service_channel_id: params.serviceChannelId || this.DEFAULT_SERVICE_CHANNEL_ID,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        logger.error(`Error creating delivery:`, error);
        throw new Error('Failed to create delivery order');
      }

      // Step 4: Process payment
      const paymentService = new DeliveryPaymentService();
      const paymentResult = await paymentService.processDeliveryPayment({
        deliveryId: delivery.id,
        customerId: params.customerId,
        customerEmail: params.customerEmail,
        amount: fareBreakdown.finalFare,
        currencyCode: fareBreakdown.currencyCode,
        paymentMethod: params.paymentMethod,
        cardId: params.cardId,
        cardDetails: params.cardDetails,
      });

      // If payment requires authorization (OTP), return early with authorization details
      if (paymentResult.requiresAuthorization) {
        return {
          delivery,
          fareBreakdown,
          paymentResult: {
            requiresAuthorization: true,
            authorization: paymentResult.authorization,
            flw_ref: paymentResult.flw_ref,
            tx_ref: paymentResult.tx_ref,
            message: paymentResult.message,
          },
        };
      }

      // If payment failed, cancel delivery
      if (!paymentResult.success) {
        await this.cancelDelivery(delivery.id, `Payment failed: ${paymentResult.message}`, params.customerId);
        throw new Error(paymentResult.message);
      }

      // Step 5: Create initial status history
      await this.addStatusHistory({
        deliveryId: delivery.id,
        status: 'pending',
        notes: 'Delivery order created and payment processed',
        updatedBy: params.customerId,
      });

      // Step 6: Send confirmation notification
      await DeliveryNotificationService.sendDeliveryConfirmation({
        customerId: params.customerId,
        customerEmail: params.customerEmail,
        deliveryId: delivery.id,
        orderNumber: delivery.order_number,
        pickupAddress: params.pickupAddress,
        dropoffAddress: params.dropoffAddress,
        fare: fareBreakdown.finalFare,
        currencyCode: fareBreakdown.currencyCode,
        pickupCode,
        deliveryCode,
        estimatedDeliveryTime: params.scheduledPickupAt,
      });

      logger.info(`Delivery created: ${delivery.id} (${delivery.order_number})`);

      return {
        delivery,
        fareBreakdown,
        paymentResult: {
          success: true,
          message: 'Payment processed successfully',
        },
      };
    } catch (error) {
      logger.error(`Error in createDelivery:`, error);
      throw error;
    }
  }

  /**
   * Validate card payment with OTP for delivery
   */
  public static async validateDeliveryCardPayment(params: {
    deliveryId: string;
    customerId: string;
    customerEmail: string;
    flwRef: string;
    otp: string;
  }) {
    try {
      // Get delivery details
      const delivery = await this.getDelivery(params.deliveryId);

      // Validate card payment
      const paymentService = new DeliveryPaymentService();
      const validationResult = await paymentService.validateCardPayment({
        deliveryId: params.deliveryId,
        customerId: params.customerId,
        flwRef: params.flwRef,
        otp: params.otp,
        amount: parseFloat(delivery.estimated_fare),
        currencyCode: delivery.currency_code,
      });

      if (!validationResult.success) {
        throw new Error(validationResult.message);
      }

      // Send confirmation notification
      await DeliveryNotificationService.sendDeliveryConfirmation({
        customerId: params.customerId,
        customerEmail: params.customerEmail,
        deliveryId: delivery.id,
        orderNumber: delivery.order_number,
        pickupAddress: delivery.pickup_address,
        dropoffAddress: delivery.dropoff_address,
        fare: parseFloat(delivery.estimated_fare),
        currencyCode: delivery.currency_code,
        pickupCode: delivery.pickup_code,
        deliveryCode: delivery.delivery_code,
        estimatedDeliveryTime: delivery.scheduled_pickup_at,
      });

      logger.info(`Card payment validated for delivery: ${params.deliveryId}`);

      return {
        success: true,
        message: 'Payment validated and delivery confirmed',
        delivery,
      };
    } catch (error) {
      logger.error(`Error validating delivery card payment:`, error);
      throw error;
    }
  }

  /**
   * Get delivery by ID
   */
  public static async getDelivery(deliveryId: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name, display_name, icon_url),
        courier:drivers(
          id,
          user_id,
          license_number,
          rating,
          total_deliveries,
          delivery_rating
        ),
        region:regions(id, name, currency_code)
      `)
      .eq('id', deliveryId)
      .single();

    if (error) {
      logger.error(`Error fetching delivery:`, error);
      throw new Error('Delivery not found');
    }

    return data;
  }

  /**
   * Get delivery by order number
   */
  public static async getDeliveryByOrderNumber(orderNumber: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name, display_name, icon_url),
        courier:drivers(
          id,
          user_id,
          license_number,
          rating,
          total_deliveries,
          delivery_rating
        )
      `)
      .eq('order_number', orderNumber)
      .single();

    if (error) {
      logger.error(`Error fetching delivery by order number:`, error);
      throw new Error('Delivery not found');
    }

    return data;
  }

  /**
   * Update delivery status
   */
  public static async updateDeliveryStatus(params: UpdateStatusParams) {
    try {
      const updateData: any = {
        status: params.status,
        updated_at: new Date().toISOString(),
      };

      // Set timestamp for specific statuses
      const now = new Date().toISOString();
      switch (params.status) {
        case 'searching':
          updateData.searching_at = now;
          break;
        case 'arrived_pickup':
          updateData.courier_arrived_pickup_at = now;
          break;
        case 'picked_up':
          updateData.picked_up_at = now;
          break;
        case 'arrived_delivery':
          updateData.courier_arrived_delivery_at = now;
          break;
        case 'delivered':
          updateData.delivered_at = now;
          updateData.payment_status = 'completed';
          break;
        case 'cancelled':
          updateData.cancelled_at = now;
          break;
      }

      const { data, error } = await supabase
        .from('deliveries')
        .update(updateData)
        .eq('id', params.deliveryId)
        .select()
        .single();

      if (error) {
        logger.error(`Error updating delivery status:`, error);
        throw new Error('Failed to update delivery status');
      }

      // Add to status history
      await this.addStatusHistory({
        deliveryId: params.deliveryId,
        status: params.status,
        location: params.location,
        notes: params.notes,
        updatedBy: params.updatedBy,
      });

      logger.info(`Delivery ${params.deliveryId} status updated to: ${params.status}`);

      return data;
    } catch (error) {
      logger.error(`Error in updateDeliveryStatus:`, error);
      throw error;
    }
  }

  /**
   * Add status history entry
   */
  private static async addStatusHistory(params: {
    deliveryId: string;
    status: string;
    location?: { latitude: number; longitude: number };
    notes?: string;
    updatedBy?: string;
  }) {
    const { error } = await supabase.from('delivery_status_history').insert({
      delivery_id: params.deliveryId,
      status: params.status,
      location_latitude: params.location?.latitude,
      location_longitude: params.location?.longitude,
      notes: params.notes,
      created_by: params.updatedBy,
    });

    if (error) {
      logger.error(`Error adding status history:`, error);
      // Don't throw - status history is not critical
    }
  }

  /**
   * Get delivery status history
   */
  public static async getStatusHistory(deliveryId: string) {
    const { data, error } = await supabase
      .from('delivery_status_history')
      .select('*')
      .eq('delivery_id', deliveryId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error(`Error fetching status history:`, error);
      throw new Error('Failed to fetch status history');
    }

    return data || [];
  }

  /**
   * Assign courier to delivery
   */
  public static async assignCourier(deliveryId: string, courierId: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .update({
        courier_id: courierId,
        assigned_at: new Date().toISOString(),
        status: 'assigned',
      })
      .eq('id', deliveryId)
      .select()
      .single();

    if (error) {
      logger.error(`Error assigning courier:`, error);
      throw new Error('Failed to assign courier');
    }

    await this.addStatusHistory({
      deliveryId,
      status: 'assigned',
      notes: `Courier ${courierId} assigned`,
    });

    logger.info(`Courier ${courierId} assigned to delivery ${deliveryId}`);

    return data;
  }

  /**
   * Cancel delivery
   */
  public static async cancelDelivery(
    deliveryId: string,
    reason?: string,
    cancelledBy?: string
  ) {
    // Get current delivery status
    const delivery = await this.getDelivery(deliveryId);

    // Check if delivery can be cancelled
    if (['delivered', 'cancelled'].includes(delivery.status)) {
      throw new Error('Delivery cannot be cancelled');
    }

    const { data, error } = await supabase
      .from('deliveries')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        payment_status: 'refunded',
      })
      .eq('id', deliveryId)
      .select()
      .single();

    if (error) {
      logger.error(`Error cancelling delivery:`, error);
      throw new Error('Failed to cancel delivery');
    }

    await this.addStatusHistory({
      deliveryId,
      status: 'cancelled',
      notes: reason || 'Delivery cancelled',
      updatedBy: cancelledBy,
    });

    logger.info(`Delivery ${deliveryId} cancelled`);

    return data;
  }

  /**
   * Get customer delivery history
   */
  public static async getCustomerDeliveries(
    customerId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: string;
    } = {}
  ) {
    let query = supabase
      .from('deliveries')
      .select(`
        *,
        vehicle_type:vehicle_types(id, name, display_name),
        courier:drivers(id, user_id, rating, delivery_rating)
      `, { count: 'exact' })
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error(`Error fetching customer deliveries:`, error);
      throw new Error('Failed to fetch delivery history');
    }

    return {
      deliveries: data || [],
      total: count || 0,
    };
  }

  /**
   * Get courier delivery history
   */
  public static async getCourierDeliveries(
    courierId: string,
    options: {
      limit?: number;
      offset?: number;
      status?: string;
    } = {}
  ) {
    let query = supabase
      .from('deliveries')
      .select('*', { count: 'exact' })
      .eq('courier_id', courierId)
      .order('created_at', { ascending: false });

    if (options.status) {
      query = query.eq('status', options.status);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error(`Error fetching courier deliveries:`, error);
      throw new Error('Failed to fetch delivery history');
    }

    return {
      deliveries: data || [],
      total: count || 0,
    };
  }

  /**
   * Update delivery photos
   */
  public static async updatePickupPhoto(deliveryId: string, photoUrl: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .update({ pickup_photo_url: photoUrl })
      .eq('id', deliveryId)
      .select()
      .single();

    if (error) {
      logger.error(`Error updating pickup photo:`, error);
      throw new Error('Failed to update pickup photo');
    }

    return data;
  }

  public static async updateDeliveryPhoto(deliveryId: string, photoUrl: string) {
    const { data, error } = await supabase
      .from('deliveries')
      .update({ delivery_photo_url: photoUrl })
      .eq('id', deliveryId)
      .select()
      .single();

    if (error) {
      logger.error(`Error updating delivery photo:`, error);
      throw new Error('Failed to update delivery photo');
    }

    return data;
  }

  /**
   * Get available deliveries for courier matching
   */
  public static async getAvailableDeliveries(options: {
    vehicleTypeId?: string;
    regionId?: string;
    limit?: number;
  } = {}) {
    let query = supabase
      .from('deliveries')
      .select('*')
      .in('status', ['pending', 'searching'])
      .order('created_at', { ascending: true });

    if (options.vehicleTypeId) {
      query = query.eq('vehicle_type_id', options.vehicleTypeId);
    }

    if (options.regionId) {
      query = query.eq('region_id', options.regionId);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error(`Error fetching available deliveries:`, error);
      throw new Error('Failed to fetch available deliveries');
    }

    return data || [];
  }
}
