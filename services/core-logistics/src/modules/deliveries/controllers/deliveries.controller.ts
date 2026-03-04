import { Request, Response } from 'express';
import { DeliveryService } from '../services/delivery.service';
import { AuthCodeService } from '../services/auth-code.service';
import { ResponseUtil } from '../../../utils/response.util';
import { logger } from '../../../config/logger';
import { supabase } from '../../../config/database';

export class DeliveriesController {
  /**
   * Create a new delivery order (Pure JSON - no file upload)
   * POST /api/delivery/order
   */
  createDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userEmail = (req as any).user?.email;
      
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const {
        recipientName,
        recipientPhone,
        pickupLocation,
        dropoffLocation,
        packageDescription,
        packagePhotoUrl,
        vehicleTypeId,
        deliveryType,
        scheduledPickupAt,
        paymentMethod,
        cardId,
        cardDetails,
        regionId,
      } = req.body;

      // Validate required fields
      if (!recipientName || !recipientPhone) {
        return ResponseUtil.badRequest(res, 'Recipient name and phone are required');
      }

      if (!pickupLocation || !pickupLocation.latitude || !pickupLocation.longitude) {
        return ResponseUtil.badRequest(res, 'Valid pickup location is required');
      }

      if (!dropoffLocation || !dropoffLocation.latitude || !dropoffLocation.longitude) {
        return ResponseUtil.badRequest(res, 'Valid dropoff location is required');
      }

      if (!vehicleTypeId) {
        return ResponseUtil.badRequest(res, 'Vehicle type is required');
      }

      if (!deliveryType || !['instant', 'scheduled'].includes(deliveryType)) {
        return ResponseUtil.badRequest(res, 'Delivery type must be instant or scheduled');
      }

      if (deliveryType === 'scheduled' && !scheduledPickupAt) {
        return ResponseUtil.badRequest(res, 'Scheduled pickup time is required for scheduled deliveries');
      }

      if (!paymentMethod || !['cash', 'wallet', 'card'].includes(paymentMethod)) {
        return ResponseUtil.badRequest(res, 'Valid payment method is required (cash, wallet, or card)');
      }

      // Validate card payment details
      if (paymentMethod === 'card' && !cardId && !cardDetails) {
        return ResponseUtil.badRequest(res, 'Card ID or card details required for card payment');
      }

      // Create delivery
      const result = await DeliveryService.createDelivery({
        customerId: userId,
        customerEmail: userEmail,
        recipientName,
        recipientPhone,
        pickupLatitude: pickupLocation.latitude,
        pickupLongitude: pickupLocation.longitude,
        pickupAddress: pickupLocation.address || '',
        dropoffLatitude: dropoffLocation.latitude,
        dropoffLongitude: dropoffLocation.longitude,
        dropoffAddress: dropoffLocation.address || '',
        packageDescription,
        packagePhotoUrl,
        vehicleTypeId,
        deliveryType,
        scheduledPickupAt,
        paymentMethod,
        cardId,
        cardDetails,
        regionId: regionId || undefined,
      });

      logger.info('Delivery created successfully:', {
        deliveryId: result.delivery.id,
        orderNumber: result.delivery.order_number,
        customerId: userId,
      });

      // If payment requires authorization, return authorization details
      if (result.paymentResult.requiresAuthorization) {
        return ResponseUtil.success(res, {
          delivery: {
            id: result.delivery.id,
            orderNumber: result.delivery.order_number,
            status: result.delivery.status,
          },
          requiresAuthorization: true,
          authorization: result.paymentResult.authorization,
          flw_ref: result.paymentResult.flw_ref,
          tx_ref: result.paymentResult.tx_ref,
          message: result.paymentResult.message,
        });
      }

