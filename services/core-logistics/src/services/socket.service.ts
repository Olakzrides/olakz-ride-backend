import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/database';
import { logger } from '../config/logger';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userType?: 'customer' | 'driver' | 'admin';
  driverId?: string;
}

interface SocketUser {
  userId: string;
  userType: 'customer' | 'driver' | 'admin';
  socketId: string;
  driverId?: string;
}

export class SocketService {
  private io: SocketIOServer;
  private connectedUsers: Map<string, SocketUser> = new Map(); // userId -> SocketUser
  private driverSockets: Map<string, string> = new Map(); // driverId -> socketId
  private customerSockets: Map<string, string> = new Map(); // userId -> socketId

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    
    logger.info('Socket.IO service initialized');
  }

  /**
   * Setup authentication middleware
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        
        // Get user details from database
        const { data: user, error } = await supabase
          .from('users')
          .select('id, roles, active_role')
          .eq('id', decoded.userId)
          .single();

        if (error || !user) {
          return next(new Error('Invalid user'));
        }

        // Set socket user info
        socket.userId = user.id;
        socket.userType = user.active_role;

        // If user is a driver, get driver ID
        if (user.active_role === 'driver') {
          const { data: driver } = await supabase
            .from('drivers')
            .select('id')
            .eq('user_id', user.id)
            .single();
          
          if (driver) {
            socket.driverId = driver.id;
          }
        }

        next();
      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      this.handleUserConnection(socket);
      this.setupSocketEventListeners(socket);
    });
  }

  /**
   * Handle user connection
   */
  private async handleUserConnection(socket: AuthenticatedSocket): Promise<void> {
    const { userId, userType, driverId } = socket;
    
    if (!userId || !userType) {
      socket.disconnect();
      return;
    }

    // Store user connection
    const socketUser: SocketUser = {
      userId,
      userType,
      socketId: socket.id,
      driverId,
    };

    this.connectedUsers.set(userId, socketUser);

    // Store in type-specific maps for quick lookup
    if (userType === 'driver' && driverId) {
      this.driverSockets.set(driverId, socket.id);
    } else if (userType === 'customer') {
      this.customerSockets.set(userId, socket.id);
    }

    // Save connection to database
    await this.saveSocketConnection(socket);

    // Join user to their personal room
    socket.join(`user:${userId}`);
    
    if (userType === 'driver' && driverId) {
      socket.join(`driver:${driverId}`);
      // Update driver online status
      await this.updateDriverOnlineStatus(driverId, true);
    }

    logger.info(`User connected: ${userId} (${userType}) - Socket: ${socket.id}`);
    
    // Send connection confirmation
    socket.emit('connected', {
      message: 'Connected successfully',
      userId,
      userType,
      socketId: socket.id,
    });
  }

  /**
   * Setup socket event listeners
   */
  private setupSocketEventListeners(socket: AuthenticatedSocket): void {
    // Driver location updates
    socket.on('driver:location:update', (data) => {
      this.handleDriverLocationUpdate(socket, data);
    });

    // Driver availability updates
    socket.on('driver:availability:update', (data) => {
      this.handleDriverAvailabilityUpdate(socket, data);
    });

    // Ride request responses
    socket.on('ride:request:respond', (data) => {
      this.handleRideRequestResponse(socket, data);
    });

    // Hire request responses (driver accepts/rejects via WebSocket)
    socket.on('hire:request:respond', (data) => {
      this.handleHireRequestResponse(socket, data);
    });

    // Ride status updates
    socket.on('ride:status:update', (data) => {
      this.handleRideStatusUpdate(socket, data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      this.handleUserDisconnection(socket);
    });

    // Heartbeat for connection monitoring
    socket.on('ping', () => {
      socket.emit('pong');
      this.updateLastActivity(socket.userId!);
      
      // CRITICAL: Update driver's last_seen_at if they're a driver
      if (socket.userType === 'driver' && socket.driverId) {
        this.updateDriverLastSeen(socket.driverId);
      }
    });
  }

  /**
   * Handle driver location updates
   */
  private async handleDriverLocationUpdate(socket: AuthenticatedSocket, data: any): Promise<void> {
    const { driverId } = socket;
    
    if (!driverId || socket.userType !== 'driver') {
      return;
    }

    try {
      const { latitude, longitude, heading, speed, accuracy } = data;

      // Save location to database
      await supabase.from('driver_location_tracking').insert({
        driver_id: driverId,
        latitude,
        longitude,
        heading,
        speed,
        accuracy,
        is_online: true,
        is_available: data.isAvailable || true,
        battery_level: data.batteryLevel,
        app_version: data.appVersion,
        device_info: data.deviceInfo || {},
      });

      // CRITICAL: Update last_seen_at to keep driver online
      await supabase
        .from('driver_availability')
        .update({
          last_seen_at: new Date().toISOString(),
        })
        .eq('driver_id', driverId);

      // Broadcast location to relevant customers (if driver is on a ride)
      await this.broadcastDriverLocationToCustomers(driverId, {
        latitude,
        longitude,
        heading,
        speed,
        updatedAt: new Date().toISOString(),
      });

      logger.debug(`Driver location updated: ${driverId}`);
    } catch (error) {
      logger.error('Error updating driver location:', error);
    }
  }

  /**
   * Handle driver availability updates
   */
  private async handleDriverAvailabilityUpdate(socket: AuthenticatedSocket, data: any): Promise<void> {
    const { driverId } = socket;
    
    if (!driverId || socket.userType !== 'driver') {
      return;
    }

    try {
      const { isAvailable } = data;

      // Update driver availability in database
      await supabase
        .from('driver_availability')
        .update({
          is_available: isAvailable,
          last_seen_at: new Date().toISOString(),
        })
        .eq('driver_id', driverId);

      logger.info(`Driver availability updated: ${driverId} - Available: ${isAvailable}`);
    } catch (error) {
      logger.error('Error updating driver availability:', error);
    }
  }

  /**
   * Handle ride request responses from drivers
   */
  private async handleRideRequestResponse(socket: AuthenticatedSocket, data: any): Promise<void> {
    const { driverId } = socket;
    
    if (!driverId || socket.userType !== 'driver') {
      return;
    }

    try {
      const { rideRequestId, response } = data; // response: 'accept' | 'decline'

      logger.info(`Driver ${driverId} attempting to ${response} ride request: ${rideRequestId}`);

      // First, check if this ride request is still pending
      const { data: rideRequest, error: fetchError } = await supabase
        .from('ride_requests')
        .select('ride_id, status')
        .eq('id', rideRequestId)
        .eq('driver_id', driverId)
        .single();

      if (fetchError || !rideRequest) {
        logger.warn(`Ride request ${rideRequestId} not found for driver ${driverId}`);
        return;
      }

      if (rideRequest.status !== 'pending') {
        logger.warn(`Ride request ${rideRequestId} is no longer pending (status: ${rideRequest.status})`);
        return;
      }

      // Check if the ride was already accepted by another driver
      const { data: ride } = await supabase
        .from('rides')
        .select('status, driver_id')
        .eq('id', rideRequest.ride_id)
        .single();

      if (ride && ride.status !== 'searching') {
        logger.warn(`Ride ${rideRequest.ride_id} already has status: ${ride.status}`);
        socket.emit('ride:request:cancelled', {
          rideId: rideRequest.ride_id,
          reason: 'accepted_by_another_driver',
        });
        return;
      }

      // Update ride request status
      const { error: updateError } = await supabase
        .from('ride_requests')
        .update({
          status: response === 'accept' ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', rideRequestId)
        .eq('driver_id', driverId)
        .eq('status', 'pending'); // Only update if still pending

      if (updateError) {
        logger.error(`Error updating ride request ${rideRequestId}:`, updateError);
        return;
      }

      if (response === 'accept') {
        // Handle ride acceptance
        await this.handleRideAcceptance(rideRequestId, driverId);
      }

      logger.info(`Driver ${driverId} ${response}ed ride request: ${rideRequestId}`);
    } catch (error) {
      logger.error('Error handling ride request response:', error);
    }
  }

  /**
   * Handle ride status updates
   */
  private async handleRideStatusUpdate(socket: AuthenticatedSocket, data: any): Promise<void> {
    try {
      const { rideId, status, location, message } = data;
      const { userId, userType } = socket;

      // Save status update to database
      await supabase.from('ride_status_updates').insert({
        ride_id: rideId,
        status,
        previous_status: data.previousStatus,
        updated_by: userId!,
        updated_by_type: userType!,
        message,
        location: location || {},
      });

      // Update ride status
      await supabase
        .from('rides')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      // Broadcast status update to relevant users
      await this.broadcastRideStatusUpdate(rideId, {
        status,
        message,
        location,
        updatedBy: userType,
        updatedAt: new Date().toISOString(),
      });

      logger.info(`Ride status updated: ${rideId} - ${status}`);
    } catch (error) {
      logger.error('Error handling ride status update:', error);
    }
  }

  /**
   * Handle user disconnection
   */
  private async handleUserDisconnection(socket: AuthenticatedSocket): Promise<void> {
    const { userId, userType, driverId } = socket;
    
    if (!userId) return;

    // Remove from connected users
    this.connectedUsers.delete(userId);

    // Remove from type-specific maps
    if (userType === 'driver' && driverId) {
      this.driverSockets.delete(driverId);
      // Update driver offline status
      await this.updateDriverOnlineStatus(driverId, false);
    } else if (userType === 'customer') {
      this.customerSockets.delete(userId);
    }

    // Update database connection status
    await supabase
      .from('socket_connections')
      .update({
        is_connected: false,
        disconnected_at: new Date().toISOString(),
      })
      .eq('socket_id', socket.id);

    logger.info(`User disconnected: ${userId} (${userType}) - Socket: ${socket.id}`);
  }

  /**
   * Broadcast ride request to multiple drivers.
   *
   * Strategy:
   * 1. Try the in-memory driverSockets map first (fastest path)
   * 2. For any driver NOT in the map (reconnected, server restart, etc.)
   *    fall back to the socket_connections DB table to find their active socket ID
   *    and emit directly via this.io.to(socketId)
   * 3. Also emit to the driver's named room `driver:{driverId}` as a safety net —
   *    every driver joins this room on connect, so even if the map is stale the
   *    room-based emit will reach them.
   */
  async broadcastRideRequestToDrivers(
    rideId: string,
    driverIds: string[],
    rideDetails: any
  ): Promise<void> {
    const requestData = {
      rideId,
      ...rideDetails,
      expiresAt: new Date(Date.now() + 30000).toISOString(),
    };

    // Separate drivers found in the in-memory map from those that are missing
    const foundInMemory: string[]  = [];
    const missingFromMap: string[] = [];

    for (const driverId of driverIds) {
      if (this.driverSockets.has(driverId)) {
        foundInMemory.push(driverId);
      } else {
        missingFromMap.push(driverId);
      }
    }

    // 1. Emit to drivers already in the in-memory map
    for (const driverId of foundInMemory) {
      const socketId = this.driverSockets.get(driverId)!;
      this.io.to(socketId).emit('ride:request:new', requestData);
    }

    // 2. For drivers missing from the map, look up their active socket in the DB
    if (missingFromMap.length > 0) {
      try {
        // Get user_ids for these driver_ids
        const { data: drivers } = await supabase
          .from('drivers')
          .select('id, user_id')
          .in('id', missingFromMap);

        const userIds = (drivers ?? []).map((d: any) => d.user_id as string);

        if (userIds.length > 0) {
          const { data: connections } = await supabase
            .from('socket_connections')
            .select('socket_id, user_id')
            .in('user_id', userIds)
            .eq('is_connected', true)
            .eq('user_type', 'driver')
            .order('connected_at', { ascending: false });

          // Build a userId → socketId map from DB results (latest connection per user)
          const dbSocketMap = new Map<string, string>();
          for (const conn of connections ?? []) {
            if (!dbSocketMap.has(conn.user_id)) {
              dbSocketMap.set(conn.user_id, conn.socket_id);
            }
          }

          // Emit to each recovered socket and repair the in-memory map
          for (const driver of drivers ?? []) {
            const socketId = dbSocketMap.get(driver.user_id);
            if (socketId) {
              this.io.to(socketId).emit('ride:request:new', requestData);
              // Repair the in-memory map so future broadcasts don't need the DB fallback
              this.driverSockets.set(driver.id, socketId);
              logger.info(`DB fallback: recovered socket for driver ${driver.id}`);
            } else {
              // 3. Last resort — emit to the named room every driver joins on connect
              this.io.to(`driver:${driver.id}`).emit('ride:request:new', requestData);
              logger.warn(`Room fallback: no active socket found in DB for driver ${driver.id}, used room emit`);
            }
          }
        }
      } catch (err) {
        logger.error('Error during DB socket fallback for ride broadcast:', err);
        // Still attempt room-based emit for all missing drivers
        for (const driverId of missingFromMap) {
          this.io.to(`driver:${driverId}`).emit('ride:request:new', requestData);
        }
      }
    }

    const total = driverIds.length;
    logger.info(`Ride request broadcasted to ${total} drivers for ride: ${rideId} (${foundInMemory.length} from memory, ${missingFromMap.length} via DB/room fallback)`);
  }

  /**
   * Broadcast ride status update to relevant users
   */
  private async broadcastRideStatusUpdate(rideId: string, statusData: any): Promise<void> {
    // Get ride details to find customer and driver
    const { data: ride } = await supabase
      .from('rides')
      .select('user_id, driver_id')
      .eq('id', rideId)
      .single();

    if (!ride) return;

    // Send to customer
    const customerSocketId = this.customerSockets.get(ride.user_id);
    if (customerSocketId) {
      this.io.to(customerSocketId).emit('ride:status:updated', {
        rideId,
        ...statusData,
      });
    }

    // Send to driver
    if (ride.driver_id) {
      const driverSocketId = this.driverSockets.get(ride.driver_id);
      if (driverSocketId) {
        this.io.to(driverSocketId).emit('ride:status:updated', {
          rideId,
          ...statusData,
        });
      }
    }
  }

  /**
   * Broadcast delivery request to multiple couriers
   */
  async broadcastDeliveryRequestToCouriers(
    deliveryId: string,
    courierIds: string[],
    deliveryDetails: any
  ): Promise<void> {
    const sockets = courierIds
      .map(courierId => this.driverSockets.get(courierId))
      .filter(Boolean);

    if (sockets.length === 0) {
      logger.warn(`No online couriers found for delivery request: ${deliveryId}`);
      return;
    }

    const requestData = {
      deliveryId,
      ...deliveryDetails,
    };

    // Send to all courier sockets
    sockets.forEach(socketId => {
      this.io.to(socketId!).emit('delivery:request:new', requestData);
    });

    logger.info(`Delivery request broadcasted to ${sockets.length} couriers for delivery: ${deliveryId}`);
  }

  /**
   * Broadcast delivery status update to relevant users
   */
  async broadcastDeliveryStatusUpdate(deliveryId: string, statusData: any): Promise<void> {
    // Get delivery details to find customer and courier
    const { data: delivery } = await supabase
      .from('deliveries')
      .select('customer_id, courier_id')
      .eq('id', deliveryId)
      .single();

    if (!delivery) return;

    // Send to customer
    const customerSocketId = this.customerSockets.get(delivery.customer_id);
    if (customerSocketId) {
      this.io.to(customerSocketId).emit('delivery:status:updated', {
        deliveryId,
        ...statusData,
      });
    }

    // Send to courier
    if (delivery.courier_id) {
      const courierSocketId = this.driverSockets.get(delivery.courier_id);
      if (courierSocketId) {
        this.io.to(courierSocketId).emit('delivery:status:updated', {
          deliveryId,
          ...statusData,
        });
      }
    }
  }

  /**
   * Broadcast driver location to customers
   */
  private async broadcastDriverLocationToCustomers(driverId: string, locationData: any): Promise<void> {
    // Get active rides for this driver
    const { data: rides } = await supabase
      .from('rides')
      .select('id, user_id')
      .eq('driver_id', driverId)
      .in('status', ['driver_assigned', 'driver_arriving', 'driver_arrived', 'in_progress']);

    if (!rides || rides.length === 0) return;

    // Send location to customers of active rides
    rides.forEach(ride => {
      const customerSocketId = this.customerSockets.get(ride.user_id);
      if (customerSocketId) {
        this.io.to(customerSocketId).emit('driver:location:updated', {
          rideId: ride.id,
          driverId,
          ...locationData,
        });
      }
    });
  }

  /**
   * Handle ride acceptance by driver
   */
  private async handleRideAcceptance(rideRequestId: string, driverId: string): Promise<void> {
    try {
      // Get ride request details
      const { data: rideRequest } = await supabase
        .from('ride_requests')
        .select('ride_id')
        .eq('id', rideRequestId)
        .single();

      if (!rideRequest) return;

      const rideId = rideRequest.ride_id;

      // Update ride with assigned driver
      await supabase
        .from('rides')
        .update({
          driver_id: driverId,
          status: 'driver_assigned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', rideId);

      // Cancel all other pending requests for this ride
      await supabase
        .from('ride_requests')
        .update({
          status: 'cancelled',
          responded_at: new Date().toISOString(),
        })
        .eq('ride_id', rideId)
        .neq('id', rideRequestId)
        .eq('status', 'pending');

      // Notify other drivers that ride was taken
      const { data: otherRequests } = await supabase
        .from('ride_requests')
        .select('driver_id')
        .eq('ride_id', rideId)
        .neq('id', rideRequestId);

      if (otherRequests && otherRequests.length > 0) {
        const cancelPayload = { rideId, reason: 'accepted_by_another_driver' };

        // Get user_ids for all other drivers to enable DB fallback
        const otherDriverIds = otherRequests.map((r: any) => r.driver_id as string);
        const { data: otherDriverUsers } = await supabase
          .from('drivers')
          .select('id, user_id')
          .in('id', otherDriverIds);

        const userIds = (otherDriverUsers ?? []).map((d: any) => d.user_id as string);
        const { data: dbConnections } = await supabase
          .from('socket_connections')
          .select('socket_id, user_id')
          .in('user_id', userIds)
          .eq('is_connected', true)
          .eq('user_type', 'driver')
          .order('connected_at', { ascending: false });

        const dbSocketMap = new Map<string, string>();
        for (const conn of dbConnections ?? []) {
          if (!dbSocketMap.has(conn.user_id)) {
            dbSocketMap.set(conn.user_id, conn.socket_id);
          }
        }

        const driverUserMap = new Map<string, string>();
        for (const d of otherDriverUsers ?? []) {
          driverUserMap.set(d.id, d.user_id);
        }

        for (const request of otherRequests) {
          const dId = request.driver_id;
          // Try in-memory map first
          const memSocketId = this.driverSockets.get(dId);
          if (memSocketId) {
            this.io.to(memSocketId).emit('ride:request:cancelled', cancelPayload);
          } else {
            // DB fallback
            const userId = driverUserMap.get(dId);
            const dbSocketId = userId ? dbSocketMap.get(userId) : undefined;
            if (dbSocketId) {
              this.io.to(dbSocketId).emit('ride:request:cancelled', cancelPayload);
            } else {
              // Room fallback
              this.io.to(`driver:${dId}`).emit('ride:request:cancelled', cancelPayload);
            }
          }
        }
      }

      // Notify customer that driver was assigned
      const { data: ride } = await supabase
        .from('rides')
        .select('user_id')
        .eq('id', rideId)
        .single();

      if (ride) {
        const driverDetails = await this.getDriverDetailsForPassenger(driverId);
        const payload = {
          rideId,
          driverId,
          status: 'driver_assigned',
          driver: driverDetails,
        };

        const customerSocketId = this.customerSockets.get(ride.user_id);

        logger.info('Customer socket emit debug', {
          userId: ride.user_id,
          socketId: customerSocketId,
          room: `user:${ride.user_id}`,
          payload
        });
        if (customerSocketId) {
          this.io.to(customerSocketId).emit('ride:driver:assigned', payload);
          logger.info(`Notified customer ${ride.user_id} via memory socket`);
        } else {
          // Fallback 1: room-based emit (every user joins user:{userId} on connect)
          this.io.to(`user:${ride.user_id}`).emit('ride:driver:assigned', payload);
          logger.info(`Notified customer ${ride.user_id} via room`);

          // Fallback 2: DB socket lookup
          const { data: conn } = await supabase
            .from('socket_connections')
            .select('socket_id')
            .eq('user_id', ride.user_id)
            .eq('is_connected', true)
            .order('connected_at', { ascending: false })
            .limit(1)
            .single();

          if (conn?.socket_id) {
            this.io.to(conn.socket_id).emit('ride:driver:assigned', payload);
            // Repair the in-memory map
            this.customerSockets.set(ride.user_id, conn.socket_id);
            logger.info(`Notified customer ${ride.user_id} via DB socket fallback`);
          }
        }
      }

      logger.info(`Ride ${rideId} accepted by driver ${driverId}`);
    } catch (error) {
      logger.error('Error handling ride acceptance:', error);
    }
  }

  /**
   * Save socket connection to database
   */
  private async saveSocketConnection(socket: AuthenticatedSocket): Promise<void> {
    try {
      await supabase.from('socket_connections').insert({
        socket_id: socket.id,
        user_id: socket.userId!,
        user_type: socket.userType!,
        is_connected: true,
        device_info: socket.handshake.headers,
        app_version: socket.handshake.query.appVersion as string,
      });
    } catch (error) {
      logger.error('Error saving socket connection:', error);
    }
  }

  /**
   * Update driver online status
   */
  private async updateDriverOnlineStatus(driverId: string, isOnline: boolean): Promise<void> {
    try {
      await supabase
        .from('driver_availability')
        .update({
          is_online: isOnline,
          last_seen_at: new Date().toISOString(),
        })
        .eq('driver_id', driverId);
    } catch (error) {
      logger.error('Error updating driver online status:', error);
    }
  }

  /**
   * Update last activity for user
   */
  private async updateLastActivity(userId: string): Promise<void> {
    try {
      await supabase
        .from('socket_connections')
        .update({
          last_activity: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_connected', true);
    } catch (error) {
      logger.error('Error updating last activity:', error);
    }
  }

  /**
   * Update driver's last_seen_at (keeps them online for matching)
   */
  private async updateDriverLastSeen(driverId: string): Promise<void> {
    try {
      await supabase
        .from('driver_availability')
        .update({
          last_seen_at: new Date().toISOString(),
        })
        .eq('driver_id', driverId);
    } catch (error) {
      logger.error('Error updating driver last seen:', error);
    }
  }

  /**
   * Fetch full driver details for passenger notification
   */
  private async getDriverDetailsForPassenger(driverId: string): Promise<{
    id: string;
    name: string;
    phone: string | null;
    rating: number;
    photo: string | null;
    vehicle: { model: string; color: string; plateNumber: string; manufacturer: string } | null;
  }> {
    // No FK constraint between drivers and users — fetch separately
    const { data: driver } = await supabase
      .from('drivers')
      .select(`
        id, rating,
        user:users!drivers_user_id_fkey(first_name, last_name, phone, avatar_url),
        vehicles:driver_vehicles(plate_number, manufacturer, model, color, is_active)
      `)
      .eq('id', driverId)
      .single();

    if (!driver) {
      return { id: driverId, name: 'Your driver', phone: null, rating: 0, photo: null, vehicle: null };
    }

    const d = driver as Record<string, unknown>;
    const user = d.user as Record<string, unknown> | null;
    const vehicles = (d.vehicles as Array<Record<string, unknown>>) || [];
    const activeVehicle = vehicles.find(v => v.is_active) || vehicles[0] || null;

    return {
      id: driverId,
      name: user ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Your driver' : 'Your driver',
      phone: user?.phone as string | null ?? null,
      rating: parseFloat(String(d.rating ?? 0)),
      photo: user?.avatar_url as string | null ?? null,
      vehicle: activeVehicle ? {
        plateNumber: activeVehicle.plate_number as string,
        manufacturer: activeVehicle.manufacturer as string,
        model: activeVehicle.model as string,
        color: activeVehicle.color as string,
      } : null,
    };
  }

  /**
   * Notify passenger that a driver has been assigned (called from REST acceptance path)
   */
  async notifyPassengerDriverAssigned(rideId: string, driverId: string): Promise<void> {
    try {
      const { data: ride } = await supabase
        .from('rides')
        .select('user_id')
        .eq('id', rideId)
        .single();

      if (!ride) return;

      const driverDetails = await this.getDriverDetailsForPassenger(driverId);

      const customerSocketId = this.customerSockets.get(ride.user_id);
      if (customerSocketId) {


logger.info('Customer socket emit debug', {
  userId: ride.user_id,
  socketId: customerSocketId,
  room: `user:${ride.user_id}`,
  
});
        this.io.to(customerSocketId).emit('ride:driver:assigned', {
          rideId,
          driverId,
          status: 'driver_assigned',
          driver: driverDetails,
        });
        logger.info(`Notified passenger ${ride.user_id} of driver assignment for ride ${rideId}`);
      } else {
        // Also try room-based emit as fallback
        this.io.to(`user:${ride.user_id}`).emit('ride:driver:assigned', {
          rideId,
          driverId,
          status: 'driver_assigned',
          driver: driverDetails,
        });
        logger.info(`Notified passenger ${ride.user_id} via room for ride ${rideId}`);
      }
    } catch (error) {
      logger.error('Error notifying passenger of driver assignment:', error);
    }
  }

  // ── Transport Hire WebSocket methods ──────────────────────────────────────

  /**
   * Handle hire:request:respond from driver socket.
   * Driver accepts or declines a hire request in real time.
   * Mirrors handleRideRequestResponse but operates on hire_requests table.
   *
   * Client emits: { hireId, response: 'accept' | 'decline' }
   */
  private async handleHireRequestResponse(socket: AuthenticatedSocket, data: any): Promise<void> {
    const { driverId } = socket;
    if (!driverId || socket.userType !== 'driver') return;

    try {
      const { hireId, response } = data;
      if (!hireId || !['accept', 'decline'].includes(response)) return;

      logger.info(`Driver ${driverId} attempting to ${response} hire request: ${hireId}`);

      // Check hire is still searching
      const { data: hire } = await supabase
        .from('transport_hires')
        .select('id, status, customer_id')
        .eq('id', hireId)
        .single();

      if (!hire || hire.status !== 'searching') {
        socket.emit('hire:request:cancelled', {
          hireId,
          reason: hire ? `hire_already_${hire.status}` : 'hire_not_found',
        });
        return;
      }

      // Check driver has a pending hire_request row for this hire
      const { data: hireReq } = await supabase
        .from('hire_requests')
        .select('id, status')
        .eq('hire_id', hireId)
        .eq('driver_id', driverId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!hireReq) {
        socket.emit('hire:request:cancelled', { hireId, reason: 'no_pending_request' });
        return;
      }

      if (response === 'decline') {
        // Mark as declined
        await supabase
          .from('hire_requests')
          .update({ status: 'declined', responded_at: new Date().toISOString() })
          .eq('id', hireReq.id);

        logger.info(`Driver ${driverId} declined hire ${hireId}`);
        return;
      }

      // ── Accept ────────────────────────────────────────────────────────────
      // Mark this request accepted
      await supabase
        .from('hire_requests')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', hireReq.id);

      // Expire all other pending requests for this hire
      await supabase
        .from('hire_requests')
        .update({ status: 'expired', responded_at: new Date().toISOString() })
        .eq('hire_id', hireId)
        .eq('status', 'pending')
        .neq('id', hireReq.id);

      // Assign driver to hire
      await supabase
        .from('transport_hires')
        .update({
          driver_id:  driverId,
          status:     'driver_assigned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', hireId);

      // Notify customer via WebSocket
      const driverDetails = await this.getDriverDetailsForPassenger(driverId);
      await this.notifyCustomerHireDriverAssigned(hire.customer_id, hireId, driverDetails);

      // Confirm to the accepting driver
      socket.emit('hire:accepted:confirmed', {
        hireId,
        status: 'driver_assigned',
        message: 'Hire accepted. You have been assigned to this booking.',
      });

      logger.info(`Hire ${hireId} accepted by driver ${driverId} via WebSocket`);
    } catch (error) {
      logger.error('Error handling hire request response:', error);
    }
  }

  /**
   * Notify customer that a driver was assigned to their hire.
   * Called from both WebSocket accept path and REST accept path.
   * Emits hire:driver:assigned to the customer's socket.
   */
  async notifyCustomerHireDriverAssigned(
    customerId: string,
    hireId: string,
    driverDetails: any
  ): Promise<void> {
    const payload = {
      hireId,
      status: 'driver_assigned',
      driver: driverDetails,
    };

    const customerSocketId = this.customerSockets.get(customerId);
    if (customerSocketId) {
      this.io.to(customerSocketId).emit('hire:driver:assigned', payload);
      logger.info(`hire:driver:assigned emitted to customer ${customerId} via memory socket`);
    } else {
      // Room-based fallback
      this.io.to(`user:${customerId}`).emit('hire:driver:assigned', payload);

      // DB socket fallback
      const { data: conn } = await supabase
        .from('socket_connections')
        .select('socket_id')
        .eq('user_id', customerId)
        .eq('is_connected', true)
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conn?.socket_id) {
        this.io.to(conn.socket_id).emit('hire:driver:assigned', payload);
        this.customerSockets.set(customerId, conn.socket_id);
        logger.info(`hire:driver:assigned emitted to customer ${customerId} via DB fallback`);
      }
    }
  }

  /**
   * Broadcast hire status update to both customer and driver.
   * Called whenever hire status changes (confirmed, in_progress, completed, etc.)
   * Emits hire:status:updated to both parties.
   */
  async broadcastHireStatusUpdate(hireId: string, statusData: {
    status: string;
    message?: string;
    updatedAt?: string;
  }): Promise<void> {
    const { data: hire } = await supabase
      .from('transport_hires')
      .select('customer_id, driver_id')
      .eq('id', hireId)
      .single();

    if (!hire) return;

    const payload = { hireId, ...statusData, updatedAt: statusData.updatedAt ?? new Date().toISOString() };

    // Notify customer
    const customerSocket = this.customerSockets.get(hire.customer_id);
    if (customerSocket) {
      this.io.to(customerSocket).emit('hire:status:updated', payload);
    } else {
      this.io.to(`user:${hire.customer_id}`).emit('hire:status:updated', payload);
    }

    // Notify driver (if assigned)
    if (hire.driver_id) {
      const driverSocket = this.driverSockets.get(hire.driver_id);
      if (driverSocket) {
        this.io.to(driverSocket).emit('hire:status:updated', payload);
      } else {
        this.io.to(`driver:${hire.driver_id}`).emit('hire:status:updated', payload);
      }
    }

    logger.info(`hire:status:updated broadcasted for hire ${hireId} → ${statusData.status}`);
  }

  /**
   * Notify all drivers that a hire request was cancelled by the customer
   * (e.g. customer cancels while searching).
   * Emits hire:request:cancelled to all drivers who had a pending request.
   */
  async broadcastHireCancelledToDrivers(hireId: string): Promise<void> {
    const { data: requests } = await supabase
      .from('hire_requests')
      .select('driver_id')
      .eq('hire_id', hireId)
      .in('status', ['pending', 'accepted']);

    for (const req of requests ?? []) {
      const dId = (req as any).driver_id as string;
      const socketId = this.driverSockets.get(dId);
      if (socketId) {
        this.io.to(socketId).emit('hire:request:cancelled', { hireId, reason: 'customer_cancelled' });
      } else {
        this.io.to(`driver:${dId}`).emit('hire:request:cancelled', { hireId, reason: 'customer_cancelled' });
      }
    }
  }

  /**
   * Get connected drivers count
   */
  getConnectedDriversCount(): number {
    return this.driverSockets.size;
  }

  /**
   * Get connected customers count
   */
  getConnectedCustomersCount(): number {
    return this.customerSockets.size;
  }

  /**
   * Get total connected users count
   */
  getTotalConnectedUsers(): number {
    return this.connectedUsers.size;
  }

  /**
   * Check if driver is online
   */
  isDriverOnline(driverId: string): boolean {
    return this.driverSockets.has(driverId);
  }

  /**
   * Check if customer is online
   */
  isCustomerOnline(userId: string): boolean {
    return this.customerSockets.has(userId);
  }
}