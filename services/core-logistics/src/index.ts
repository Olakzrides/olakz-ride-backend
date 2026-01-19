import { createApp } from './app';
import { config, validateEnv } from './config/env';
import { testDatabaseConnection, disconnectDatabase } from './config/database';
import { logger } from './config/logger';
import { SocketService } from './services/socket.service';
import { RideMatchingService } from './services/ride-matching.service';
import { createServer } from 'http';

// Global services for real-time features
let socketService: SocketService;
let rideMatchingService: RideMatchingService;

async function startServer() {
  try {
    // Validate environment variables
    validateEnv();
    logger.info('Environment variables validated');

    // Test database connection
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Create Express app
    const app = createApp();

    // Create HTTP server for Socket.IO
    const server = createServer(app);

    // Initialize Socket.IO service
    socketService = new SocketService(server);
    logger.info('Socket.IO service initialized');

    // Initialize ride matching service
    rideMatchingService = new RideMatchingService(socketService);
    logger.info('Ride matching service initialized');

    // Make services available globally
    app.set('socketService', socketService);
    app.set('rideMatchingService', rideMatchingService);

    // Start server
    server.listen(config.port, () => {
      logger.info(`🚀 Core Logistics Service running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
      logger.info(`Socket.IO enabled for real-time features`);
      logger.info(`Connected drivers: ${socketService.getConnectedDriversCount()}`);
      logger.info(`Connected customers: ${socketService.getConnectedCustomersCount()}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        await disconnectDatabase();
        
        logger.info('Shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export services for use in other modules
export { socketService, rideMatchingService };

startServer();
