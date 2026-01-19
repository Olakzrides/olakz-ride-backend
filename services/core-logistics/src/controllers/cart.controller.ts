import { Request, Response } from 'express';
import { CartService } from '../services/cart.service';
import { FareService } from '../services/fare.service';
import { RegionService } from '../services/region.service';
import { VariantService } from '../services/variant.service';
import { RideService } from '../services/ride.service';
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

  constructor() {
    this.cartService = new CartService();
    this.fareService = new FareService();
    this.regionService = new RegionService();
    this.variantService = new VariantService();
    this.rideService = new RideService();
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

      const { productId, salesChannelId, passengers, searchRadius, pickupPoint }: CreateCartRequest = req.body;

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
        salesChannelId,
        pickupLocation: pickupPoint,
        passengers: passengers || 1,
        searchRadius: searchRadius || 10,
        currencyCode: region.currency_code,
      });

      // Get ride product with variants
      const product = await this.variantService.getRideProduct(productId);

      // Calculate prices for each variant (no dropoff yet, so return minimum fares)
      const variantsWithPrices = await this.fareService.calculateVariantPrices(
        product.variants,
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
          sales_channel_id: salesChannelId,
          currency_code: region.currency_code,
          metadata: {
            regionId: region.id,
            productId,
            customerId: userId,
            passengers: passengers || 1,
            pickupPoint,
            searchRadius: searchRadius || 10,
            salesChannelId,
          },
        },
        product: {
          id: product.id,
          title: product.title,
          handle: product.handle,
          variants: variantsWithPrices,
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

      // Get product variants
      const productId = cart.metadata?.productId || '00000000-0000-0000-0000-000000000021';
      const product = await this.variantService.getRideProduct(productId);

      // Recalculate variant prices with actual distance
      const variantsWithPrices = await this.fareService.calculateVariantPrices(
        product.variants,
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
}
