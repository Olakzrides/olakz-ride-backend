/**
 * CarWashSocketService
 * 
 * Two namespaces:
 *   /car-wash-customer  — customer tracks their booking status live
 *   /car-wash-vendor    — vendor receives new booking notifications live
 *
 * Auth: JWT token passed as socket.handshake.auth.token
 *
 * Customer events received:
 *   carwash:booking:status_updated  — booking confirmed/started/completed/cancelled
 *   carwash:booking:new             — (vendor only) new booking request
 *
 * Customer connects and joins room:  customer:{userId}
 * Vendor connects and joins room:    vendor:{vendorId}
 */

import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { config } from '../config/env';

interface CarWashSocket extends Socket {
  userId?:   string;
  vendorId?: string;
  userType?: 'customer' | 'vendor';
}

export class CarWashSocketService {
  private io: SocketIOServer;
  private customerNs: Namespace;
  private vendorNs: Namespace;

  // in-memory presence
  private customerSockets = new Map<string, string>(); // userId → socketId
  private vendorSockets   = new Map<string, string>(); // vendorId → socketId

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin:      config.allowedOrigins,
        methods:     ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    this.customerNs = this.io.of('/car-wash-customer');
    this.vendorNs   = this.io.of('/car-wash-vendor');

    this.setupNamespace(this.customerNs, 'customer');
    this.setupNamespace(this.vendorNs,   'vendor');

    logger.info('CarWashSocketService initialized (/car-wash-customer, /car-wash-vendor)');
  }

  // ── Auth middleware ─────────────────────────────────────────────────────────

  private setupNamespace(ns: Namespace, type: 'customer' | 'vendor'): void {
    ns.use(async (socket: CarWashSocket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) return next(new Error('Authentication token required'));

        const decoded = jwt.verify(token, config.jwtSecret) as any;
        const userId = decoded.userId || decoded.id;

        socket.userId   = userId;
        socket.userType = type;

        if (type === 'vendor') {
          const { data: vendor } = await supabase
            .from('car_wash_vendors')
            .select('id')
            .eq('user_id', userId)
            .single();

          if (!vendor) return next(new Error('Car wash vendor profile not found'));
          socket.vendorId = vendor.id;
        }

        next();
      } catch (err) {
        logger.warn('CarWash socket auth failed', { err });
        next(new Error('Authentication failed'));
      }
    });

    ns.on('connection', (socket: CarWashSocket) => {
      this.handleConnection(socket, type);
    });
  }

  private handleConnection(socket: CarWashSocket, type: 'customer' | 'vendor'): void {
    const { userId, vendorId } = socket;
    if (!userId) { socket.disconnect(); return; }

    if (type === 'customer') {
      this.customerSockets.set(userId, socket.id);
      socket.join(`customer:${userId}`);
      socket.emit('connected', { userId, userType: 'customer' });
      logger.info(`CarWash customer socket connected: ${userId}`);
    } else if (type === 'vendor' && vendorId) {
      this.vendorSockets.set(vendorId, socket.id);
      socket.join(`vendor:${vendorId}`);
      socket.emit('connected', { userId, vendorId, userType: 'vendor' });
      logger.info(`CarWash vendor socket connected: ${userId} (vendor: ${vendorId})`);
    }

    socket.on('disconnect', () => {
      if (type === 'customer') this.customerSockets.delete(userId);
      else if (type === 'vendor' && vendorId) this.vendorSockets.delete(vendorId);
      logger.info(`CarWash socket disconnected: ${userId} (${type})`);
    });

    socket.on('ping', () => socket.emit('pong'));
  }

  // ── Emit helpers ────────────────────────────────────────────────────────────

  /**
   * Emit a booking status update to the customer who owns the booking.
   * Called by booking service on every status transition.
   */
  emitBookingStatusToCustomer(
    customerId: string,
    bookingId: string,
    status: string,
    vendorName: string,
    serviceName: string
  ): void {
    this.customerNs.to(`customer:${customerId}`).emit('carwash:booking:status_updated', {
      bookingId,
      status,
      vendorName,
      serviceName,
      updatedAt: new Date().toISOString(),
    });
    logger.info(`carwash:booking:status_updated → customer ${customerId}`, { bookingId, status });
  }

  /**
   * Notify the vendor when a new booking arrives for their shop.
   */
  emitNewBookingToVendor(
    vendorId: string,
    bookingId: string,
    bookingType: string,
    serviceName: string,
    customerName: string,
    scheduledAt: string | null
  ): void {
    this.vendorNs.to(`vendor:${vendorId}`).emit('carwash:booking:new', {
      bookingId,
      bookingType,
      serviceName,
      customerName,
      scheduledAt,
      createdAt: new Date().toISOString(),
    });
    logger.info(`carwash:booking:new → vendor ${vendorId}`, { bookingId });
  }

  isCustomerOnline(userId: string): boolean {
    return this.customerSockets.has(userId);
  }

  isVendorOnline(vendorId: string): boolean {
    return this.vendorSockets.has(vendorId);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

let _instance: CarWashSocketService | null = null;

export function initCarWashSocketService(server: HTTPServer): CarWashSocketService {
  _instance = new CarWashSocketService(server);
  return _instance;
}

export function getCarWashSocketService(): CarWashSocketService | null {
  return _instance;
}
