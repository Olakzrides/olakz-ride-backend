import { Request, Response } from 'express';
import { CartService } from '../services/cart.service';
import { FareService } from '../services/fare.service';
import { RegionService } from '../services/region.service';
import { VariantService } from '../services/variant.service';
import { RideService } from '../services/ride.service';
import { RideStopsService } from '../services/ride-stops.service';
import { ResponseUtil } from '../utils/response.util';
import { MapsUtil } from '../utils/maps.util';
import { logger } from '../config/logger';
import { CreateCartRequest, UpdateDropoffRequest, AddLineItemRequest } from '../types';

export class CartController {
  private cartService: CartService;
  private fareService: FareService;
  private regionService: RegionService;
  private variantService: VariantService;
  private rideService: RideService;
  private rideStopsService: RideStopsService;

  constructor() {
    this.cartService = new CartService();
    this.fareService = new FareService();
    this.regionService = new RegionService();
    this.variantService = new VariantService();
    this.rideService = new RideService();
    this.rideStopsService = new RideStopsService();
  }

  /**
   * Create ride cart
   * POST /api/ride/cart
   */
  createRideCart = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { serviceChannelId, passengers, searchRadius, pickupPoint }: CreateCartRequest = req.body;

      // Validate required fields
      if (!serviceChannelId) {
        return ResponseUtil.badRequest(res, 'serviceChannelId is required');
      }

      // Validate pickup location
      if (!pickupPoint || !pickupPoint.latitude || !pickupPoint.longitude) {
        return ResponseUtil.badRequest(res, 'Invalid pickup location');
      }

      if (!MapsUtil.validateCoordinates(pickupPoint.latitude, pickupPoint.longitude)) {
        return ResponseUtil.badRequest(res, 'Invalid coordinates');
      }

      // Get user's region based on location
      const region = await this.regionService.getRegionByLocation(
        pickupPoint.latitude,
        pickupPoint.longitude
      );

      // Create cart
      const cart = await this.cartService.createRideCart({
        userId,
        regionId: region.id,
        serviceChannelId,
        pickupLocation: pickupPoint,
        passengers: passengers || 1,
        searchRadius: searchRadius || 10,
        currencyCode: region.currency_code,
      });

      // Get all ride variants (Standard, Premium, VIP)
      const variants = await this.variantService.getAllRideVariants();

      // Calculate prices for each variant (no dropoff yet, so return minimum fares)
      const variantsWithPrices = await this.fareService.calculateVariantPrices(
        variants,
        pickupPoint,
        null,
        region.currency_code
      );

      // Get user's recent rides
      const recentRides = await this.rideService.getUserRecentRides(userId, 5);

