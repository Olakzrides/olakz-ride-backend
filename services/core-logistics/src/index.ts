import { createApp } from './app';
import { config, validateEnv } from './config/env';
import { testDatabaseConnection, disconnectDatabase, supabase } from './config/database';
import { logger } from './config/logger';
import { SocketService } from './services/socket.service';
import { RideMatchingService } from './services/ride-matching.service';
import { ScheduledRideService } from './services/scheduled-ride.service';
import { DeliverySchedulerService } from './modules/deliveries/services/delivery-scheduler.service';
import { CacheService } from './shared/utils/cache.service';
import { HireService } from './services/hire.service';
import { createServer } from 'http';

// Global services for real-time features
let socketService: SocketService;
let rideMatchingService: RideMatchingService;
let scheduledRideService: ScheduledRideService;

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

    // Initialize scheduled ride service
    scheduledRideService = new ScheduledRideService();
    scheduledRideService.setRideMatchingService(rideMatchingService);
    scheduledRideService.startCronJob();
    logger.info('Scheduled ride service initialized and cron job started');

    // Initialize cache service
    CacheService.initialize();
    logger.info('Cache service initialized');

    // Initialize delivery scheduler service
    DeliverySchedulerService.start();
    logger.info('Delivery scheduler service started');

    // Initialize hire watchdog — recovers stuck hires after redeploys/restarts
    const hireService = new HireService(socketService);
    hireService.startWatchdog();

    // ── 3-month broadcast notification cleanup ────────────────────────────────
    // Runs on startup then every 24 hours.
    // Deletes notification_history rows of type 'broadcast' older than 90 days.
    // Only affects broadcast notifications — ride/delivery/food notifications are unaffected.
    async function cleanupOldBroadcastNotifications(): Promise<void> {
      try {
        const { error } = await supabase.rpc('cleanup_old_broadcast_notifications');
        if (error) {
          // RPC not available — fallback direct delete
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
          await supabase
            .from('notification_history')
            .delete()
            .eq('notification_type', 'broadcast')
            .lt('sent_at', ninetyDaysAgo);
        }
        logger.info('Broadcast notification cleanup completed (3-month retention)');
      } catch (err: any) {
        logger.error('Broadcast notification cleanup error (non-fatal)', { error: err.message });
      }
    }

    await cleanupOldBroadcastNotifications();
    setInterval(cleanupOldBroadcastNotifications, 24 * 60 * 60 * 1000); // daily

    // Make services available globally
    app.set('socketService', socketService);
    app.set('rideMatchingService', rideMatchingService);
    app.set('scheduledRideService', scheduledRideService);

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
      
      // Stop scheduled ride cron job
      if (scheduledRideService) {
        scheduledRideService.stopCronJob();
      }
      
      // Stop delivery scheduler
      DeliverySchedulerService.stop();
      
      // Shutdown cache service
      CacheService.shutdown();
      
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
export { socketService, rideMatchingService, scheduledRideService };

startServer();
