import { createApp } from './app';
import { config, validateEnv } from './config/env';
import { testDatabaseConnection, disconnectDatabase } from './config/database';
import { logger } from './config/logger';
import { initAutoMechSocketService } from './services/auto-mech-socket.service';
import { createServer } from 'http';

async function startServer() {
  try {
    validateEnv();
    logger.info('Environment variables validated');

    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) throw new Error('Database connection failed');

    const app = createApp();

    // HTTP server needed for Socket.IO
    const server = createServer(app);

    // Initialize Socket.IO for real-time booking tracking
    initAutoMechSocketService(server);
    logger.info('AutoMech Socket.IO service initialized');

    server.listen(config.port, () => {
      logger.info(`🔧 Auto Mech Service running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
      logger.info(`Socket.IO: /auto-mech-customer  /auto-mech-vendor`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully...`);
      server.close(async () => {
        await disconnectDatabase();
        logger.info('Auto Mech Service shutdown complete');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start Auto Mech Service:', err);
    process.exit(1);
  }
}

startServer();
