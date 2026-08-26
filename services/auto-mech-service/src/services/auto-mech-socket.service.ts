/**
 * AutoMechSocketService
 *
 * Two namespaces:
 *   /auto-mech-customer  — customer tracks their booking status live
 *   /auto-mech-vendor    — vendor receives new booking notifications live
 *
 * Auth: JWT token passed as socket.handshake.auth.token
 */

import { Server as SocketIOServer, Socket, Namespace } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/database';
import { logger } from '../config/logger';
import { config } from '../config/env';

interface AutoMechSocket extends Socket {
  userId?:   string;
  vendorId?: string;
  userType?: 'customer' | 'vendor';
}

export class AutoMechSocketService {
  private io: SocketIOServer;
  private customerNs: Namespace;
  private vendorNs: Namespace;

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

    this.customerNs = this.io.of('/auto-mech-customer');
    this.vendorNs   = this.io.of('/auto-mech-vendor');

    this.setupNamespace(this.customerNs, 'customer');
    this.setupNamespace(this.vendorNs,   'vendor');

    logger.info('AutoMechSocketService initialized (/auto-mech-customer, /auto-mech-vendor)');
  }

  private setupNamespace(ns: Namespace, type: 'customer' | 'vendor'): void {
    ns.use(async (socket: AutoMechSocket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (!token) return next(new Error('Authentication token required'));

        const decoded = jwt.verify(token, config.jwtSecret) as any;
        const userId  = decoded.userId || decoded.id;

        socket.userId   = userId;
        socket.userType = type;

        if (type === 'vendor') {
          const { data: vendor } = await supabase
            .from('auto_mech_vendors')
            .select('id')
            .eq('user_id', userId)
            .single();

          if (!vendor) return next(new Error('Auto mech vendor profile not found'));
          socket.vendorId = vendor.id;
        }

        next();
      } catch (err) {
        logger.warn('AutoMech socket auth failed', { err });
        next(new Error('Authentication failed'));
      }
    });

    ns.on('connection', (socket: AutoMechSocket) => {
      this.handleConnection(socket, type);
    });
  }

  private handleConnection(socket: AutoMechSocket, type: 'customer' | 'vendor'): void {
    const { userId, vendorId } = socket;
    if (!userId) { socket.disconnect(); return; }

    if (type === 'customer') {
      this.customerSockets.set(userId, socket.id);
      socket.join(`customer:${userId}`);
      socket.emit('connected', { userId, userType: 'customer' });
      logger.info(`AutoMech customer socket connected: ${userId}`);
    } else if (type === 'vendor' && vendorId) {
      this.vendorSockets.set(vendorId, socket.id);
      socket.join(`vendor:${vendorId}`);
      socket.emit('connected', { userId, vendorId, userType: 'vendor' });
      logger.info(`AutoMech vendor socket connected: ${userId} (vendor: ${vendorId})`);
    }

    socket.on('disconnect', () => {
      if (type === 'customer') this.customerSockets.delete(userId);
      else if (type === 'vendor' && vendorId) this.vendorSockets.delete(vendorId);
      logger.info(`AutoMech socket disconnected: ${userId} (${type})`);
    });

    socket.on('ping', () => socket.emit('pong'));
  }

  emitBookingStatusToCustomer(
    customerId: string,
    bookingId: string,
    status: string,
    vendorName: string,
    serviceName: string
  ): void {
    this.customerNs.to(`customer:${customerId}`).emit('automech:booking:status_updated', {
      bookingId,
      status,
      vendorName,
      serviceName,
      updatedAt: new Date().toISOString(),
    });
    logger.info(`automech:booking:status_updated → customer ${customerId}`, { bookingId, status });
  }

  emitNewBookingToVendor(
    vendorId: string,
    bookingId: string,
    bookingType: string,
    serviceName: string,
    customerName: string,
    scheduledAt: string | null
  ): void {
    this.vendorNs.to(`vendor:${vendorId}`).emit('automech:booking:new', {
      bookingId,
      bookingType,
      serviceName,
      customerName,
      scheduledAt,
      createdAt: new Date().toISOString(),
    });
    logger.info(`automech:booking:new → vendor ${vendorId}`, { bookingId });
  }

  isCustomerOnline(userId: string): boolean {
    return this.customerSockets.has(userId);
  }

  isVendorOnline(vendorId: string): boolean {
    return this.vendorSockets.has(vendorId);
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

let _instance: AutoMechSocketService | null = null;

export function initAutoMechSocketService(server: HTTPServer): AutoMechSocketService {
  _instance = new AutoMechSocketService(server);
  return _instance;
}

export function getAutoMechSocketService(): AutoMechSocketService | null {
  return _instance;
}
