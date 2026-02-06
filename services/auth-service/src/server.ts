import dotenv from 'dotenv';
dotenv.config();

// Debug: Check if INTERNAL_API_KEY is loaded
console.log('🔍 Environment check after dotenv.config():', {
  hasInternalApiKey: !!process.env.INTERNAL_API_KEY,
  keyLength: process.env.INTERNAL_API_KEY?.length,
  keyPreview: process.env.INTERNAL_API_KEY?.substring(0, 10) + '...',
});

import app from './app';
import logger from './utils/logger';
import config from './config';
import { InitializationService } from './services/initialization.service';

const PORT = config.port;
const authBaseUrl =
  process.env.AUTH_BASE_URL || `http://localhost:${PORT}`;

// Initialize service and start server
async function startServer() {
  try {
    // Initialize admin users and other required data
    await InitializationService.initialize();

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`===========================================`);
      logger.info(`🚀 Auth Service started successfully`);
      logger.info(`===========================================`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`Port: ${PORT}`);
      logger.info(`Auth URL: ${authBaseUrl}`);
      logger.info(`===========================================`);
      logger.info(`Database: ${config.supabase.url}`);
      logger.info(`JWT Expiry: Access ${config.jwt.accessTokenExpiry}, Refresh ${config.jwt.refreshTokenExpiry}`);
      logger.info(`OTP: ${config.otp.length} digits, expires in ${config.otp.expiryMinutes} minutes`);
      logger.info(`===========================================`);
      logger.info(`Email: ${config.email.from.email}`);
      logger.info(`Google OAuth: ${config.google.clientId ? 'Enabled' : 'Disabled'}`);
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
    process.on('unhandledRejection', (reason: Error) => {
      logger.error('Unhandled Rejection:', reason);
      if (config.env === 'development') {
        gracefulShutdown('UNHANDLED_REJECTION');
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    return server;

  } catch (error) {
    logger.error('❌ Failed to start auth service:', error);
    process.exit(1);
  }
}

// Start the server
const server = startServer();

export default server;