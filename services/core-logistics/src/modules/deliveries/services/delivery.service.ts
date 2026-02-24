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

      // Step 7: Trigger courier matching for instant deliveries
      // For scheduled deliveries, matching will be triggered closer to scheduled time
      if (params.deliveryType === 'instant') {
        // Trigger matching asynchronously without waiting
        this.triggerCourierMatching(delivery.id, {
          pickupLatitude: params.pickupLatitude,
          pickupLongitude: params.pickupLongitude,
          vehicleTypeId: params.vehicleTypeId,
          regionId: regionId,
          maxDistance: 15, // 15km radius
          maxCouriers: 5,
        }).catch(error => {
          logger.error('Error triggering courier matching:', error);
        });

        // Update status to searching
        await supabase
          .from('deliveries')
          .update({
            status: 'searching',
            searching_at: new Date().toISOString(),
          })
          .eq('id', delivery.id);
      }

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
   * Trigger courier matching asynchronously
   * This method actually invokes the DeliveryMatchingService with SocketService
   */
  private static async triggerCourierMatching(
    deliveryId: string,
    criteria: {
      pickupLatitude: number;
      pickupLongitude: number;
      vehicleTypeId: string;
      regionId: string;
      maxDistance: number;
      maxCouriers: number;
    }
  ): Promise<void> {
    try {
      logger.info(`Starting courier matching for delivery: ${deliveryId}`);
      
      // Dynamically import to avoid circular dependencies
      const { socketService } = await import('../../../index');
      const { DeliveryMatchingService } = await import('./delivery-matching.service');
      
      if (!socketService) {
        logger.error('SocketService not initialized - cannot trigger courier matching');
        return;
      }

      // Initialize delivery matching service with socket service
      const deliveryMatchingService = new DeliveryMatchingService(socketService);
      
      // Trigger matching
      const result = await deliveryMatchingService.findAndNotifyCouriersForDelivery(
        deliveryId,
        criteria
      );

      if (result.success) {
        logger.info(`Successfully notified ${result.couriersNotified} couriers for delivery ${deliveryId}`);
      } else {
        logger.warn(`No couriers found for delivery ${deliveryId}`);
        
        // Update delivery status to no_couriers_available
        await supabase
          .from('deliveries')
          .update({
            status: 'no_couriers_available',
            updated_at: new Date().toISOString(),
          })
          .eq('id', deliveryId);
      }
    } catch (error) {
      logger.error(`Error in triggerCourierMatching:`, error);
      
      // Update delivery status to indicate matching failed
      await supabase
        .from('deliveries')
        .update({
          status: 'matching_failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);
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
    // Get delivery details first
    const delivery = await this.getDelivery(deliveryId);
    
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

    // Get courier details for notification
    const { data: courier } = await supabase
      .from('drivers')
      .select('user_id, rating, total_deliveries')
      .eq('id', courierId)
      .single();

    if (courier) {
      // Get courier user details
      const { data: courierUser } = await supabase
        .from('users')
        .select('first_name, last_name, phone')
        .eq('id', courier.user_id)
        .single();

      if (courierUser) {
        // Send notification to customer
        await DeliveryNotificationService.sendCourierAssigned({
          customerId: delivery.customer_id,
          customerEmail: '', // Will be fetched by notification service if needed
          deliveryId,
          orderNumber: delivery.order_number,
          courierName: `${courierUser.first_name} ${courierUser.last_name}`,
          courierPhone: courierUser.phone,
          courierRating: courier.rating.toString(),
        });
      }
    }

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

  /**
   * Complete delivery - handles payment completion and courier earnings
   */
  public static async completeDelivery(params: {
    deliveryId: string;
    courierId: string;
    customerId: string;
    updatedBy: string;
  }): Promise<void> {
    try {
      const { deliveryId, courierId, customerId, updatedBy } = params;

      // Get delivery details with vehicle type and region
      const delivery = await this.getDelivery(deliveryId);

      // Calculate courier earnings and platform earnings
      const estimatedFare = parseFloat(delivery.estimated_fare);
      
      // Get delivery fare config to extract service_fee and rounding_fee
      const { data: fareConfig, error: fareError } = await supabase
        .from('delivery_fare_config')
        .select('service_fee, rounding_fee')
        .eq('vehicle_type_id', delivery.vehicle_type.id)
        .eq('region_id', delivery.region.id)
        .eq('is_active', true)
        .single();

      if (fareError || !fareConfig) {
        logger.error('Error fetching fare config for earnings calculation:', fareError);
        throw new Error('Failed to calculate earnings - fare configuration not found');
      }

      // Platform earnings = service_fee + rounding_fee
      const serviceFee = parseFloat(fareConfig.service_fee) || 0;
      const roundingFee = parseFloat(fareConfig.rounding_fee) || 0;
      const platformEarnings = serviceFee + roundingFee;
      
      // Courier earnings = total fare - platform earnings
      const courierEarnings = estimatedFare - platformEarnings;

      // Complete cash payment if payment method is cash
      if (delivery.payment_method === 'cash' && delivery.payment_status === 'pending') {
        const { DeliveryPaymentService } = await import('./delivery-payment.service');
        const paymentService = new DeliveryPaymentService();
        
        await paymentService.completeCashPayment({
          deliveryId,
          customerId,
          courierId,
          amount: estimatedFare,
          currencyCode: delivery.currency_code,
        });
      }

      // Update delivery status and earnings
      const { error: updateError } = await supabase
        .from('deliveries')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          payment_status: 'completed',
          courier_earnings: courierEarnings,
          platform_earnings: platformEarnings,
          final_fare: estimatedFare,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deliveryId);

      if (updateError) {
        logger.error(`Error completing delivery:`, updateError);
        throw new Error('Failed to complete delivery');
      }

      // Add to status history
      await this.addStatusHistory({
        deliveryId,
        status: 'delivered',
        notes: 'Package delivered - code verified',
        updatedBy,
      });

      logger.info(`Delivery ${deliveryId} completed. Courier earnings: ${courierEarnings}, Platform earnings: ${platformEarnings} (Service Fee: ${serviceFee}, Rounding Fee: ${roundingFee})`);
    } catch (error) {
      logger.error(`Error in completeDelivery:`, error);
      throw error;
    }
  }
}
