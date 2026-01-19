import dotenv from 'dotenv';
import app from './app';
import logger from './utils/logger';
import config from './config';

// Load environment variables
dotenv.config();

const PORT = config.port;

// Start server
const server = app.listen(PORT, () => {
  logger.info(`===========================================`);
  logger.info(`🚀 API Gateway started successfully`);
  logger.info(`===========================================`);
  logger.info(`Environment: ${config.env}`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Gateway URL: http://localhost:${PORT}`);
  logger.info(`Health Check: http://localhost:${PORT}/health`);
  logger.info(`===========================================`);
  logger.info(`Backend Services:`);
  logger.info(`  - Auth Service: ${config.services.auth.url}`);
  logger.info(`  - Logistics Service: ${config.services.logistics.url}`);
  logger.info(`  - Payment Service: ${config.services.payment.url}`);
  logger.info(`===========================================`);
  logger.info(`Rate Limits:`);
  logger.info(`  - General: ${config.rateLimit.maxRequests} requests per ${config.rateLimit.windowMs / 60000} minutes`);
  logger.info(`  - Auth routes: 10 requests per 15 minutes`);
  logger.info(`===========================================`);
  logger.info(`CORS Allowed Origins:`);
  config.cors.allowedOrigins.forEach((origin) => {
    logger.info(`  - ${origin}`);
  });
  logger.info(`===========================================`);
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
    logger.info('Shutdown complete. Goodbye! 👋');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: Error, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production, just log
  if (config.env === 'development') {
    gracefulShutdown('UNHANDLED_REJECTION');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

export default server;