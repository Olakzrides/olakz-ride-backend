import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/database';
import logger from '../utils/logger';

interface AuthSocket extends Socket {
  userId?: string;
  userType?: 'customer' | 'vendor' | 'courier';
  driverId?: string;   // for couriers — their drivers.id in core-logistics
  restaurantId?: string; // for vendors
}

/**
 * FoodSocketService
 * 4 namespaces:
 *   /food-orders      — customer subscribes by order ID
 *   /vendor-orders    — vendor subscribes by restaurant ID
 *   /courier-deliveries — courier subscribes by courier (driver) ID
 *   /vendor-pickups   — vendor + courier subscribe by pickup ID
 */
export class FoodSocketService {
  private io: SocketIOServer;

  // namespace references
  private customerNs: Namespace;
  private vendorNs: Namespace;
  private courierNs: Namespace;
  private pickupNs: Namespace;

  // in-memory maps: userId/driverId → socketId
  private customerSockets: Map<string, string> = new Map();
  private vendorSockets: Map<string, string> = new Map();   // restaurantId → socketId
  private courierSockets: Map<string, string> = new Map();  // driverId → socketId

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.customerNs = this.io.of('/food-orders');
    this.vendorNs = this.io.of('/vendor-orders');
    this.courierNs = this.io.of('/courier-deliveries');
    this.pickupNs = this.io.of('/vendor-pickups');

    this.setupNamespace(this.customerNs, 'customer');
    this.setupNamespace(this.vendorNs, 'vendor');
    this.setupNamespace(this.courierNs, 'courier');
    this.setupNamespace(this.pickupNs, 'pickup');

    logger.info('FoodSocketService initialized with 4 namespaces');
  }

  // ── Auth middleware + connection handler per namespace ──────────────────────

  private setupNamespace(ns: Namespace, type: string): void {
    ns.use(async (socket: AuthSocket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) return next(new Error('Authentication token required'));

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        const userId = decoded.userId || decoded.id;

        socket.userId = userId;

        if (type === 'courier') {
          // Look up driver record in shared Supabase DB
          const { data: driver } = await supabase
            .from('drivers')
            .select('id')
            .eq('user_id', userId)
            .single();
          if (driver) socket.driverId = driver.id;
          socket.userType = 'courier';
        } else if (type === 'vendor') {
          const { data: restaurant } = await supabase
            .from('food_restaurants')
            .select('id')
            .eq('owner_id', userId)
            .single();
          if (restaurant) socket.restaurantId = restaurant.id;
          socket.userType = 'vendor';
        } else {
          socket.userType = 'customer';
        }

        next();
      } catch (err) {
        logger.warn('Food socket auth failed', { err });
        next(new Error('Authentication failed'));
      }
    });

    ns.on('connection', (socket: AuthSocket) => {
      this.handleConnection(socket, type);
    });
  }

  private handleConnection(socket: AuthSocket, type: string): void {
    const { userId, driverId, restaurantId } = socket;
    if (!userId) { socket.disconnect(); return; }

    if (type === 'customer') {
      this.customerSockets.set(userId, socket.id);
      socket.join(`customer:${userId}`);
    } else if (type === 'vendor' && restaurantId) {
      this.vendorSockets.set(restaurantId, socket.id);
      socket.join(`vendor:${restaurantId}`);
    } else if (type === 'courier' && driverId) {
      this.courierSockets.set(driverId, socket.id);
      socket.join(`courier:${driverId}`);
    }

    socket.emit('connected', { userId, userType: socket.userType });
    logger.info(`Food socket connected: ${userId} (${type})`);

    // Courier location updates
    if (type === 'courier') {
      socket.on('food:courier:location', (data) => {
        this.handleCourierLocation(socket, data);
      });
    }

    socket.on('disconnect', () => {
      if (type === 'customer') this.customerSockets.delete(userId);
      else if (type === 'vendor' && restaurantId) this.vendorSockets.delete(restaurantId);
      else if (type === 'courier' && driverId) this.courierSockets.delete(driverId!);
      logger.info(`Food socket disconnected: ${userId} (${type})`);
    });

    socket.on('ping', () => socket.emit('pong'));
  }

  private async handleCourierLocation(socket: AuthSocket, data: any): Promise<void> {
    const { driverId } = socket;
    if (!driverId || !data.order_id) return;
    try {
      await supabase.from('food_courier_locations').insert({
        order_id: data.order_id,
        courier_id: driverId,
        latitude: data.lat,
        longitude: data.lng,
        heading: data.heading || null,
        speed: data.speed || null,
      });

      // Forward to customer
      const { data: order } = await supabase
        .from('food_orders')
        .select('customer_id')
        .eq('id', data.order_id)
        .single();

      if (order) {
        this.emitToCustomer(order.customer_id, 'food:order:courier_location', {
          order_id: data.order_id,
          lat: data.lat,
          lng: data.lng,
          heading: data.heading,
          updated_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.error('Error handling courier location', err);
    }
  }

  // ── Emit helpers ────────────────────────────────────────────────────────────

  emitToCustomer(userId: string, event: string, data: any): void {
    this.customerNs.to(`customer:${userId}`).emit(event, data);
  }

  emitToVendor(restaurantId: string, event: string, data: any): void {
    this.vendorNs.to(`vendor:${restaurantId}`).emit(event, data);
  }

  emitToCourier(driverId: string, event: string, data: any): void {
    this.courierNs.to(`courier:${driverId}`).emit(event, data);
  }

  emitToPickupRoom(pickupId: string, event: string, data: any): void {
    this.pickupNs.to(`pickup:${pickupId}`).emit(event, data);
  }

  /**
   * Broadcast food delivery request to multiple couriers
   */
  broadcastFoodDeliveryRequest(orderData: any, courierIds: string[]): void {
    courierIds.forEach((driverId) => {
      this.emitToCourier(driverId, 'food:delivery:new_request', {
        ...orderData,
        expires_at: new Date(Date.now() + 30000).toISOString(),
      });
    });
    logger.info(`Food delivery request broadcast to ${courierIds.length} couriers`, { orderId: orderData.order_id });
  }

  /**
   * Notify couriers that a food order was taken by another courier
   */
  notifyCouriersOrderTaken(orderIdOrData: string, excludeCourierId: string, courierIds: string[]): void {
    courierIds
      .filter((id) => id !== excludeCourierId)
      .forEach((driverId) => {
        this.emitToCourier(driverId, 'food:delivery:accepted_by_another', {
          order_id: orderIdOrData,
        });
      });
  }

  isCourierOnline(driverId: string): boolean {
    return this.courierSockets.has(driverId);
  }

  isCustomerOnline(userId: string): boolean {
    return this.customerSockets.has(userId);
  }
}

// Singleton — set after server starts
let _instance: FoodSocketService | null = null;

export function initFoodSocketService(server: HTTPServer): FoodSocketService {
  _instance = new FoodSocketService(server);
  return _instance;
}

export function getFoodSocketService(): FoodSocketService | null {
  return _instance;
}
