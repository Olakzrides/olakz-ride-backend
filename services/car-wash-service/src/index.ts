import { createApp } from './app';
import { config, validateEnv } from './config/env';
import { testDatabaseConnection, disconnectDatabase } from './config/database';
import { logger } from './config/logger';

async function startServer() {
  try {
    validateEnv();
    logger.info('Environment variables validated');

    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) throw new Error('Database connection failed');

    const app = createApp();

    const server = app.listen(config.port, () => {
      logger.info(`🚗 Car Wash Service running on port ${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Health check: http://localhost:${config.port}/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully...`);
      server.close(async () => {
        await disconnectDatabase();
        logger.info('Car Wash Service shutdown complete');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start Car Wash Service:', err);
    process.exit(1);
  }
}

startServer();
