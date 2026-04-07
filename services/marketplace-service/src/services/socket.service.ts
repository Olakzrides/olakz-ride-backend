import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

let io: SocketServer | null = null;

export function initMarketplaceSocketService(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    },
  });

  const authMiddleware = (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      (socket as any).userId = decoded.sub || decoded.id || decoded.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  };

  // Customer namespace
  const customerNs = io.of('/marketplace-orders');
  customerNs.use(authMiddleware);
  customerNs.on('connection', (socket) => {
    const userId = (socket as any).userId;
    socket.join(`customer:${userId}`);
    logger.info('Customer connected to marketplace socket', { userId });
    socket.on('disconnect', () => logger.info('Customer disconnected from marketplace socket', { userId }));
  });

  // Vendor namespace
  const vendorNs = io.of('/marketplace-vendor');
  vendorNs.use(authMiddleware);
  vendorNs.on('connection', (socket) => {
    const userId = (socket as any).userId;
    socket.join(`vendor:${userId}`);
    logger.info('Vendor connected to marketplace socket', { userId });
    socket.on('disconnect', () => logger.info('Vendor disconnected from marketplace socket', { userId }));
  });

  // Rider namespace
  const riderNs = io.of('/marketplace-riders');
  riderNs.use(authMiddleware);
  riderNs.on('connection', (socket) => {
    const userId = (socket as any).userId;
    socket.join(`rider:${userId}`);
    logger.info('Rider connected to marketplace socket', { userId });
    socket.on('disconnect', () => logger.info('Rider disconnected from marketplace socket', { userId }));
  });

  logger.info('Marketplace Socket.IO initialized');
  return io;
}

export function getMarketplaceSocketService(): SocketServer | null {
  return io;
}

export function emitToCustomer(customerId: string, event: string, data: any) {
  io?.of('/marketplace-orders').to(`customer:${customerId}`).emit(event, data);
}

export function emitToVendor(vendorUserId: string, event: string, data: any) {
  io?.of('/marketplace-vendor').to(`vendor:${vendorUserId}`).emit(event, data);
}

export function broadcastToRiders(riderUserIds: string[], event: string, data: any) {
  const ns = io?.of('/marketplace-riders');
  if (!ns) return;
  riderUserIds.forEach((uid) => ns.to(`rider:${uid}`).emit(event, data));
}

export function emitToRider(riderUserId: string, event: string, data: any) {
  io?.of('/marketplace-riders').to(`rider:${riderUserId}`).emit(event, data);
}