      return ResponseUtil.success(res, {
        delivery: {
          id: result.delivery.id,
          orderNumber: result.delivery.order_number,
          status: result.delivery.status,
          pickupCode: result.delivery.pickup_code,
          deliveryCode: result.delivery.delivery_code,
          estimatedFare: result.delivery.estimated_fare,
          currencyCode: result.delivery.currency_code,
          deliveryType: result.delivery.delivery_type,
          scheduledPickupAt: result.delivery.scheduled_pickup_at,
          packagePhotoUrl: result.delivery.package_photo_url,
          createdAt: result.delivery.created_at,
        },
        fareBreakdown: result.fareBreakdown,
        message: deliveryType === 'scheduled' 
          ? 'Delivery scheduled successfully' 
          : 'Delivery order created successfully. Searching for courier...',
      });
    } catch (error: any) {
      logger.error('Create delivery error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to create delivery order');
    }
  };

  /**
   * Validate card payment with OTP
   * POST /api/delivery/:id/validate-payment
   */
  validateCardPayment = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      const userEmail = (req as any).user?.email;
      
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { flw_ref, otp } = req.body;

      if (!flw_ref || !otp) {
        return ResponseUtil.badRequest(res, 'Flutterwave reference and OTP are required');
      }

      const result = await DeliveryService.validateDeliveryCardPayment({
        deliveryId: id,
        customerId: userId,
        customerEmail: userEmail,
        flwRef: flw_ref,
        otp,
      });

      return ResponseUtil.success(res, {
        delivery: {
          id: result.delivery.id,
          orderNumber: result.delivery.order_number,
          status: result.delivery.status,
          pickupCode: result.delivery.pickup_code,
          deliveryCode: result.delivery.delivery_code,
        },
        message: result.message,
      });
    } catch (error: any) {
      logger.error('Validate card payment error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to validate payment');
    }
  };

  /**
   * Get delivery details
   * GET /api/delivery/:id
   */
  getDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      const delivery = await DeliveryService.getDelivery(id);

      // Verify user has access to this delivery
      if (delivery.customer_id !== userId && delivery.courier?.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to delivery');
      }

      return ResponseUtil.success(res, {
        delivery: {
          id: delivery.id,
          orderNumber: delivery.order_number,
          status: delivery.status,
          recipientName: delivery.recipient_name,
          recipientPhone: delivery.recipient_phone,
          pickupLocation: {
            latitude: parseFloat(delivery.pickup_latitude),
            longitude: parseFloat(delivery.pickup_longitude),
            address: delivery.pickup_address,
          },
          dropoffLocation: {
            latitude: parseFloat(delivery.dropoff_latitude),
            longitude: parseFloat(delivery.dropoff_longitude),
            address: delivery.dropoff_address,
          },
          packageDescription: delivery.package_description,
          packagePhotoUrl: delivery.package_photo_url,
          pickupPhotoUrl: delivery.pickup_photo_url,
          deliveryPhotoUrl: delivery.delivery_photo_url,
          vehicleType: delivery.vehicle_type,
          deliveryType: delivery.delivery_type,
          scheduledPickupAt: delivery.scheduled_pickup_at,
          estimatedFare: parseFloat(delivery.estimated_fare),
          finalFare: delivery.final_fare ? parseFloat(delivery.final_fare) : null,
          currencyCode: delivery.currency_code,
          distanceKm: delivery.distance_km,
          paymentMethod: delivery.payment_method,
          paymentStatus: delivery.payment_status,
          courier: delivery.courier,
          pickupCode: delivery.customer_id === userId ? delivery.pickup_code : undefined,
          deliveryCode: delivery.customer_id === userId ? delivery.delivery_code : undefined,
          createdAt: delivery.created_at,
          assignedAt: delivery.assigned_at,
          pickedUpAt: delivery.picked_up_at,
          deliveredAt: delivery.delivered_at,
          cancelledAt: delivery.cancelled_at,
        },
      });
    } catch (error: any) {
      logger.error('Get delivery error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch delivery details');
    }
  };

  /**
   * Update delivery status
   * PUT /api/delivery/:id/status
   */
  updateStatus = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { status, location, notes } = req.body;

      if (!status) {
        return ResponseUtil.badRequest(res, 'Status is required');
      }

      const delivery = await DeliveryService.updateDeliveryStatus({
        deliveryId: id,
        status,
        location,
        notes,
        updatedBy: userId,
      });

      return ResponseUtil.success(res, {
        delivery: {
          id: delivery.id,
          status: delivery.status,
          updatedAt: delivery.updated_at,
        },
        message: 'Delivery status updated successfully',
      });
    } catch (error: any) {
      logger.error('Update delivery status error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to update delivery status');
    }
  };

  /**
   * Cancel delivery
   * POST /api/delivery/:id/cancel
   */
  cancelDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { reason } = req.body;

      const delivery = await DeliveryService.cancelDelivery(id, reason, userId);

      return ResponseUtil.success(res, {
        delivery: {
          id: delivery.id,
          status: delivery.status,
          cancelledAt: delivery.cancelled_at,
        },
        message: 'Delivery cancelled successfully',
      });
    } catch (error: any) {
      logger.error('Cancel delivery error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to cancel delivery');
    }
  };

  /**
   * Verify pickup code
   * POST /api/delivery/:id/verify-pickup
   */
  verifyPickupCode = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { code } = req.body;

      if (!code) {
        return ResponseUtil.badRequest(res, 'Pickup code is required');
      }

      const isValid = await AuthCodeService.verifyPickupCode(id, code);

      if (!isValid) {
        return ResponseUtil.badRequest(res, 'Invalid or expired pickup code');
      }

      // Get delivery details for notification
      const delivery = await DeliveryService.getDelivery(id);

      // Update delivery status to picked_up
      await DeliveryService.updateDeliveryStatus({
        deliveryId: id,
        status: 'picked_up',
        notes: 'Package picked up - code verified',
        updatedBy: userId,
      });

      // Send pickup confirmation to customer
      const { DeliveryNotificationService } = await import('../services/delivery-notification.service');
      await DeliveryNotificationService.sendStatusUpdate({
        customerId: delivery.customer_id,
        deliveryId: id,
        orderNumber: delivery.order_number,
        status: 'picked_up',
        statusMessage: 'Your package has been picked up and is on the way',
      });

      return ResponseUtil.success(res, {
        message: 'Pickup code verified successfully',
        verified: true,
      });
    } catch (error: any) {
      logger.error('Verify pickup code error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to verify pickup code');
    }
  };

  /**
   * Verify delivery code
   * POST /api/delivery/:id/verify-delivery
   */
  verifyDeliveryCode = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { code } = req.body;

      if (!code) {
        return ResponseUtil.badRequest(res, 'Delivery code is required');
      }

      const isValid = await AuthCodeService.verifyDeliveryCode(id, code);

      if (!isValid) {
        return ResponseUtil.badRequest(res, 'Invalid or expired delivery code');
      }

      // Get delivery details
      const delivery = await DeliveryService.getDelivery(id);

      // Complete delivery with payment and earnings
      await DeliveryService.completeDelivery({
        deliveryId: id,
        courierId: delivery.courier_id,
        customerId: delivery.customer_id,
        updatedBy: userId,
      });

      // Send delivery completed notification
      const { DeliveryNotificationService } = await import('../services/delivery-notification.service');
      await DeliveryNotificationService.sendDeliveryCompleted({
        customerId: delivery.customer_id,
        customerEmail: '', // Will be fetched if needed
        deliveryId: id,
        orderNumber: delivery.order_number,
        fare: parseFloat(delivery.estimated_fare),
        currencyCode: delivery.currency_code,
      });

      return ResponseUtil.success(res, {
        message: 'Delivery completed successfully',
        verified: true,
      });
    } catch (error: any) {
      logger.error('Verify delivery code error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to verify delivery code');
    }
  };

  /**
   * Get customer delivery history
   * GET /api/delivery/history
   */
  getHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;
      const fromDate = req.query.from_date as string;
      const toDate = req.query.to_date as string;

      const result = await DeliveryService.getCustomerDeliveries(userId, {
        limit,
        offset,
        status,
        fromDate,
        toDate,
      });

      return ResponseUtil.success(res, {
        deliveries: result.deliveries.map(delivery => ({
          id: delivery.id,
          orderNumber: delivery.order_number,
          status: delivery.status,
          recipientName: delivery.recipient_name,
          pickupAddress: delivery.pickup_address,
          dropoffAddress: delivery.dropoff_address,
          estimatedFare: parseFloat(delivery.estimated_fare),
          finalFare: delivery.final_fare ? parseFloat(delivery.final_fare) : null,
          currencyCode: delivery.currency_code,
          vehicleType: delivery.vehicle_type,
          deliveryType: delivery.delivery_type,
          createdAt: delivery.created_at,
          deliveredAt: delivery.delivered_at,
        })),
        pagination: {
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      logger.error('Get delivery history error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch delivery history');
    }
  };

  /**
   * Upload package photo
   * POST /api/delivery/upload-photo
   */
  uploadPhoto = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      // This endpoint would integrate with your file upload service
      // For now, return a placeholder response
      return ResponseUtil.success(res, {
        message: 'Photo upload endpoint - integrate with storage service',
        photoUrl: 'https://placeholder.com/photo.jpg',
      });
    } catch (error: any) {
      logger.error('Upload photo error:', error);
      return ResponseUtil.error(res, 'Failed to upload photo');
    }
  };

  /**
   * Get delivery status history
   * GET /api/delivery/:id/history
   */
  getStatusHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      // Verify user has access to this delivery
      const delivery = await DeliveryService.getDelivery(id);
      if (delivery.customer_id !== userId && delivery.courier?.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to delivery');
      }

      const history = await DeliveryService.getStatusHistory(id);

      return ResponseUtil.success(res, {
        history: history.map(entry => ({
          status: entry.status,
          location: entry.location_latitude ? {
            latitude: parseFloat(entry.location_latitude),
            longitude: parseFloat(entry.location_longitude),
          } : null,
          notes: entry.notes,
          createdAt: entry.created_at,
        })),
      });
    } catch (error: any) {
      logger.error('Get status history error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch status history');
    }
  };

  // ==================== COURIER ENDPOINTS ====================

  /**
   * Get available deliveries for courier with distance calculation
   * GET /api/delivery/courier/available?sortBy=distance|fare
   */
  getAvailableDeliveries = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const vehicleTypeId = req.query.vehicleTypeId as string;
      const regionId = req.query.regionId as string;
      const sortBy = (req.query.sortBy as 'distance' | 'fare' | 'created_at') || 'created_at';
      const limit = parseInt(req.query.limit as string) || 10;

      // Validate sortBy parameter
      if (!['distance', 'fare', 'created_at'].includes(sortBy)) {
        return ResponseUtil.badRequest(res, 'Invalid sortBy parameter. Must be: distance, fare, or created_at');
      }

      // Get driver ID from user ID
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (driverError || !driver) {
        return ResponseUtil.error(res, 'Driver profile not found. Please complete driver registration first.');
      }

      // Get courier's most recent location from driver_locations table
      let courierLocation: { latitude: number; longitude: number } | undefined;
      
      const { data: locationData, error: locationError } = await supabase
        .from('driver_locations')
        .select('latitude, longitude')
        .eq('driver_id', driver.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!locationError && locationData) {
        courierLocation = {
          latitude: parseFloat(locationData.latitude),
          longitude: parseFloat(locationData.longitude),
        };
        logger.info(`Courier location found: ${courierLocation.latitude}, ${courierLocation.longitude}`);
      } else {
        logger.warn(`No location found for courier ${driver.id}. Distance sorting will not be available.`);
      }

      const deliveries = await DeliveryService.getAvailableDeliveries({
        vehicleTypeId,
        regionId,
        courierId: driver.id,
        courierLocation,
        sortBy,
        limit,
      });

      return ResponseUtil.success(res, {
        deliveries: deliveries.map(delivery => ({
          id: delivery.id,
          orderNumber: delivery.order_number,
          pickupLocation: {
            latitude: parseFloat(delivery.pickup_latitude),
            longitude: parseFloat(delivery.pickup_longitude),
            address: delivery.pickup_address,
          },
          dropoffLocation: {
            latitude: parseFloat(delivery.dropoff_latitude),
            longitude: parseFloat(delivery.dropoff_longitude),
            address: delivery.dropoff_address,
          },
          estimatedFare: parseFloat(delivery.estimated_fare),
          distanceKm: delivery.distance_km,
          distanceToPickup: delivery.distance_to_pickup || null,
          deliveryType: delivery.delivery_type,
          scheduledPickupAt: delivery.scheduled_pickup_at,
          createdAt: delivery.created_at,
        })),
        total: deliveries.length,
        sortedBy: sortBy,
        courierLocationAvailable: !!courierLocation,
      });
    } catch (error: any) {
      logger.error('Get available deliveries error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch available deliveries');
    }
  };

  /**
   * Get scheduled deliveries
   * GET /api/delivery/scheduled
   */
  getScheduledDeliveries = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      // Check if user is customer or courier
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();

      const result = await DeliveryService.getScheduledDeliveries({
        customerId: driver ? undefined : userId,
        courierId: driver ? driver.id : undefined,
        limit,
        offset,
      });

      return ResponseUtil.success(res, {
        deliveries: result.deliveries.map(delivery => ({
          id: delivery.id,
          orderNumber: delivery.order_number,
          status: delivery.status,
          recipientName: delivery.recipient_name,
          pickupLocation: {
            latitude: parseFloat(delivery.pickup_latitude),
            longitude: parseFloat(delivery.pickup_longitude),
            address: delivery.pickup_address,
          },
          dropoffLocation: {
            latitude: parseFloat(delivery.dropoff_latitude),
            longitude: parseFloat(delivery.dropoff_longitude),
            address: delivery.dropoff_address,
          },
          scheduledPickupAt: delivery.scheduled_pickup_at,
          estimatedFare: parseFloat(delivery.estimated_fare),
          currencyCode: delivery.currency_code,
          vehicleType: delivery.vehicle_type,
          courier: delivery.courier,
          createdAt: delivery.created_at,
        })),
        pagination: {
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      logger.error('Get scheduled deliveries error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch scheduled deliveries');
    }
  };

  /**
   * Get courier dashboard metrics
   * GET /api/delivery/courier/dashboard
   */
  getCourierDashboard = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const period = (req.query.period as 'today' | '7d' | '30d' | 'all') || 'today';

      // Validate period
      if (!['today', '7d', '30d', 'all'].includes(period)) {
        return ResponseUtil.badRequest(res, 'Invalid period. Must be: today, 7d, 30d, or all');
      }

      // Get driver ID from user ID
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (driverError || !driver) {
        return ResponseUtil.error(res, 'Driver profile not found. Please complete driver registration first.');
      }

      // Get dashboard metrics
      const { DeliveryDashboardService } = await import('../services/delivery-dashboard.service');
      const metrics = await DeliveryDashboardService.getCourierDashboard(driver.id, period);

      return ResponseUtil.success(res, {
        period,
        metrics: {
          totalDeliveries: metrics.totalDeliveries,
          completedDeliveries: metrics.completedDeliveries,
          cancelledDeliveries: metrics.cancelledDeliveries,
          deliveryEarnings: metrics.deliveryEarnings,
          deliveryRating: metrics.deliveryRating,
          acceptanceRate: metrics.acceptanceRate,
          currencyCode: metrics.currencyCode,
        },
      });
    } catch (error: any) {
      logger.error('Get courier dashboard error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch dashboard metrics');
    }
  };

  /**
   * Report courier no-show
   * POST /api/delivery/:id/report-no-show
   */
  reportCourierNoShow = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { reason } = req.body;

      const { DeliveryTimeoutService } = await import('../services/delivery-timeout.service');
      await DeliveryTimeoutService.markCourierNoShow({
        deliveryId: id,
        customerId: userId,
        reason,
      });

      return ResponseUtil.success(res, {
        message: 'Courier no-show reported. We are finding another courier for you.',
      });
    } catch (error: any) {
      logger.error('Report courier no-show error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to report no-show');
    }
  };

  /**
   * Report delivery issue
   * POST /api/delivery/:id/report-issue
   */
  reportIssue = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { issueType, description, photoUrls } = req.body;

      // Validate issue type
      const validIssueTypes = ['package_damaged', 'recipient_unavailable', 'wrong_address', 'courier_misconduct', 'other'];
      if (!issueType || !validIssueTypes.includes(issueType)) {
        return ResponseUtil.badRequest(res, 'Invalid issue type');
      }

      if (!description) {
        return ResponseUtil.badRequest(res, 'Description is required');
      }

      // Determine reporter type
      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();

      const reporterType = driver ? 'courier' : 'customer';

      const { DeliveryIssueService } = await import('../services/delivery-issue.service');
      const issue = await DeliveryIssueService.reportIssue({
        deliveryId: id,
        reportedBy: userId,
        reporterType,
        issueType,
        description,
        photoUrls,
      });

      return ResponseUtil.success(res, {
        issue: {
          id: issue.id,
          issueType: issue.issue_type,
          status: issue.status,
          createdAt: issue.created_at,
        },
        message: 'Issue reported successfully. Our team will review it shortly.',
      });
    } catch (error: any) {
      logger.error('Report issue error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to report issue');
    }
  };

  /**
   * Get delivery issues
   * GET /api/delivery/:id/issues
   */
  getDeliveryIssues = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      // Verify user has access to this delivery
      const delivery = await DeliveryService.getDelivery(id);
      if (delivery.customer_id !== userId && delivery.courier?.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to delivery');
      }

      const { DeliveryIssueService } = await import('../services/delivery-issue.service');
      const issues = await DeliveryIssueService.getDeliveryIssues(id);

      return ResponseUtil.success(res, {
        issues: issues.map(issue => ({
          id: issue.id,
          issueType: issue.issue_type,
          description: issue.description,
          status: issue.status,
          reporterType: issue.reporter_type,
          photoUrls: issue.photo_urls,
          adminNotes: issue.admin_notes,
          createdAt: issue.created_at,
          resolvedAt: issue.resolved_at,
        })),
      });
    } catch (error: any) {
      logger.error('Get delivery issues error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch issues');
    }
  };

  /**
   * Accept delivery
   * POST /api/delivery/:id/accept
   */
  acceptDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      // Get driver ID from user ID
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id, status, service_types, rating, delivery_rating')
        .eq('user_id', userId)
        .single();

      if (driverError || !driver) {
        return ResponseUtil.error(res, 'Driver profile not found. Please complete driver registration first.');
      }

      if (driver.status !== 'active' && driver.status !== 'approved') {
        return ResponseUtil.error(res, `Driver status is ${driver.status}. Only active/approved drivers can accept deliveries.`);
      }

      // Check if driver has delivery service type
      if (!driver.service_types || !driver.service_types.includes('delivery')) {
        return ResponseUtil.error(res, 'Your driver profile is not enabled for deliveries.');
      }

      // Check if delivery is still available
      const { data: currentDelivery } = await supabase
        .from('deliveries')
        .select('status, courier_id')
        .eq('id', id)
        .single();

      if (!currentDelivery) {
        return ResponseUtil.error(res, 'Delivery not found');
      }

      if (currentDelivery.courier_id) {
        return ResponseUtil.error(res, 'This delivery has already been assigned to another courier');
      }

      if (!['pending', 'searching'].includes(currentDelivery.status)) {
        return ResponseUtil.error(res, `Cannot accept delivery with status: ${currentDelivery.status}`);
      }

      // Mark delivery request as accepted
      const { error: requestError } = await supabase
        .from('delivery_requests')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('delivery_id', id)
        .eq('courier_id', driver.id)
        .eq('status', 'pending');

      if (requestError) {
        logger.error('Error updating delivery request:', requestError);
      }

      // Assign courier to delivery
      const delivery = await DeliveryService.assignCourier(id, driver.id);

      // Mark other pending requests as expired
      await supabase
        .from('delivery_requests')
        .update({
          status: 'expired',
          responded_at: new Date().toISOString(),
        })
        .eq('delivery_id', id)
        .eq('status', 'pending')
        .neq('courier_id', driver.id);

      // Get courier details to return
      const { data: courierUser } = await supabase
        .from('users')
        .select('first_name, last_name, phone')
        .eq('id', userId)
        .single();

      const { data: courierVehicle } = await supabase
        .from('driver_vehicles')
        .select('plate_number, manufacturer, model, color')
        .eq('driver_id', driver.id)
        .eq('is_active', true)
        .single();

      return ResponseUtil.success(res, {
        delivery: {
          id: delivery.id,
          status: delivery.status,
          assignedAt: delivery.assigned_at,
        },
        courier: courierUser && {
          name: `${courierUser.first_name} ${courierUser.last_name}`,
          phone: courierUser.phone,
          rating: parseFloat(driver.rating) || 0,
          vehicle: courierVehicle && {
            plateNumber: courierVehicle.plate_number,
            make: courierVehicle.manufacturer,
            model: courierVehicle.model,
            color: courierVehicle.color,
          },
        },
        message: 'Delivery accepted successfully',
      });
    } catch (error: any) {
      logger.error('Accept delivery error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to accept delivery');
    }
  };

  /**
   * Reject delivery
   * POST /api/delivery/:id/reject
   */
  rejectDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { reason } = req.body;

      // Get driver ID from user ID
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (driverError || !driver) {
        return ResponseUtil.error(res, 'Driver profile not found');
      }

      // Update delivery request status to declined
      const { error: updateError } = await supabase
        .from('delivery_requests')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
          rejection_reason: reason || 'No reason provided',
        })
        .eq('delivery_id', id)
        .eq('courier_id', driver.id)
        .eq('status', 'pending');

      if (updateError) {
        logger.error('Error rejecting delivery:', updateError);
        return ResponseUtil.error(res, 'Failed to reject delivery');
      }

      return ResponseUtil.success(res, {
        message: 'Delivery rejected successfully',
      });
    } catch (error: any) {
      logger.error('Reject delivery error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to reject delivery');
    }
  };

  /**
   * Arrived at pickup location
   * POST /api/delivery/:id/arrived-pickup
   */
  arrivedAtPickup = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { location } = req.body;

      // Get delivery details for notification
      const delivery = await DeliveryService.getDelivery(id);

      await DeliveryService.updateDeliveryStatus({
        deliveryId: id,
        status: 'arrived_pickup',
        location,
        notes: 'Courier arrived at pickup location',
        updatedBy: userId,
      });

      // Send notification to customer
      const { DeliveryNotificationService } = await import('../services/delivery-notification.service');
      await DeliveryNotificationService.sendStatusUpdate({
        customerId: delivery.customer_id,
        deliveryId: id,
        orderNumber: delivery.order_number,
        status: 'arrived_pickup',
        statusMessage: 'Your courier has arrived at the pickup location',
      });

      return ResponseUtil.success(res, {
        message: 'Arrival at pickup confirmed',
      });
    } catch (error: any) {
      logger.error('Arrived at pickup error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to update status');
    }
  };

  /**
   * Start delivery (after pickup)
   * POST /api/delivery/:id/start-delivery
   */
  startDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      // Get delivery details for notification
      const delivery = await DeliveryService.getDelivery(id);

      await DeliveryService.updateDeliveryStatus({
        deliveryId: id,
        status: 'in_transit',
        notes: 'Delivery in transit',
        updatedBy: userId,
      });

      // Get courier name for notification
      const { data: courierUser } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', delivery.courier.user_id)
        .single();

      if (courierUser) {
        // Send en route notification to customer
        const { DeliveryNotificationService } = await import('../services/delivery-notification.service');
        await DeliveryNotificationService.sendEnRouteToDelivery({
          customerId: delivery.customer_id,
          deliveryId: id,
          orderNumber: delivery.order_number,
          courierName: `${courierUser.first_name} ${courierUser.last_name}`,
        });
      }

      return ResponseUtil.success(res, {
        message: 'Delivery started successfully',
      });
    } catch (error: any) {
      logger.error('Start delivery error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to start delivery');
    }
  };

  /**
   * Arrived at delivery location
   * POST /api/delivery/:id/arrived-delivery
   */
  arrivedAtDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { location } = req.body;

      // Get delivery details for notification
      const delivery = await DeliveryService.getDelivery(id);

      await DeliveryService.updateDeliveryStatus({
        deliveryId: id,
        status: 'arrived_delivery',
        location,
        notes: 'Courier arrived at delivery location',
        updatedBy: userId,
      });

      // Get courier name for notification
      const { data: courierUser } = await supabase
        .from('users')
        .select('first_name, last_name')
        .eq('id', delivery.courier.user_id)
        .single();

      if (courierUser) {
        // Send arrived at delivery notification to customer
        const { DeliveryNotificationService } = await import('../services/delivery-notification.service');
        await DeliveryNotificationService.sendArrivedAtDelivery({
          customerId: delivery.customer_id,
          deliveryId: id,
          orderNumber: delivery.order_number,
          courierName: `${courierUser.first_name} ${courierUser.last_name}`,
        });
      }

      return ResponseUtil.success(res, {
        message: 'Arrival at delivery location confirmed',
      });
    } catch (error: any) {
      logger.error('Arrived at delivery error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to update status');
    }
  };

  /**
   * Upload pickup photo
   * POST /api/delivery/:id/pickup-photo
   */
  uploadPickupPhoto = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { photoUrl } = req.body;

      if (!photoUrl) {
        return ResponseUtil.badRequest(res, 'Photo URL is required');
      }

      await DeliveryService.updatePickupPhoto(id, photoUrl);

      return ResponseUtil.success(res, {
        message: 'Pickup photo uploaded successfully',
      });
    } catch (error: any) {
      logger.error('Upload pickup photo error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to upload pickup photo');
    }
  };

  /**
   * Upload delivery photo
   * POST /api/delivery/:id/delivery-photo
   */
  uploadDeliveryPhoto = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { photoUrl } = req.body;

      if (!photoUrl) {
        return ResponseUtil.badRequest(res, 'Photo URL is required');
      }

      await DeliveryService.updateDeliveryPhoto(id, photoUrl);

      return ResponseUtil.success(res, {
        message: 'Delivery photo uploaded successfully',
      });
    } catch (error: any) {
      logger.error('Upload delivery photo error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to upload delivery photo');
    }
  };

  /**
   * Get courier delivery history
   * GET /api/delivery/courier/history
   */
  getCourierHistory = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;
      const fromDate = req.query.from_date as string;
      const toDate = req.query.to_date as string;

      // Get driver ID from user ID
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (driverError || !driver) {
        return ResponseUtil.error(res, 'Driver profile not found. Please complete driver registration first.');
      }

      // Get courier deliveries using driver ID
      const result = await DeliveryService.getCourierDeliveries(driver.id, {
        limit,
        offset,
        status,
        fromDate,
        toDate,
      });

      return ResponseUtil.success(res, {
        deliveries: result.deliveries.map(delivery => ({
          id: delivery.id,
          orderNumber: delivery.order_number,
          status: delivery.status,
          recipientName: delivery.recipient_name,
          pickupAddress: delivery.pickup_address,
          dropoffAddress: delivery.dropoff_address,
          estimatedFare: parseFloat(delivery.estimated_fare),
          finalFare: delivery.final_fare ? parseFloat(delivery.final_fare) : null,
          currencyCode: delivery.currency_code,
          deliveryType: delivery.delivery_type,
          createdAt: delivery.created_at,
          deliveredAt: delivery.delivered_at,
        })),
        pagination: {
          total: result.total,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      logger.error('Get courier history error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch courier history');
    }
  };

  /**
   * Generate signed upload URL for package photo
   * POST /api/delivery/upload/package-photo
   */
  generatePackagePhotoUploadUrl = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { fileName, fileType, fileSize } = req.body;

      // Validate required fields
      if (!fileName || !fileType || !fileSize) {
        return ResponseUtil.badRequest(res, 'fileName, fileType, and fileSize are required');
      }

      // Generate signed upload URL
      const { PackagePhotoService } = await import('../services/package-photo.service');
      const result = await PackagePhotoService.generateSignedUploadUrl({
        fileName,
        fileType,
        fileSize: parseInt(fileSize),
        customerId: userId,
      });

      if (!result.success) {
        return ResponseUtil.error(res, result.message);
      }

      return ResponseUtil.success(res, {
        uploadUrl: result.uploadUrl,
        photoUrl: result.photoUrl,
        filePath: result.filePath,
        expiresIn: result.expiresIn,
        maxFileSize: result.maxFileSize,
        message: result.message,
      });
    } catch (error: any) {
      logger.error('Generate package photo upload URL error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to generate upload URL');
    }
  };

  /**`n   * Get available vehicle types for delivery
   * GET /api/delivery/vehicle-types
   */
  getVehicleTypes = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      // Default to Lagos region if not provided
      const regionId = (req.query.regionId as string) || '00000000-0000-0000-0000-000000000001';

      const { DeliveryVehicleTypeService } = await import('../services/delivery-vehicle-type.service');
      const vehicleTypes = await DeliveryVehicleTypeService.getAvailableVehicleTypes(regionId);

      return ResponseUtil.success(res, {
        vehicleTypes,
        message: 'Vehicle types retrieved successfully',
      });
    } catch (error: any) {
      logger.error('Get vehicle types error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch vehicle types');
    }
  };

  /**
   * Estimate delivery fare
   * POST /api/delivery/estimate-fare
   */
  estimateFare = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const {
        vehicleTypeId,
        regionId,
        pickupLocation,
        dropoffLocation,
        deliveryType,
      } = req.body;

      if (!vehicleTypeId || !pickupLocation || !dropoffLocation) {
        return ResponseUtil.badRequest(res, 'Vehicle type, pickup and dropoff locations are required');
      }

      // Parse locations if they're strings
      const parsedPickupLocation = typeof pickupLocation === 'string' ? JSON.parse(pickupLocation) : pickupLocation;
      const parsedDropoffLocation = typeof dropoffLocation === 'string' ? JSON.parse(dropoffLocation) : dropoffLocation;

      const { DeliveryFareService } = await import('../services/delivery-fare.service');
      const fareBreakdown = await DeliveryFareService.estimateFare(
        vehicleTypeId,
        regionId || '00000000-0000-0000-0000-000000000001', // Default Lagos
        parsedPickupLocation.latitude,
        parsedPickupLocation.longitude,
        parsedDropoffLocation.latitude,
        parsedDropoffLocation.longitude,
        deliveryType || 'instant'
      );

      return ResponseUtil.success(res, {
        fareBreakdown,
        message: 'Fare estimated successfully',
      });
    } catch (error: any) {
      logger.error('Estimate fare error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to estimate fare');
    }
  };

  // ==================== RATING ENDPOINTS ====================

  /**
   * Customer rates courier
   * POST /api/delivery/:id/rate-courier
   */
  rateCourier = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { stars, feedback } = req.body;

      if (!stars || stars < 1 || stars > 5) {
        return ResponseUtil.badRequest(res, 'Rating must be between 1 and 5 stars');
      }

      const { DeliveryRatingService } = await import('../services/delivery-rating.service');
      const result = await DeliveryRatingService.rateCourier(userId, id, {
        stars,
        feedback,
      });

      if (!result.success) {
        return ResponseUtil.error(res, result.error || 'Failed to submit rating');
      }

      return ResponseUtil.success(res, {
        message: 'Courier rated successfully',
      });
    } catch (error: any) {
      logger.error('Rate courier error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to rate courier');
    }
  };

  /**
   * Courier rates customer
   * POST /api/delivery/:id/rate-customer
   */
  rateCustomer = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;
      const { stars, feedback } = req.body;

      if (!stars || stars < 1 || stars > 5) {
        return ResponseUtil.badRequest(res, 'Rating must be between 1 and 5 stars');
      }

      // Get courier ID from user ID
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (driverError || !driver) {
        return ResponseUtil.error(res, 'Driver profile not found');
      }

      const { DeliveryRatingService } = await import('../services/delivery-rating.service');
      const result = await DeliveryRatingService.rateCustomer(driver.id, id, {
        stars,
        feedback,
      });

      if (!result.success) {
        return ResponseUtil.error(res, result.error || 'Failed to submit rating');
      }

      return ResponseUtil.success(res, {
        message: 'Customer rated successfully',
      });
    } catch (error: any) {
      logger.error('Rate customer error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to rate customer');
    }
  };

  /**
   * Get delivery rating
   * GET /api/delivery/:id/rating
   */
  getDeliveryRating = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      // Verify user has access to this delivery
      const delivery = await DeliveryService.getDelivery(id);
      if (delivery.customer_id !== userId && delivery.courier?.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to delivery');
      }

      const { DeliveryRatingService } = await import('../services/delivery-rating.service');
      const rating = await DeliveryRatingService.getDeliveryRating(id);

      return ResponseUtil.success(res, {
        rating: rating || {
          courierRating: null,
          courierFeedback: null,
          customerRating: null,
          customerFeedback: null,
        },
      });
    } catch (error: any) {
      logger.error('Get delivery rating error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch rating');
    }
  };

  // ==================== TRACKING ENDPOINT ====================

  /**
   * Track delivery in real-time
   * GET /api/delivery/:id/track
   */
  trackDelivery = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id } = req.params;

      // Verify user has access to this delivery
      const delivery = await DeliveryService.getDelivery(id);
      if (delivery.customer_id !== userId && delivery.courier?.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to delivery');
      }

      const { DeliveryTrackingService } = await import('../services/delivery-tracking.service');
      const trackingData = await DeliveryTrackingService.getTrackingInfo(id);

      return ResponseUtil.success(res, trackingData);
    } catch (error: any) {
      logger.error('Track delivery error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to fetch tracking information');
    }
  };

  /**
   * Update courier location (called by courier app)
   * POST /api/delivery/courier/location
   */
  updateCourierLocation = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { latitude, longitude, heading, speed } = req.body;

      if (!latitude || !longitude) {
        return ResponseUtil.badRequest(res, 'Latitude and longitude are required');
      }

      // Get courier ID from user ID
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (driverError || !driver) {
        return ResponseUtil.error(res, 'Driver profile not found');
      }

      const { DeliveryTrackingService } = await import('../services/delivery-tracking.service');
      await DeliveryTrackingService.updateCourierLocation(driver.id, {
        latitude,
        longitude,
        heading,
        speed,
      });

      return ResponseUtil.success(res, {
        message: 'Location updated successfully',
      });
    } catch (error: any) {
      logger.error('Update courier location error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to update location');
    }
  };

  /**
   * DEBUG: Get courier vehicle details
   * GET /api/delivery/courier/debug-vehicle
   */
  debugCourierVehicle = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      // Get courier ID from user ID
      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id, user_id, status, service_types')
        .eq('user_id', userId)
        .single();

      if (driverError || !driver) {
        return ResponseUtil.error(res, 'Driver profile not found');
      }

      // Get all vehicles (including inactive)
      const { data: allVehicles, error: allVehiclesError } = await supabase
        .from('driver_vehicles')
        .select('*')
        .eq('driver_id', driver.id);

      // Get only active vehicles
      const { data: activeVehicles, error: activeVehiclesError } = await supabase
        .from('driver_vehicles')
        .select('plate_number, manufacturer, model, color, is_active')
        .eq('driver_id', driver.id)
        .eq('is_active', true);

      // Get count of all vehicles in table
      const { count: totalVehiclesCount } = await supabase
        .from('driver_vehicles')
        .select('*', { count: 'exact', head: true });

      return ResponseUtil.success(res, {
        driver: {
          id: driver.id,
          userId: driver.user_id,
          status: driver.status,
          serviceTypes: driver.service_types,
        },
        allVehicles: {
          data: allVehicles,
          error: allVehiclesError,
          count: allVehicles?.length || 0,
        },
        activeVehicles: {
          data: activeVehicles,
          error: activeVehiclesError,
          count: activeVehicles?.length || 0,
        },
        totalVehiclesInDatabase: totalVehiclesCount,
        message: 'Debug information retrieved',
      });
    } catch (error: any) {
      logger.error('Debug courier vehicle error:', error);
      return ResponseUtil.error(res, error.message || 'Failed to get debug info');
    }
  };
}