      return ResponseUtil.success(res, {
        cart: {
          id: cart.id,
          region_id: cart.region_id,
          customer_id: userId,
          service_channel_id: serviceChannelId,
          currency_code: region.currency_code,
          metadata: {
            regionId: region.id,
            customerId: userId,
            passengers: passengers || 1,
            pickupPoint,
            searchRadius: searchRadius || 10,
            serviceChannelId,
          },
        },
        variants: variantsWithPrices,
        recentRides,
      });
    } catch (error) {
      logger.error('Create ride cart error:', error);
      return ResponseUtil.serverError(res, 'Failed to create ride cart');
    }
  };

  /**
   * Update cart dropoff location
   * PUT /api/carts/:cartId/dropoff
   */
  updateCartDropoff = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { cartId } = req.params;
      const { dropoffPoint }: UpdateDropoffRequest = req.body;

      // Validate dropoff location
      if (!dropoffPoint || !dropoffPoint.latitude || !dropoffPoint.longitude) {
        return ResponseUtil.badRequest(res, 'Invalid dropoff location');
      }

      if (!MapsUtil.validateCoordinates(dropoffPoint.latitude, dropoffPoint.longitude)) {
        return ResponseUtil.badRequest(res, 'Invalid coordinates');
      }

      // Verify cart ownership
      const cart = await this.cartService.getCart(cartId);
      if (cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      // Update cart with dropoff
      const updatedCart = await this.cartService.updateDropoff(cartId, dropoffPoint);

      // Get route information
      const routeInfo = await MapsUtil.getDirections(
        { latitude: parseFloat(cart.pickup_latitude), longitude: parseFloat(cart.pickup_longitude) },
        { latitude: dropoffPoint.latitude, longitude: dropoffPoint.longitude }
      );

      // Get all ride variants
      const variants = await this.variantService.getAllRideVariants();

      // Recalculate variant prices with actual distance
      const variantsWithPrices = await this.fareService.calculateVariantPrices(
        variants,
        {
          latitude: parseFloat(cart.pickup_latitude),
          longitude: parseFloat(cart.pickup_longitude),
          address: cart.pickup_address,
        },
        dropoffPoint,
        cart.currency_code
      );

      return ResponseUtil.success(res, {
        cart: updatedCart,
        variants: variantsWithPrices,
        route: {
          distance: routeInfo.distance,
          duration: routeInfo.duration,
          distanceText: routeInfo.distanceText,
          durationText: routeInfo.durationText,
        },
      });
    } catch (error) {
      logger.error('Update dropoff error:', error);
      return ResponseUtil.serverError(res, 'Failed to update dropoff location');
    }
  };

  /**
   * Add line item to cart (select variant)
   * POST /api/carts/:cartId/line-items
   */
  addLineItemToCart = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { cartId } = req.params;
      const { variantId }: AddLineItemRequest = req.body;

      // Verify cart ownership
      const cart = await this.cartService.getCart(cartId);
      if (cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      // Get variant details
      const variant = await this.variantService.getVariant(variantId);
      if (!variant) {
        return ResponseUtil.notFound(res, 'Variant not found');
      }

      // Calculate final price
      const fareDetails = await this.fareService.calculateFinalFare({
        variantId,
        pickupLocation: {
          latitude: parseFloat(cart.pickup_latitude),
          longitude: parseFloat(cart.pickup_longitude),
          address: cart.pickup_address,
        },
        dropoffLocation: {
          latitude: parseFloat(cart.dropoff_latitude),
          longitude: parseFloat(cart.dropoff_longitude),
          address: cart.dropoff_address,
        },
        currencyCode: cart.currency_code,
      });

      // Remove existing line items (only one variant can be selected)
      await this.cartService.clearLineItems(cartId);

      // Add new line item
      const lineItem = await this.cartService.addLineItem(cartId, {
        variantId,
        quantity: 1,
        unitPrice: fareDetails.totalFare,
        totalPrice: fareDetails.totalFare,
      });

      return ResponseUtil.success(res, {
        lineItem,
        fareDetails,
        cart: await this.cartService.getCart(cartId),
      });
    } catch (error) {
      logger.error('Add line item error:', error);
      return ResponseUtil.serverError(res, 'Failed to add line item');
    }
  };

  /**
   * Get cart details
   * GET /api/carts/:cartId
   */
  getCart = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { cartId } = req.params;

      const cart = await this.cartService.getCart(cartId);
      if (cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      const lineItems = await this.cartService.getCartLineItems(cartId);

      return ResponseUtil.success(res, {
        cart,
        lineItems,
      });
    } catch (error) {
      logger.error('Get cart error:', error);
      return ResponseUtil.serverError(res, 'Failed to get cart');
    }
  };

  /**
   * Add a stop/waypoint to cart
   * POST /api/carts/:id/stops
   */
  addStop = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id: cartId } = req.params;
      const { stopOrder, stopType, location, notes } = req.body;

      // Validate input
      if (!stopOrder || !stopType || !location) {
        return ResponseUtil.badRequest(res, 'Missing required fields');
      }

      if (!['pickup', 'waypoint', 'dropoff'].includes(stopType)) {
        return ResponseUtil.badRequest(res, 'Invalid stop type');
      }

      if (!MapsUtil.validateCoordinates(location.latitude, location.longitude)) {
        return ResponseUtil.badRequest(res, 'Invalid coordinates');
      }

      // Verify cart ownership
      const cart = await this.cartService.getCart(cartId);
      if (!cart || cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      // Add stop
      const result = await this.rideStopsService.addStopToCart(cartId, {
        stopOrder,
        stopType,
        location,
        notes,
      });

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      return ResponseUtil.success(res, {
        stop: result.stop,
        message: 'Stop added successfully',
      });
    } catch (error: any) {
      logger.error('Add stop error:', error);
      return ResponseUtil.error(res, 'Failed to add stop');
    }
  };

  /**
   * Get stops for a cart
   * GET /api/carts/:id/stops
   */
  getStops = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id: cartId } = req.params;

      // Verify cart ownership
      const cart = await this.cartService.getCart(cartId);
      if (!cart || cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      const stops = await this.rideStopsService.getCartStops(cartId);

      return ResponseUtil.success(res, {
        stops: stops.map(stop => ({
          id: stop.id,
          stopOrder: stop.stop_order,
          stopType: stop.stop_type,
          location: {
            latitude: parseFloat(stop.latitude),
            longitude: parseFloat(stop.longitude),
            address: stop.address,
          },
          notes: stop.notes,
          createdAt: stop.created_at,
        })),
        total: stops.length,
      });
    } catch (error: any) {
      logger.error('Get stops error:', error);
      return ResponseUtil.error(res, 'Failed to get stops');
    }
  };

  /**
   * Remove a stop from cart
   * DELETE /api/carts/:id/stops/:stopId
   */
  removeStop = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id: cartId, stopId } = req.params;

      // Verify cart ownership
      const cart = await this.cartService.getCart(cartId);
      if (!cart || cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      const result = await this.rideStopsService.removeStopFromCart(stopId, cartId);

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      return ResponseUtil.success(res, {
        message: 'Stop removed successfully',
      });
    } catch (error: any) {
      logger.error('Remove stop error:', error);
      return ResponseUtil.error(res, 'Failed to remove stop');
    }
  };

  /**
   * Reorder stops in cart
   * PUT /api/carts/:id/stops/reorder
   */
  reorderStops = async (req: Request, res: Response): Promise<Response> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return ResponseUtil.unauthorized(res);
      }

      const { id: cartId } = req.params;
      const { stopOrders } = req.body; // Array of { stopId, order }

      if (!Array.isArray(stopOrders)) {
        return ResponseUtil.badRequest(res, 'stopOrders must be an array');
      }

      // Verify cart ownership
      const cart = await this.cartService.getCart(cartId);
      if (!cart || cart.user_id !== userId) {
        return ResponseUtil.forbidden(res, 'Unauthorized access to cart');
      }

      const result = await this.rideStopsService.reorderStops(cartId, stopOrders);

      if (!result.success) {
        return ResponseUtil.badRequest(res, result.error!);
      }

      return ResponseUtil.success(res, {
        message: 'Stops reordered successfully',
      });
    } catch (error: any) {
      logger.error('Reorder stops error:', error);
      return ResponseUtil.error(res, 'Failed to reorder stops');
    }
  }
};
