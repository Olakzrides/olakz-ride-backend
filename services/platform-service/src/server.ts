import dotenv from 'dotenv';

// Load environment variables FIRST
dotenv.config();

import app from './app';
import config from './config';
import logger from './utils/logger';
import Database from './utils/database';

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close database connection
    await Database.disconnect();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Try to connect to database (non-blocking)
    try {
      await Database.connect();
    } catch (dbError) {
      logger.warn('Database connection failed, starting with fallback mode:', dbError);
    }
    
    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info('===========================================');
      logger.info(`🚀 Platform Service Started Successfully!`);
      logger.info('===========================================');
      logger.info(`Environment: ${config.env}`);
      logger.info(`Port: ${config.port}`);
      logger.info(`Health Check: http://localhost:${config.port}/health`);
      logger.info(`Store Init: http://localhost:${config.port}/store/init`);
      logger.info('===========================================');
      logger.info('Available Endpoints:');
      logger.info('  - GET  /store/init (Store initialization)');
      logger.info('  - POST /services/select (Track service selection)');
      logger.info('  - GET  /services/context (User service context)');
      logger.info('===========================================');
      logger.info('CORS Allowed Origins:');
      config.cors.allowedOrigins.forEach(origin => {
        logger.info(`  - ${origin}`);
      });
      logger.info('===========================================');
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use`);
      } else {
        logger.error('Server error:', error);
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();